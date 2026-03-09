// routes/auth.js
// POST /api/auth/signup
// POST /api/auth/login

const express  = require('express');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const { pool } = require('../config/db');

const router = express.Router();

const BCRYPT_ROUNDS = 12;

// ── Helpers ──
function issueToken(userId, email) {
  return jwt.sign(
    { userId, email },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validatePassword(password) {
  const errors = [];
  if (!password || password.length < 8)  errors.push('At least 8 characters required.');
  if (!/[A-Z]/.test(password))           errors.push('At least one uppercase letter required.');
  if (!/[0-9]/.test(password))           errors.push('At least one number required.');
  return errors;
}

// ──────────────────────────────────────────
//  POST /api/auth/signup
// ──────────────────────────────────────────
router.post('/signup', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required.' });
    }
    if (!validateEmail(email)) {
      return res.status(400).json({ message: 'Invalid email address.' });
    }
    const pwErrors = validatePassword(password);
    if (pwErrors.length) {
      return res.status(400).json({ message: pwErrors[0] });
    }

    // Check for existing user
    const existing = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [email.toLowerCase()]
    );
    if (existing.rows.length) {
      return res.status(409).json({ message: 'An account with this email already exists.' });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    // Insert user
    const result = await pool.query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id',
      [email.toLowerCase(), passwordHash]
    );

    const userId = result.rows[0].id;
    const token  = issueToken(userId, email.toLowerCase());

    return res.status(201).json({ token, userId, email: email.toLowerCase() });

  } catch (err) {
    console.error('[signup]', err.message);
    return res.status(500).json({ message: 'Server error. Please try again.' });
  }
});

// ──────────────────────────────────────────
//  POST /api/auth/login
// ──────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required.' });
    }

    // Fetch user
    const result = await pool.query(
      'SELECT id, email, password_hash FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (!result.rows.length) {
      // Generic message to prevent user enumeration
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    const user = result.rows[0];
    const match = await bcrypt.compare(password, user.password_hash);

    if (!match) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    const token = issueToken(user.id, user.email);
    return res.status(200).json({ token, userId: user.id, email: user.email });

  } catch (err) {
    console.error('[login]', err.message);
    return res.status(500).json({ message: 'Server error. Please try again.' });
  }
});

module.exports = router;
