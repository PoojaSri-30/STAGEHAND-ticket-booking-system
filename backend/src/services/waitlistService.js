const db = require('../db');
const { id } = require('../utils/id');
require('dotenv').config();

const OFFER_TTL_SECONDS = Number(process.env.WAITLIST_OFFER_TTL_SECONDS) || 900;

function addSeconds(date, seconds) {
  return new Date(date.getTime() + seconds * 1000).toISOString();
}

/** Customer joins the waitlist for a category on a (presumably sold-out) event. */
function joinWaitlist({ eventId, customerId, category, quantity = 1 }) {
  const maxPos = db
    .prepare(`SELECT COALESCE(MAX(position), 0) as p FROM waitlist WHERE event_id = ? AND category = ?`)
    .get(eventId, category).p;

  const entryId = id('wl');
  db.prepare(
    `INSERT INTO waitlist (id, event_id, customer_id, category, quantity, status, position)
     VALUES (?, ?, ?, ?, ?, 'waiting', ?)`
  ).run(entryId, eventId, customerId, category, quantity, maxPos + 1);

  return db.prepare(`SELECT * FROM waitlist WHERE id = ?`).get(entryId);
}

/**
 * Called after a cancellation (or hold release) frees up seats. Looks at each
 * distinct category among the freed seats and, if there's a waiting customer
 * for that category (FIFO by `position`), holds the seat(s) for them under a
 * time-limited offer instead of leaving them generally available.
 *
 * This uses the same atomic conditional-UPDATE pattern as seatService.holdSeats
 * to avoid racing with a concurrent direct booking of the same seat.
 */
function offerFreedSeatsToWaitlist({ eventId, freedSeatIds }) {
  if (!freedSeatIds || freedSeatIds.length === 0) return [];

  const placeholders = freedSeatIds.map(() => '?').join(',');
  const freedSeats = db
    .prepare(`SELECT * FROM show_seats WHERE id IN (${placeholders})`)
    .all(...freedSeatIds);

  const byCategory = {};
  for (const seat of freedSeats) {
    if (seat.status !== 'available') continue; // only truly free seats
    byCategory[seat.category] = byCategory[seat.category] || [];
    byCategory[seat.category].push(seat);
  }

  const offersMade = [];

  for (const category of Object.keys(byCategory)) {
    const availableSeats = byCategory[category];
    // Process one waiting customer at a time, in FIFO order, until we run out
    // of freed seats in this category or run out of waiting customers.
    let seatPool = [...availableSeats];

    // eslint-disable-next-line no-constant-condition
    while (seatPool.length > 0) {
      const nextInLine = db
        .prepare(
          `SELECT * FROM waitlist WHERE event_id = ? AND category = ? AND status = 'waiting'
           ORDER BY position ASC LIMIT 1`
        )
        .get(eventId, category);

      if (!nextInLine) break;
      if (nextInLine.quantity > seatPool.length) break; // not enough freed seats yet for this request

      const seatsForOffer = seatPool.splice(0, nextInLine.quantity);
      const seatIds = seatsForOffer.map((s) => s.id);
      const offerId = id('offer');
      const expiresAt = addSeconds(new Date(), OFFER_TTL_SECONDS);

      const tx = db.transaction(() => {
        const holdStmt = db.prepare(`
          UPDATE show_seats
          SET status = 'held', held_by = ?, hold_id = ?, hold_expires_at = ?, version = version + 1
          WHERE id = ? AND status = 'available'
        `);
        for (const seatId of seatIds) {
          const result = holdStmt.run(nextInLine.customer_id, offerId, expiresAt, seatId);
          if (result.changes === 0) throw new Error('SEAT_RACE_LOST');
        }
        db.prepare(
          `UPDATE waitlist SET status = 'offered', offered_seat_ids = ?, offer_expires_at = ? WHERE id = ?`
        ).run(JSON.stringify(seatIds), expiresAt, nextInLine.id);
      });

      try {
        tx();
        offersMade.push({
          waitlistId: nextInLine.id,
          customerId: nextInLine.customer_id,
          eventId,
          category,
          seatIds,
          offerId,
          expiresAt,
        });
      } catch (e) {
        // Someone else grabbed a seat between our SELECT and UPDATE (e.g. a
        // direct booking raced us) -- put remaining seats back in the pool
        // for a fresh look on the next scheduler tick, and move on.
        break;
      }
    }
  }

  return offersMade;
}

/** Waitlisted customer accepts and completes booking within the offer window. */
function acceptOffer({ waitlistId, customerId }) {
  const entry = db.prepare(`SELECT * FROM waitlist WHERE id = ?`).get(waitlistId);
  if (!entry) throw new Error('WAITLIST_ENTRY_NOT_FOUND');
  if (entry.customer_id !== customerId) throw new Error('NOT_YOUR_OFFER');
  if (entry.status !== 'offered') throw new Error('OFFER_NOT_ACTIVE');
  if (new Date(entry.offer_expires_at) < new Date()) throw new Error('OFFER_EXPIRED');

  return entry;
}

function markWaitlistBooked(waitlistId) {
  db.prepare(`UPDATE waitlist SET status = 'booked' WHERE id = ?`).run(waitlistId);
}

/**
 * Scheduler entry point: finds offers past their TTL, releases the held
 * seats back to 'available', marks the offer 'expired', then immediately
 * re-triggers the offer flow so the seat cascades to the next person in line.
 */
function expireStaleOffers() {
  const now = new Date().toISOString();
  const stale = db
    .prepare(`SELECT * FROM waitlist WHERE status = 'offered' AND offer_expires_at <= ?`)
    .all(now);

  let cascaded = 0;
  for (const entry of stale) {
    const seatIds = JSON.parse(entry.offered_seat_ids || '[]');

    const tx = db.transaction(() => {
      const releaseStmt = db.prepare(`
        UPDATE show_seats
        SET status = 'available', held_by = NULL, hold_id = NULL, hold_expires_at = NULL, version = version + 1
        WHERE id = ? AND status = 'held' AND held_by = ?
      `);
      for (const seatId of seatIds) releaseStmt.run(seatId, entry.customer_id);
      db.prepare(`UPDATE waitlist SET status = 'expired' WHERE id = ?`).run(entry.id);
    });
    tx();

    // Seat is free again -- offer it to the next person in line for this category.
    const newOffers = offerFreedSeatsToWaitlist({ eventId: entry.event_id, freedSeatIds: seatIds });
    cascaded += newOffers.length;
  }

  return { expiredCount: stale.length, cascaded };
}

function getWaitlistForEvent(eventId) {
  return db
    .prepare(`SELECT * FROM waitlist WHERE event_id = ? ORDER BY category, position`)
    .all(eventId);
}

function getWaitlistForCustomer(customerId) {
  return db
    .prepare(`SELECT * FROM waitlist WHERE customer_id = ? ORDER BY created_at DESC`)
    .all(customerId);
}

module.exports = {
  joinWaitlist,
  offerFreedSeatsToWaitlist,
  acceptOffer,
  markWaitlistBooked,
  expireStaleOffers,
  getWaitlistForEvent,
  getWaitlistForCustomer,
  OFFER_TTL_SECONDS,
};
