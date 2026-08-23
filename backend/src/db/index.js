const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const dbPath = process.env.DB_PATH || './data/ticketing.db';
const resolvedPath = path.resolve(__dirname, '../../', dbPath);
const dir = path.dirname(resolvedPath);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const db = new Database(resolvedPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ---------------------------------------------------------------------------
// SCHEMA
// ---------------------------------------------------------------------------
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('customer','organiser','admin')),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS venues (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now'))
);

-- A venue layout is a template: rows x seats, each seat assigned a category.
CREATE TABLE IF NOT EXISTS venue_seats (
  id TEXT PRIMARY KEY,
  venue_id TEXT NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  row_label TEXT NOT NULL,
  seat_number INTEGER NOT NULL,
  category TEXT NOT NULL,
  UNIQUE(venue_id, row_label, seat_number)
);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  organiser_id TEXT NOT NULL REFERENCES users(id),
  venue_id TEXT NOT NULL REFERENCES venues(id),
  title TEXT NOT NULL,
  description TEXT,
  type TEXT CHECK(type IN ('movie','concert')) NOT NULL,
  event_date TEXT NOT NULL,   -- ISO date
  event_time TEXT NOT NULL,   -- HH:MM
  status TEXT NOT NULL DEFAULT 'published' CHECK(status IN ('draft','published','cancelled')),
  created_at TEXT DEFAULT (datetime('now'))
);

-- Pricing per category, per event
CREATE TABLE IF NOT EXISTS event_pricing (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  price REAL NOT NULL,
  UNIQUE(event_id, category)
);

-- One row per seat per event ("show seat"). This is the live, bookable seat map.
-- status: available | held | booked
CREATE TABLE IF NOT EXISTS show_seats (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  venue_seat_id TEXT NOT NULL REFERENCES venue_seats(id),
  row_label TEXT NOT NULL,
  seat_number INTEGER NOT NULL,
  category TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'available' CHECK(status IN ('available','held','booked')),
  held_by TEXT REFERENCES users(id),
  hold_id TEXT,
  hold_expires_at TEXT,
  version INTEGER NOT NULL DEFAULT 0,  -- optimistic concurrency counter
  UNIQUE(event_id, venue_seat_id)
);

CREATE INDEX IF NOT EXISTS idx_show_seats_event ON show_seats(event_id);
CREATE INDEX IF NOT EXISTS idx_show_seats_status ON show_seats(event_id, status);

-- A "hold" groups 1+ show_seats a customer is currently holding during checkout
CREATE TABLE IF NOT EXISTS seat_holds (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id),
  customer_id TEXT NOT NULL REFERENCES users(id),
  seat_ids TEXT NOT NULL, -- JSON array of show_seats.id
  expires_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','released','converted')),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_seat_holds_expiry ON seat_holds(status, expires_at);

CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY,
  booking_ref TEXT UNIQUE NOT NULL,
  event_id TEXT NOT NULL REFERENCES events(id),
  customer_id TEXT NOT NULL REFERENCES users(id),
  seat_ids TEXT NOT NULL, -- JSON array of show_seats.id
  total_amount REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'confirmed' CHECK(status IN ('confirmed','cancelled')),
  qr_code_data TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  cancelled_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_bookings_customer ON bookings(customer_id);
CREATE INDEX IF NOT EXISTS idx_bookings_event ON bookings(event_id);

-- Waitlist: customer waits for a specific category on a sold-out event
CREATE TABLE IF NOT EXISTS waitlist (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id),
  customer_id TEXT NOT NULL REFERENCES users(id),
  category TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'waiting' CHECK(status IN ('waiting','offered','expired','booked','cancelled')),
  offered_seat_ids TEXT,       -- JSON array, set when offered
  offer_expires_at TEXT,
  position INTEGER,            -- fifo tiebreaker
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_waitlist_event_cat ON waitlist(event_id, category, status);

CREATE TABLE IF NOT EXISTS email_log (
  id TEXT PRIMARY KEY,
  to_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  preview_url TEXT,
  sent_at TEXT DEFAULT (datetime('now'))
);
`);

module.exports = db;
