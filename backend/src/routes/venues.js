const express = require('express');
const db = require('../db');
const { id } = require('../utils/id');
const { authRequired, requireRole } = require('../middleware/auth');

const router = express.Router();

/**
 * Create a venue with a seat layout.
 * body: { name, address, layout: [{ row, seatsInRow, category }] }
 * e.g. layout: [{ row: 'A', seatsInRow: 10, category: 'Premium' }, { row: 'B', seatsInRow: 12, category: 'Standard' }]
 */
router.post('/', authRequired, requireRole('admin'), (req, res) => {
  const { name, address, layout } = req.body;
  if (!name || !Array.isArray(layout) || layout.length === 0) {
    return res.status(400).json({ error: 'name and non-empty layout[] are required' });
  }

  const venueId = id('venue');
  const tx = db.transaction(() => {
    db.prepare(`INSERT INTO venues (id, name, address, created_by) VALUES (?, ?, ?, ?)`).run(
      venueId,
      name,
      address || null,
      req.user.id
    );

    const seatStmt = db.prepare(
      `INSERT INTO venue_seats (id, venue_id, row_label, seat_number, category) VALUES (?, ?, ?, ?, ?)`
    );
    for (const rowDef of layout) {
      for (let n = 1; n <= rowDef.seatsInRow; n++) {
        seatStmt.run(id('vseat'), venueId, rowDef.row, n, rowDef.category);
      }
    }
  });
  tx();

  const venue = db.prepare(`SELECT * FROM venues WHERE id = ?`).get(venueId);
  const seats = db.prepare(`SELECT * FROM venue_seats WHERE venue_id = ?`).all(venueId);
  res.status(201).json({ venue, seats });
});

router.get('/', authRequired, (req, res) => {
  const venues = db.prepare(`SELECT * FROM venues ORDER BY created_at DESC`).all();
  res.json({ venues });
});

router.get('/:id', authRequired, (req, res) => {
  const venue = db.prepare(`SELECT * FROM venues WHERE id = ?`).get(req.params.id);
  if (!venue) return res.status(404).json({ error: 'Venue not found' });
  const seats = db
    .prepare(`SELECT * FROM venue_seats WHERE venue_id = ? ORDER BY row_label, seat_number`)
    .all(req.params.id);
  res.json({ venue, seats });
});

router.delete('/:id', authRequired, requireRole('admin'), (req, res) => {
  const result = db.prepare(`DELETE FROM venues WHERE id = ?`).run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Venue not found' });
  res.json({ success: true });
});

module.exports = router;
