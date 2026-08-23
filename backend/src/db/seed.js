require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('./index');
const { id } = require('../utils/id');

function upsertUser(name, email, password, role) {
  const existing = db.prepare(`SELECT * FROM users WHERE email = ?`).get(email);
  if (existing) return existing;
  const userId = id('user');
  db.prepare(`INSERT INTO users (id, name, email, password_hash, role) VALUES (?,?,?,?,?)`).run(
    userId,
    name,
    email,
    bcrypt.hashSync(password, 10),
    role
  );
  return db.prepare(`SELECT * FROM users WHERE id = ?`).get(userId);
}

const admin = upsertUser('Ada Admin', 'admin@ticketing.dev', 'password123', 'admin');
const organiser = upsertUser('Oscar Organiser', 'organiser@ticketing.dev', 'password123', 'organiser');
const customer1 = upsertUser('Cara Customer', 'customer@ticketing.dev', 'password123', 'customer');
const customer2 = upsertUser('Charlie Customer', 'customer2@ticketing.dev', 'password123', 'customer');

console.log('Seeded users:');
console.log('  admin@ticketing.dev / password123');
console.log('  organiser@ticketing.dev / password123');
console.log('  customer@ticketing.dev / password123');
console.log('  customer2@ticketing.dev / password123');

// Small venue so it's easy to sell out during a demo of the waitlist flow.
let venue = db.prepare(`SELECT * FROM venues WHERE name = ?`).get('Downtown Cinema Hall 1');
if (!venue) {
  const venueId = id('venue');
  db.prepare(`INSERT INTO venues (id, name, address, created_by) VALUES (?,?,?,?)`).run(
    venueId,
    'Downtown Cinema Hall 1',
    '123 Main St, Springfield',
    admin.id
  );
  const seatStmt = db.prepare(
    `INSERT INTO venue_seats (id, venue_id, row_label, seat_number, category) VALUES (?,?,?,?,?)`
  );
  // Row A: Premium (6 seats), Row B & C: Standard (8 seats each)
  for (let n = 1; n <= 6; n++) seatStmt.run(id('vseat'), venueId, 'A', n, 'Premium');
  for (let n = 1; n <= 8; n++) seatStmt.run(id('vseat'), venueId, 'B', n, 'Standard');
  for (let n = 1; n <= 8; n++) seatStmt.run(id('vseat'), venueId, 'C', n, 'Standard');
  venue = db.prepare(`SELECT * FROM venues WHERE id = ?`).get(venueId);
  console.log(`Seeded venue: ${venue.name} (22 seats: 6 Premium, 16 Standard)`);
} else {
  console.log(`Venue already exists: ${venue.name}`);
}

let event = db.prepare(`SELECT * FROM events WHERE title = ?`).get('The Grand Premiere');
if (!event) {
  const eventId = id('evt');
  db.prepare(
    `INSERT INTO events (id, organiser_id, venue_id, title, description, type, event_date, event_time, status)
     VALUES (?,?,?,?,?,?,?,?, 'published')`
  ).run(
    eventId,
    organiser.id,
    venue.id,
    'The Grand Premiere',
    'Opening night screening with live Q&A.',
    'movie',
    '2026-09-15',
    '19:30'
  );
  db.prepare(`INSERT INTO event_pricing (id, event_id, category, price) VALUES (?,?,?,?)`).run(
    id('price'),
    eventId,
    'Premium',
    25
  );
  db.prepare(`INSERT INTO event_pricing (id, event_id, category, price) VALUES (?,?,?,?)`).run(
    id('price'),
    eventId,
    'Standard',
    15
  );

  const venueSeats = db.prepare(`SELECT * FROM venue_seats WHERE venue_id = ?`).all(venue.id);
  const seatStmt = db.prepare(
    `INSERT INTO show_seats (id, event_id, venue_seat_id, row_label, seat_number, category, status)
     VALUES (?,?,?,?,?,?, 'available')`
  );
  for (const vs of venueSeats) {
    seatStmt.run(id('sseat'), eventId, vs.id, vs.row_label, vs.seat_number, vs.category);
  }
  event = db.prepare(`SELECT * FROM events WHERE id = ?`).get(eventId);
  console.log(`Seeded event: ${event.title} on ${event.event_date} at ${event.event_time}`);
} else {
  console.log(`Event already exists: ${event.title}`);
}

console.log('\nSeed complete.');
