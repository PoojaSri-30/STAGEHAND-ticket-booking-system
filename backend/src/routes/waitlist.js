const express = require('express');
const db = require('../db');
const { id, bookingRef } = require('../utils/id');
const { authRequired, requireRole } = require('../middleware/auth');
const waitlistService = require('../services/waitlistService');
const seatService = require('../services/seatService');
const { generateBookingQR } = require('../services/qrService');
const { sendBookingConfirmation } = require('../services/emailService');
const { broadcastSeatUpdate } = require('../services/realtime');

const router = express.Router();

/** Join the waitlist for a sold-out category. body: { eventId, category, quantity } */
router.post('/', authRequired, requireRole('customer'), (req, res) => {
  const { eventId, category, quantity } = req.body;
  if (!eventId || !category) return res.status(400).json({ error: 'eventId and category are required' });

  const event = db.prepare(`SELECT id FROM events WHERE id = ?`).get(eventId);
  if (!event) return res.status(404).json({ error: 'Event not found' });

  // Sanity check: only allow joining waitlist if that category is actually sold out.
  const availableCount = db
    .prepare(`SELECT COUNT(*) as c FROM show_seats WHERE event_id = ? AND category = ? AND status = 'available'`)
    .get(eventId, category).c;
  if (availableCount > 0) {
    return res.status(400).json({ error: `${availableCount} seat(s) still available in ${category} -- book directly instead of waitlisting` });
  }

  const entry = waitlistService.joinWaitlist({
    eventId,
    customerId: req.user.id,
    category,
    quantity: quantity || 1,
  });
  res.status(201).json({ waitlistEntry: entry });
});

router.get('/my', authRequired, (req, res) => {
  const entries = waitlistService.getWaitlistForCustomer(req.user.id);
  res.json({ waitlist: entries });
});

/** Organiser view of the waitlist queue for one of their events. */
router.get('/event/:eventId', authRequired, requireRole('organiser', 'admin'), (req, res) => {
  const entries = waitlistService.getWaitlistForEvent(req.params.eventId);
  res.json({ waitlist: entries });
});

router.get('/:id', authRequired, (req, res) => {
  const entry = db.prepare(`SELECT * FROM waitlist WHERE id = ?`).get(req.params.id);
  if (!entry) return res.status(404).json({ error: 'Waitlist entry not found' });
  if (entry.customer_id !== req.user.id) return res.status(403).json({ error: 'Not your waitlist entry' });
  res.json({ waitlistEntry: entry });
});

/**
 * Customer accepts a time-limited waitlist offer and completes booking
 * immediately (no separate hold step -- the offer already reserved the seats).
 */
router.post('/:id/accept', authRequired, requireRole('customer'), async (req, res) => {
  try {
    const entry = waitlistService.acceptOffer({ waitlistId: req.params.id, customerId: req.user.id });
    const seatIds = JSON.parse(entry.offered_seat_ids);

    seatService.bookOfferedSeats({ seatIds, eventId: entry.event_id });

    const seats = db
      .prepare(`SELECT * FROM show_seats WHERE id IN (${seatIds.map(() => '?').join(',')})`)
      .all(...seatIds);
    const event = db.prepare(`SELECT * FROM events WHERE id = ?`).get(entry.event_id);
    const pricing = db.prepare(`SELECT category, price FROM event_pricing WHERE event_id = ?`).all(entry.event_id);
    const priceMap = Object.fromEntries(pricing.map((p) => [p.category, p.price]));
    const totalAmount = seats.reduce((sum, s) => sum + (priceMap[s.category] || 0), 0);

    const newBookingId = id('bk');
    const ref = bookingRef();
    db.prepare(
      `INSERT INTO bookings (id, booking_ref, event_id, customer_id, seat_ids, total_amount, status)
       VALUES (?, ?, ?, ?, ?, ?, 'confirmed')`
    ).run(newBookingId, ref, entry.event_id, req.user.id, JSON.stringify(seatIds), totalAmount);

    waitlistService.markWaitlistBooked(entry.id);

    const booking = db.prepare(`SELECT * FROM bookings WHERE id = ?`).get(newBookingId);
    const qrDataUrl = await generateBookingQR(booking);
    db.prepare(`UPDATE bookings SET qr_code_data = ? WHERE id = ?`).run(qrDataUrl, newBookingId);

    broadcastSeatUpdate(entry.event_id);

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
      console.error('Waitlist booking confirmation email failed:', mailErr.message);
    }

    res.status(201).json({ booking: { ...booking, qr_code_data: qrDataUrl }, seats, emailPreview });
  } catch (err) {
    const errorMap = {
      WAITLIST_ENTRY_NOT_FOUND: 404,
      NOT_YOUR_OFFER: 403,
      OFFER_NOT_ACTIVE: 409,
      OFFER_EXPIRED: 410,
      SEAT_STATE_CHANGED: 409,
    };
    const status = errorMap[err.message] || 500;
    res.status(status).json({ error: err.message });
  }
});

/** Customer declines an offer -- immediately cascades to the next in line. */
router.post('/:id/decline', authRequired, requireRole('customer'), (req, res) => {
  const entry = db.prepare(`SELECT * FROM waitlist WHERE id = ?`).get(req.params.id);
  if (!entry) return res.status(404).json({ error: 'Waitlist entry not found' });
  if (entry.customer_id !== req.user.id) return res.status(403).json({ error: 'Not your offer' });
  if (entry.status !== 'offered') return res.status(409).json({ error: 'Offer not active' });

  const seatIds = JSON.parse(entry.offered_seat_ids || '[]');
  const tx = db.transaction(() => {
    const releaseStmt = db.prepare(`
      UPDATE show_seats SET status = 'available', held_by = NULL, hold_id = NULL, hold_expires_at = NULL, version = version + 1
      WHERE id = ? AND status = 'held' AND held_by = ?
    `);
    for (const seatId of seatIds) releaseStmt.run(seatId, entry.customer_id);
    db.prepare(`UPDATE waitlist SET status = 'cancelled' WHERE id = ?`).run(entry.id);
  });
  tx();

  const offers = waitlistService.offerFreedSeatsToWaitlist({ eventId: entry.event_id, freedSeatIds: seatIds });
  broadcastSeatUpdate(entry.event_id);
  res.json({ success: true, cascadedOffers: offers.length });
});

module.exports = router;
