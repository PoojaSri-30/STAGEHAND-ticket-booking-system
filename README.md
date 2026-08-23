# Stagehand — Ticket Booking System

A full-stack ticket booking platform for movies and concerts: visual seat maps,
TTL-based seat holds with auto-release, sold-out waitlists with automatic
seat re-assignment, and QR-coded email tickets.

## 🛠️ Tech Stack

### Backend
![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![Express](https://img.shields.io/badge/Express-000000?style=for-the-badge&logo=express&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-07405E?style=for-the-badge&logo=sqlite&logoColor=white)
![JWT](https://img.shields.io/badge/JWT-000000?style=for-the-badge&logo=jsonwebtokens&logoColor=white)
![WebSocket](https://img.shields.io/badge/WebSocket-010101?style=for-the-badge&logo=socketdotio&logoColor=white)

### Frontend
![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![Vite](https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white)
![React Router](https://img.shields.io/badge/React_Router-CA4245?style=for-the-badge&logo=reactrouter&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=for-the-badge&logo=css3&logoColor=white)

### Tools & Deployment
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)
![Git](https://img.shields.io/badge/Git-F05032?style=for-the-badge&logo=git&logoColor=white)
![GitHub](https://img.shields.io/badge/GitHub-181717?style=for-the-badge&logo=github&logoColor=white)
![Render](https://img.shields.io/badge/Render-46E3B7?style=for-the-badge&logo=render&logoColor=white)
![Vercel](https://img.shields.io/badge/Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white)

### Key Libraries
| Library | Purpose |
|---|---|
| `better-sqlite3` | Embedded SQLite database driver |
| `bcryptjs` | Password hashing |
| `jsonwebtoken` | Auth token signing/verification |
| `nodemailer` | Email delivery (booking confirmations, waitlist offers) |
| `qrcode` | QR code generation for tickets |
| `ws` | WebSocket server for real-time seat map updates |
| `react-router-dom` | Client-side routing |

```
ticket-booking-system/
├── backend/     Node.js + Express API, SQLite database, WebSocket server
├── frontend/    React (Vite) single-page app
└── docs/        System design write-up
```

---

## 1. Quick start

### Prerequisites
- Node.js 18+ and npm
- No external database needed — SQLite ships as a local file (`backend/data/ticketing.db`)

### Backend

```bash
cd backend
cp .env.example .env      # defaults work out of the box for local dev
npm install
npm run seed               # creates demo users, a venue, and a sample event
npm run dev                 # starts API on http://localhost:4000 (nodemon)
# or: npm start             # plain node, no auto-reload
```

Seed accounts (all password `password123`):

| Role      | Email                     |
|-----------|---------------------------|
| admin     | admin@ticketing.dev       |
| organiser | organiser@ticketing.dev   |
| customer  | customer@ticketing.dev    |
| customer  | customer2@ticketing.dev   |

### Frontend

```bash
cd frontend
cp .env.example .env       # points at http://localhost:4000/api by default
npm install
npm run dev                 # starts on http://localhost:5173
```

Open `http://localhost:5173`, log in with a seed account, and browse
"The Grand Premiere" (seeded event) to try the seat map, holds, checkout,
cancellation, and waitlist flow end to end.

### Email

No SMTP credentials are required to try the app. If `SMTP_HOST` /
`SMTP_USER` / `SMTP_PASS` are left blank in `backend/.env`, the backend
automatically creates a free [Ethereal](https://ethereal.email) test inbox
and prints a preview URL to the server console for every email sent
(booking confirmations and waitlist offers). To send real email, fill in
SMTP credentials for any provider (Gmail app password, SendGrid, Mailgun,
etc.) — no code changes needed.

---

## 2. Environment variables

### `backend/.env.example`
```
PORT=4000
NODE_ENV=development

JWT_SECRET=replace_this_with_a_long_random_secret
JWT_EXPIRES_IN=7d

DB_PATH=./data/ticketing.db

SEAT_HOLD_TTL_SECONDS=600          # how long a seat hold lasts before auto-release
WAITLIST_OFFER_TTL_SECONDS=900     # how long a waitlist offer lasts before cascading
SCHEDULER_INTERVAL_MS=15000        # how often expired holds/offers are swept

FRONTEND_URL=http://localhost:5173

SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM="Ticket Booking <no-reply@ticketbooking.dev>"
```

### `frontend/.env.example`
```
VITE_API_URL=http://localhost:4000/api
VITE_WS_URL=ws://localhost:4000/ws
```

---

## 3. Database schema

SQLite, via `better-sqlite3` (synchronous, single-file, zero setup). Schema
lives in `backend/src/db/index.js` and is created automatically on first run.

| Table            | Purpose |
|-------------------|---------|
| `users`           | Customers, organisers, admins. `role` enforced via CHECK constraint. |
| `venues`          | Physical venues, created by admins. |
| `venue_seats`     | The reusable seat **template** for a venue: row, seat number, category. |
| `events`          | A movie/concert listing: venue, date/time, type, status. |
| `event_pricing`   | Price per seat category, per event. |
| `show_seats`      | The live, bookable seat map for **one event** — one row per seat per show. This is what customers actually see and hold/book. Generated by copying `venue_seats` when an event is created. Status: `available` / `held` / `booked`. |
| `seat_holds`      | A group of `show_seats` a customer is holding during checkout, with `expires_at`. |
| `bookings`        | Confirmed purchases. `seat_ids` is a JSON array. Includes the QR data URL. |
| `waitlist`        | Per-event, per-category waitlist queue. `position` gives FIFO order. `status`: `waiting` → `offered` → `booked` / `expired` / `cancelled`. |
| `email_log`       | Record of every email sent (with Ethereal preview URL if applicable). |

**Why `venue_seats` and `show_seats` are separate:** a venue's physical
layout is reusable across many events, but seat *status* (available/held/
booked) is specific to a single showing. Cloning the layout into
`show_seats` per event means two different movies in the same hall on the
same day never interfere with each other's seat map.

---

## 4. Seat hold TTL & auto-release

Implemented in `backend/src/services/seatService.js` and
`backend/src/jobs/scheduler.js`.

1. When a customer selects seats and clicks **Hold seats**, `POST
   /api/bookings/hold` creates a `seat_holds` row with
   `expires_at = now + SEAT_HOLD_TTL_SECONDS` (default 10 minutes) and flips
   the matching `show_seats` rows to `status = 'held'`.
2. A background scheduler (`startScheduler`, default every 15s) calls
   `seatService.releaseExpiredHolds()`, which finds every `seat_holds` row
   with `status = 'active'` and `expires_at <= now`, releases its seats back
   to `available`, and marks the hold `released`.
3. The frontend also runs a live countdown against `expires_at` and, if it
   hits zero locally, immediately re-fetches the seat map — so the UI never
   shows a stale hold even in the few seconds before the next scheduler tick.
4. Explicit abandonment (`POST /api/bookings/hold/:id/release`) or a
   successful `POST /api/bookings/confirm` also close out the hold
   immediately, without waiting for the scheduler.

## 5. Concurrency protection

Two customers can select the same seat in the same instant. Correctness is
enforced with an atomic **conditional UPDATE**, not application-level
locking:

```sql
UPDATE show_seats
SET status = 'held', held_by = ?, hold_id = ?, hold_expires_at = ?, version = version + 1
WHERE id = ? AND event_id = ? AND status = 'available'
```

Whichever request's UPDATE statement executes first flips the row and
reports 1 row changed; the second request's identical UPDATE affects 0 rows
because `status` is no longer `'available'` by the time it runs — it fails
cleanly with no partial state. All seats in a multi-seat hold are updated
inside a single database transaction (`db.transaction(...)` in
better-sqlite3), so if *any* seat in the batch is already taken, the whole
hold attempt rolls back and the customer keeps none of the seats. This
pattern maps directly onto Postgres/MySQL as `SELECT ... FOR UPDATE` or the
same guarded `UPDATE ... WHERE status = 'available'`.

The included test (`backend/README section` / see `docs/design.md`) fires
two simultaneous hold requests for the same seat and confirms exactly one
succeeds.

## 6. Waitlist auto-assignment & time-limited offers

Implemented in `backend/src/services/waitlistService.js`.

1. **Joining:** once a category has zero `available` seats, customers can
   `POST /api/waitlist` to join a FIFO queue for that category
   (`position` is a monotonically increasing counter per event+category).
2. **Trigger:** whenever a booking is cancelled (`POST
   /api/bookings/:id/cancel`), the freed seats are grouped by category and
   passed to `offerFreedSeatsToWaitlist()`.
3. **Offer:** for each category with freed seats, the earliest waiting
   customer (lowest `position`) whose requested quantity fits the freed
   seats is offered exactly those seats. The seats are atomically flipped to
   `held` (same conditional-UPDATE pattern as regular holds) and the
   waitlist entry moves to `offered` with its own `offer_expires_at`
   (default 15 minutes). The customer is emailed a link to
   `/waitlist-offer/:id` with a live countdown.
4. **Accept:** `POST /api/waitlist/:id/accept` converts the held seats
   directly into a confirmed booking (with QR + email), the same way a
   normal checkout does.
5. **Decline / expire:** `POST /api/waitlist/:id/decline`, or the scheduler
   finding `offer_expires_at <= now` (`expireStaleOffers()`), releases the
   seats back to `available` and immediately re-runs
   `offerFreedSeatsToWaitlist()` for that category — cascading the offer to
   the next customer in line without any seat sitting idle.

This keeps a strict FIFO ordering per category while letting offers expire
and cascade automatically, exactly as required by the spec.

## 7. QR code & email delivery

- `backend/src/services/qrService.js` encodes `{ ref, bookingId, eventId }`
  as JSON into a QR code (via the `qrcode` package) as a base64 PNG data URL.
- `backend/src/services/emailService.js` sends the confirmation email with
  the QR image inline (as a CID attachment) via Nodemailer, falling back to
  a free Ethereal test account when no SMTP credentials are configured.
- The same QR data URL is also shown directly in the frontend's booking
  confirmation page, so entry staff (or the customer) can scan it without
  needing the email at all.

## 8. Real-time seat map updates

`backend/src/services/realtime.js` runs a WebSocket server at `/ws`.
Clients subscribe to an event id; any hold, release, booking, or
cancellation broadcasts a `seat_update` signal to subscribers of that event,
and the frontend refetches the seat map. A polling fallback (every 8s) is
also present in case WebSocket delivery is interrupted.

---

## 9. API reference

Base URL: `http://localhost:4000/api`. Authenticated routes expect
`Authorization: Bearer <jwt>`.

### Auth
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/auth/register` | — | `{ name, email, password, role? }` → user + token |
| POST | `/auth/login` | — | `{ email, password }` → user + token |
| GET  | `/auth/me` | ✓ | Current user |

### Venues (admin)
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/venues` | admin | `{ name, address, layout: [{ row, seatsInRow, category }] }` |
| GET  | `/venues` | ✓ | List all venues |
| GET  | `/venues/:id` | ✓ | Venue + its seat layout |
| DELETE | `/venues/:id` | admin | Delete a venue |

### Events
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/events` | organiser/admin | `{ venueId, title, description, type, eventDate, eventTime, pricing }` |
| GET  | `/events?type=&date=&q=` | — | Browse / filter published events |
| GET  | `/events/:id` | — | Event details + pricing |
| GET  | `/events/:id/seats` | — | Live seat map |
| GET  | `/events/:id/summary` | organiser/admin | Revenue & booking summary |

### Bookings
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/bookings/hold` | customer | `{ eventId, seatIds }` → holdId + TTL |
| POST | `/bookings/hold/:holdId/release` | ✓ | Abandon a hold early |
| POST | `/bookings/confirm` | customer | `{ holdId }` → booking + QR |
| GET  | `/bookings/my` | ✓ | Booking history |
| GET  | `/bookings/:id` | ✓ | Booking + seat detail |
| POST | `/bookings/:id/cancel` | ✓ | Cancel; triggers waitlist offers |

### Waitlist
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/waitlist` | customer | `{ eventId, category, quantity }` — only when sold out |
| GET  | `/waitlist/my` | ✓ | Your waitlist entries |
| GET  | `/waitlist/event/:eventId` | organiser/admin | Queue for an event |
| GET  | `/waitlist/:id` | ✓ | One entry (poll for offer status) |
| POST | `/waitlist/:id/accept` | customer | Accept offer → booking + QR |
| POST | `/waitlist/:id/decline` | customer | Decline → cascades to next in line |

---

## 10. Concurrency & waitlist test script

`backend` was verified with a manual integration test that:
1. Fires two simultaneous `POST /bookings/hold` for the same seat from two
   different customers — confirms exactly one succeeds (409 for the other).
2. Sells out a category, has a second customer join the waitlist, cancels
   the original booking, and confirms the waitlist entry automatically
   flips to `offered` with a live `offer_expires_at`.
3. Accepts the offer and confirms a booking + QR code are generated.

See `docs/design.md` for the full write-up.

---

## 11. Deployment notes

- **Backend:** deployable as-is to Render/Railway (Node service). SQLite's
  file-based storage works fine on a single instance with a persistent disk;
  for multi-instance deployments, point `DB_PATH` at a mounted volume, or
  swap `better-sqlite3` for `pg` — the conditional-UPDATE concurrency
  pattern in `seatService.js` and `waitlistService.js` works identically
  against Postgres.
- **Frontend:** `npm run build` produces a static `dist/` deployable to
  Vercel, Netlify, or any static host. Set `VITE_API_URL` /
  `VITE_WS_URL` to your deployed backend's URL and WebSocket endpoint.
