const db = require('../db');
const { id } = require('../utils/id');
require('dotenv').config();

const HOLD_TTL_SECONDS = Number(process.env.SEAT_HOLD_TTL_SECONDS) || 600;

function nowIso() {
  return new Date().toISOString();
}

function addSeconds(date, seconds) {
  return new Date(date.getTime() + seconds * 1000).toISOString();
}

/**
 * Attempts to hold a set of seats for a customer.
 *
 * Concurrency protection: for each seat we run an atomic conditional UPDATE
 * (`UPDATE show_seats SET status='held', version=version+1 WHERE id=? AND status='available'`)
 * inside a single SQLite transaction. SQLite/better-sqlite3 serializes writers,
 * so this UPDATE...WHERE pattern is race-free even under simultaneous requests:
 * whichever request's UPDATE executes first flips the row to 'held' and the
 * second request's UPDATE affects 0 rows (because status is no longer
 * 'available'), so it fails cleanly. If ANY seat in the batch fails to hold,
 * the whole transaction rolls back so the customer never ends up with a
 * partial hold. (The same WHERE-guarded UPDATE approach maps directly onto
 * Postgres/MySQL using SELECT ... FOR UPDATE or a plain conditional UPDATE.)
 */
function holdSeats({ eventId, customerId, seatIds, ttlSeconds = HOLD_TTL_SECONDS }) {
  const holdId = id('hold');
  const expiresAt = addSeconds(new Date(), ttlSeconds);

  const tx = db.transaction(() => {
    const updateStmt = db.prepare(`
      UPDATE show_seats
      SET status = 'held', held_by = ?, hold_id = ?, hold_expires_at = ?, version = version + 1
      WHERE id = ? AND event_id = ? AND status = 'available'
    `);

    const failedSeats = [];
    for (const seatId of seatIds) {
      const result = updateStmt.run(customerId, holdId, expiresAt, seatId, eventId);
      if (result.changes === 0) failedSeats.push(seatId);
    }

    if (failedSeats.length > 0) {
      // Roll back entire transaction -- throwing inside a better-sqlite3
      // transaction() automatically triggers ROLLBACK.
      const err = new Error('SEATS_UNAVAILABLE');
      err.failedSeats = failedSeats;
      throw err;
    }

    db.prepare(
      `INSERT INTO seat_holds (id, event_id, customer_id, seat_ids, expires_at, status)
       VALUES (?, ?, ?, ?, ?, 'active')`
    ).run(holdId, eventId, customerId, JSON.stringify(seatIds), expiresAt);

    return { holdId, expiresAt };
  });

  return tx();
}

/** Releases a hold (checkout abandonment, explicit cancel, or TTL expiry). */
function releaseHold(holdId) {
  const tx = db.transaction(() => {
    const hold = db.prepare(`SELECT * FROM seat_holds WHERE id = ?`).get(holdId);
    if (!hold || hold.status !== 'active') return null;

    const seatIds = JSON.parse(hold.seat_ids);
    const releaseStmt = db.prepare(`
      UPDATE show_seats
      SET status = 'available', held_by = NULL, hold_id = NULL, hold_expires_at = NULL, version = version + 1
      WHERE id = ? AND hold_id = ?
    `);
    for (const seatId of seatIds) releaseStmt.run(seatId, holdId);

    db.prepare(`UPDATE seat_holds SET status = 'released' WHERE id = ?`).run(holdId);
    return hold;
  });
  return tx();
}

/** Scheduler entry point: finds and releases all holds past their TTL. */
function releaseExpiredHolds() {
  const now = nowIso();
  const expired = db
    .prepare(`SELECT id FROM seat_holds WHERE status = 'active' AND expires_at <= ?`)
    .all(now);
  for (const row of expired) releaseHold(row.id);
  return expired.length;
}

/** Converts an active hold into a confirmed booking's seats (marks seats 'booked'). */
function confirmHoldSeats({ holdId, customerId, eventId }) {
  const tx = db.transaction(() => {
    const hold = db.prepare(`SELECT * FROM seat_holds WHERE id = ?`).get(holdId);
    if (!hold) throw new Error('HOLD_NOT_FOUND');
    if (hold.status !== 'active') throw new Error('HOLD_NOT_ACTIVE');
    if (hold.customer_id !== customerId) throw new Error('HOLD_NOT_OWNED');
    if (new Date(hold.expires_at) < new Date()) throw new Error('HOLD_EXPIRED');

    const seatIds = JSON.parse(hold.seat_ids);
    const bookStmt = db.prepare(`
      UPDATE show_seats
      SET status = 'booked', hold_id = NULL, hold_expires_at = NULL, version = version + 1
      WHERE id = ? AND hold_id = ? AND status = 'held'
    `);
    for (const seatId of seatIds) {
      const result = bookStmt.run(seatId, holdId);
      if (result.changes === 0) throw new Error('SEAT_STATE_CHANGED');
    }

    db.prepare(`UPDATE seat_holds SET status = 'converted' WHERE id = ?`).run(holdId);
    return seatIds;
  });
  return tx();
}

/** Directly books specific seats for a waitlist offer conversion (bypasses hold, seats already reserved via offer). */
function bookOfferedSeats({ seatIds, eventId }) {
  const tx = db.transaction(() => {
    const bookStmt = db.prepare(`
      UPDATE show_seats
      SET status = 'booked', held_by = NULL, hold_id = NULL, hold_expires_at = NULL, version = version + 1
      WHERE id = ? AND event_id = ? AND status = 'held'
    `);
    for (const seatId of seatIds) {
      const result = bookStmt.run(seatId, eventId);
      if (result.changes === 0) throw new Error('SEAT_STATE_CHANGED');
    }
  });
  return tx();
}

function getSeatMap(eventId) {
  return db
    .prepare(
      `SELECT id, row_label, seat_number, category, status, hold_expires_at
       FROM show_seats WHERE event_id = ? ORDER BY row_label, seat_number`
    )
    .all(eventId);
}

module.exports = {
  holdSeats,
  releaseHold,
  releaseExpiredHolds,
  confirmHoldSeats,
  bookOfferedSeats,
  getSeatMap,
  HOLD_TTL_SECONDS,
};
