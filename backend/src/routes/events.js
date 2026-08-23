const express = require('express');
const db = require('../db');
const { id } = require('../utils/id');
const { authRequired, requireRole } = require('../middleware/auth');
const { getSeatMap } = require('../services/seatService');

const router = express.Router();

/**
 * Organiser creates an event listing.
 * body: { venueId, title, description, type, eventDate, eventTime, pricing: { Premium: 25, Standard: 15 } }
 * On creation, a `show_seats` row is generated for every seat in the venue's
 * layout -- this is the live, per-show seat map that customers will book against.
 */
router.post('/', authRequired, requireRole('organiser', 'admin'), (req, res) => {
  const { venueId, title, description, type, eventDate, eventTime, pricing } = req.body;
  if (!venueId || !title || !type || !eventDate || !eventTime || !pricing) {
    return res.status(400).json({ error: 'venueId, title, type, eventDate, eventTime, pricing are required' });
  }

  const venue = db.prepare(`SELECT * FROM venues WHERE id = ?`).get(venueId);
  if (!venue) return res.status(404).json({ error: 'Venue not found' });

  const venueSeats = db.prepare(`SELECT * FROM venue_seats WHERE venue_id = ?`).all(venueId);
  if (venueSeats.length === 0) return res.status(400).json({ error: 'Venue has no seat layout' });

  const eventId = id('evt');
  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO events (id, organiser_id, venue_id, title, description, type, event_date, event_time, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'published')`
    ).run(eventId, req.user.id, venueId, title, description || '', type, eventDate, eventTime);

    const priceStmt = db.prepare(
      `INSERT INTO event_pricing (id, event_id, category, price) VALUES (?, ?, ?, ?)`
    );
    for (const [category, price] of Object.entries(pricing)) {
      priceStmt.run(id('price'), eventId, category, price);
    }

    const seatStmt = db.prepare(
      `INSERT INTO show_seats (id, event_id, venue_seat_id, row_label, seat_number, category, status)
       VALUES (?, ?, ?, ?, ?, ?, 'available')`
    );
    for (const vs of venueSeats) {
      seatStmt.run(id('sseat'), eventId, vs.id, vs.row_label, vs.seat_number, vs.category);
    }
  });
  tx();

  const event = db.prepare(`SELECT * FROM events WHERE id = ?`).get(eventId);
  const eventPricing = db.prepare(`SELECT category, price FROM event_pricing WHERE event_id = ?`).all(eventId);
  res.status(201).json({ event, pricing: eventPricing });
});

/** Browse / filter events. Query params: type, date, q (title search) */
router.get('/', (req, res) => {
  const { type, date, q } = req.query;
  let sql = `SELECT e.*, v.name as venue_name, v.address as venue_address
             FROM events e JOIN venues v ON e.venue_id = v.id
             WHERE e.status = 'published'`;
  const params = [];
  if (type) {
    sql += ` AND e.type = ?`;
    params.push(type);
  }
  if (date) {
    sql += ` AND e.event_date = ?`;
    params.push(date);
  }
  if (q) {
    sql += ` AND e.title LIKE ?`;
    params.push(`%${q}%`);
  }
  sql += ` ORDER BY e.event_date, e.event_time`;

  const events = db.prepare(sql).all(...params);
  res.json({ events });
});

router.get('/:id', (req, res) => {
  const event = db
    .prepare(
      `SELECT e.*, v.name as venue_name, v.address as venue_address
       FROM events e JOIN venues v ON e.venue_id = v.id WHERE e.id = ?`
    )
    .get(req.params.id);
  if (!event) return res.status(404).json({ error: 'Event not found' });

  const pricing = db.prepare(`SELECT category, price FROM event_pricing WHERE event_id = ?`).all(req.params.id);
  res.json({ event, pricing });
});

/** Real-time-ish seat map (poll or use WS `/ws` for push updates). */
router.get('/:id/seats', (req, res) => {
  const event = db.prepare(`SELECT id FROM events WHERE id = ?`).get(req.params.id);
  if (!event) return res.status(404).json({ error: 'Event not found' });
  const seats = getSeatMap(req.params.id);
  res.json({ seats });
});

/** Organiser: booking summary and revenue for one of their events. */
router.get('/:id/summary', authRequired, requireRole('organiser', 'admin'), (req, res) => {
  const event = db.prepare(`SELECT * FROM events WHERE id = ?`).get(req.params.id);
  if (!event) return res.status(404).json({ error: 'Event not found' });
  if (event.organiser_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Not your event' });
  }

  const bookings = db
    .prepare(`SELECT * FROM bookings WHERE event_id = ? AND status = 'confirmed'`)
    .all(req.params.id);

  const seatCounts = db
    .prepare(
      `SELECT category, status, COUNT(*) as count FROM show_seats WHERE event_id = ? GROUP BY category, status`
    )
    .all(req.params.id);

  const totalRevenue = bookings.reduce((sum, b) => sum + b.total_amount, 0);
  const totalSeatsSold = bookings.reduce((sum, b) => sum + JSON.parse(b.seat_ids).length, 0);
  const waitlistCount = db
    .prepare(`SELECT COUNT(*) as c FROM waitlist WHERE event_id = ? AND status IN ('waiting','offered')`)
    .get(req.params.id).c;

  res.json({
    event,
    totalRevenue,
    totalBookings: bookings.length,
    totalSeatsSold,
    seatCounts,
    waitlistCount,
  });
});

module.exports = router;
