const express = require('express');
const db = require('../db');
const { id, bookingRef } = require('../utils/id');
const { authRequired, requireRole } = require('../middleware/auth');
const seatService = require('../services/seatService');
const waitlistService = require('../services/waitlistService');
const { generateBookingQR } = require('../services/qrService');
const { sendBookingConfirmation, sendWaitlistOffer } = require('../services/emailService');
const { broadcastSeatUpdate } = require('../services/realtime');

const router = express.Router();

/**
 * Place a temporary hold on seats while the customer checks out.
 * body: { eventId, seatIds: [...] }
 * Concurrency-safe: see seatService.holdSeats.
 */
router.post('/hold', authRequired, requireRole('customer'), (req, res) => {
  const { eventId, seatIds } = req.body;
  if (!eventId || !Array.isArray(seatIds) || seatIds.length === 0) {
    return res.status(400).json({ error: 'eventId and non-empty seatIds[] are required' });
  }

  try {
    const { holdId, expiresAt } = seatService.holdSeats({ eventId, customerId: req.user.id, seatIds });
    broadcastSeatUpdate(eventId);
    res.status(201).json({ holdId, expiresAt, ttlSeconds: seatService.HOLD_TTL_SECONDS });
  } catch (err) {
    if (err.message === 'SEATS_UNAVAILABLE') {
      return res.status(409).json({ error: 'One or more selected seats are no longer available', failedSeats: err.failedSeats });
    }
    console.error(err);
    res.status(500).json({ error: 'Failed to hold seats' });
  }
});

/** Customer explicitly abandons checkout -- releases their hold early. */
router.post('/hold/:holdId/release', authRequired, (req, res) => {
  const hold = db.prepare(`SELECT * FROM seat_holds WHERE id = ?`).get(req.params.holdId);
  if (!hold) return res.status(404).json({ error: 'Hold not found' });
  if (hold.customer_id !== req.user.id) return res.status(403).json({ error: 'Not your hold' });

  seatService.releaseHold(req.params.holdId);
  broadcastSeatUpdate(hold.event_id);
  res.json({ success: true });
});

/**
 * Confirm a booking from an active hold: charges (simulated), marks seats
 * booked, generates a QR ticket, and emails the customer.
 * body: { holdId }
 */
router.post('/confirm', authRequired, requireRole('customer'), async (req, res) => {
  const { holdId } = req.body;
  if (!holdId) return res.status(400).json({ error: 'holdId is required' });

  const hold = db.prepare(`SELECT * FROM seat_holds WHERE id = ?`).get(holdId);
  if (!hold) return res.status(404).json({ error: 'Hold not found' });

  try {
    const seatIds = seatService.confirmHoldSeats({ holdId, customerId: req.user.id, eventId: hold.event_id });

    const seats = db
      .prepare(`SELECT * FROM show_seats WHERE id IN (${seatIds.map(() => '?').join(',')})`)
      .all(...seatIds);
    const event = db.prepare(`SELECT * FROM events WHERE id = ?`).get(hold.event_id);
    const pricing = db.prepare(`SELECT category, price FROM event_pricing WHERE event_id = ?`).all(hold.event_id);
    const priceMap = Object.fromEntries(pricing.map((p) => [p.category, p.price]));
    const totalAmount = seats.reduce((sum, s) => sum + (priceMap[s.category] || 0), 0);

    const newBookingId = id('bk');
    const ref = bookingRef();
    db.prepare(
      `INSERT INTO bookings (id, booking_ref, event_id, customer_id, seat_ids, total_amount, status)
       VALUES (?, ?, ?, ?, ?, ?, 'confirmed')`
    ).run(newBookingId, ref, hold.event_id, req.user.id, JSON.stringify(seatIds), totalAmount);

    const booking = db.prepare(`SELECT * FROM bookings WHERE id = ?`).get(newBookingId);
    const qrDataUrl = await generateBookingQR(booking);
    db.prepare(`UPDATE bookings SET qr_code_data = ? WHERE id = ?`).run(qrDataUrl, newBookingId);

    broadcastSeatUpdate(hold.event_id);

    // Email is sent async-ish but awaited so API response confirms delivery attempt.
    let emailPreview = null;
    try {
      const customer = db.prepare(`SELECT * FROM users WHERE id = ?`).get(req.user.id);
      const result = await sendBookingConfirmation({
        to: customer.email,
        name: customer.name,
        booking,
        event,
        seats,
        qrDataUrl,
      });
      emailPreview = result.previewUrl;
    } catch (mailErr) {
      console.error('Booking confirmation email failed:', mailErr.message);
    }

    res.status(201).json({ booking: { ...booking, qr_code_data: qrDataUrl }, seats, emailPreview });
  } catch (err) {
    console.error(err);
    const errorMap = {
      HOLD_NOT_FOUND: 404,
      HOLD_NOT_ACTIVE: 409,
      HOLD_NOT_OWNED: 403,
      HOLD_EXPIRED: 410,
      SEAT_STATE_CHANGED: 409,
    };
    const status = errorMap[err.message] || 500;
    res.status(status).json({ error: err.message || 'Failed to confirm booking' });
  }
});

