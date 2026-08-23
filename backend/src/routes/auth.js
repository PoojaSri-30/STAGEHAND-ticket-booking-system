const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { id } = require('../utils/id');
const { signToken, authRequired } = require('../middleware/auth');

const router = express.Router();

router.post('/register', (req, res) => {
  const { name, email, password, role } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'name, email, and password are required' });
  }
  const allowedRoles = ['customer', 'organiser', 'admin'];
  const finalRole = allowedRoles.includes(role) ? role : 'customer';

  const existing = db.prepare(`SELECT id FROM users WHERE email = ?`).get(email.toLowerCase());
  if (existing) return res.status(409).json({ error: 'Email already registered' });

  const passwordHash = bcrypt.hashSync(password, 10);
  const userId = id('user');
  db.prepare(
    `INSERT INTO users (id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?)`
  ).run(userId, name, email.toLowerCase(), passwordHash, finalRole);

  const user = { id: userId, name, email: email.toLowerCase(), role: finalRole };
  const token = signToken(user);
  res.status(201).json({ user, token });
});

router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'email and password are required' });

  const user = db.prepare(`SELECT * FROM users WHERE email = ?`).get(email.toLowerCase());
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const token = signToken(user);
  res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role }, token });
});

router.get('/me', authRequired, (req, res) => {
  const user = db.prepare(`SELECT id, name, email, role FROM users WHERE id = ?`).get(req.user.id);
  res.json({ user });
});

module.exports = router;
