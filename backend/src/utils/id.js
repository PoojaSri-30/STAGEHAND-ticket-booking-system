const { v4: uuidv4 } = require('uuid');

function id(prefix) {
  return `${prefix}_${uuidv4()}`;
}

function bookingRef() {
  // Human-friendly booking reference, e.g. BK-7F3K9Q2X
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let ref = '';
  for (let i = 0; i < 8; i++) ref += chars[Math.floor(Math.random() * chars.length)];
  return `BK-${ref}`;
}

module.exports = { id, bookingRef };