/** Customer's booking history. */
router.get('/my', authRequired, (req, res) => {
  const bookings = db
    .prepare(
      `SELECT b.*, e.title as event_title, e.event_date, e.event_time
       FROM bookings b JOIN events e ON b.event_id = e.id
       WHERE b.customer_id = ? ORDER BY b.created_at DESC`
    )
    .all(req.user.id);
  res.json({ bookings });
});

router.get('/:id', authRequired, (req, res) => {
  const booking = db.prepare(`SELECT * FROM bookings WHERE id = ?`).get(req.params.id);
  if (!booking) return res.status(404).json({ error: 'Booking not found' });
  if (booking.customer_id !== req.user.id && req.user.role === 'customer') {
    return res.status(403).json({ error: 'Not your booking' });
  }
  const seatIds = JSON.parse(booking.seat_ids);
  const seats = db
    .prepare(`SELECT * FROM show_seats WHERE id IN (${seatIds.map(() => '?').join(',')})`)
    .all(...seatIds);
  res.json({ booking, seats });
});

/**
 * Cancel a confirmed booking. This is the trigger for waitlist auto-assignment:
 * the freed seats are immediately offered to the next customer(s) in line for
 * that category, and those customers get a time-limited email offer.
 */
router.post('/:id/cancel', authRequired, async (req, res) => {
  const booking = db.prepare(`SELECT * FROM bookings WHERE id = ?`).get(req.params.id);
  if (!booking) return res.status(404).json({ error: 'Booking not found' });
  if (booking.customer_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Not your booking' });
  }
  if (booking.status !== 'confirmed') return res.status(409).json({ error: 'Booking already cancelled' });

  const seatIds = JSON.parse(booking.seat_ids);

  const tx = db.transaction(() => {
    db.prepare(`UPDATE bookings SET status = 'cancelled', cancelled_at = datetime('now') WHERE id = ?`).run(
      booking.id
    );
    const releaseStmt = db.prepare(`
      UPDATE show_seats SET status = 'available', held_by = NULL, hold_id = NULL, hold_expires_at = NULL, version = version + 1
      WHERE id = ?
    `);
    for (const seatId of seatIds) releaseStmt.run(seatId);
  });
  tx();

  // Waitlist auto-assignment: try to offer the newly freed seats to the next
  // customer(s) in line for their category.
  const offers = waitlistService.offerFreedSeatsToWaitlist({ eventId: booking.event_id, freedSeatIds: seatIds });

  broadcastSeatUpdate(booking.event_id);

  // Notify each offered customer by email with a time-limited link.
  const event = db.prepare(`SELECT * FROM events WHERE id = ?`).get(booking.event_id);
  for (const offer of offers) {
    try {
      const customer = db.prepare(`SELECT * FROM users WHERE id = ?`).get(offer.customerId);
      const offerSeats = db
        .prepare(`SELECT * FROM show_seats WHERE id IN (${offer.seatIds.map(() => '?').join(',')})`)
        .all(...offer.seatIds);
      const offerUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/waitlist-offer/${offer.waitlistId}`;
      await sendWaitlistOffer({
        to: customer.email,
        name: customer.name,
        event,
        seats: offerSeats,
        waitlistEntry: offer,
        offerUrl,
        expiresAt: offer.expiresAt,
      });
    } catch (mailErr) {
      console.error('Waitlist offer email failed:', mailErr.message);
    }
  }

  res.json({ success: true, waitlistOffersTriggered: offers.length });
});

module.exports = router;
