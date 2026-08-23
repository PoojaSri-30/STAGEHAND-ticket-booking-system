require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');

const authRoutes = require('./routes/auth');
const venueRoutes = require('./routes/venues');
const eventRoutes = require('./routes/events');
const bookingRoutes = require('./routes/bookings');
const waitlistRoutes = require('./routes/waitlist');

const { initRealtime, broadcastAll } = require('./services/realtime');
const { startScheduler } = require('./jobs/scheduler');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

app.use('/api/auth', authRoutes);
app.use('/api/venues', venueRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/waitlist', waitlistRoutes);

// 404 handler
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

// Generic error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 4000;
const server = http.createServer(app);

initRealtime(server);
startScheduler(broadcastAll);

server.listen(PORT, () => {
  console.log(`Ticket booking API listening on http://localhost:${PORT}`);
  console.log(`WebSocket server on ws://localhost:${PORT}/ws`);
});
