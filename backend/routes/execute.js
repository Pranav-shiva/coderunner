// routes/execute.js
// POST   /api/execute          — run code in Docker, cache results, store history
// GET    /api/execute/history  — fetch user's past submissions
// DELETE /api/execute/history/:id — delete a submission

const express         = require('express');
const rateLimit       = require('express-rate-limit');
const authMiddleware  = require('../middleware/authMiddleware');
const { runInDocker } = require('../services/dockerService');
const { hashCode }    = require('../services/hashService');
const { pool }        = require('../config/db');

const router = express.Router();

const SUPPORTED_LANGUAGES = ['python', 'java', 'cpp'];

// ── Per-user execution rate limiter ──
const executeLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000'),
  max:      parseInt(process.env.EXECUTE_RATE_LIMIT_MAX || '10'),
  keyGenerator: (req) => req.user?.id || req.ip,
  message: { message: 'Too many execution requests. Please wait before running again.' },
  standardHeaders: true,
  legacyHeaders:   false,
});

// ──────────────────────────────────────────
//  POST /api/execute
// ──────────────────────────────────────────
router.post('/', authMiddleware, executeLimiter, async (req, res) => {
  const { language, code } = req.body;
  const userId = req.user.id;

  // ── Input validation ──
  if (!language || !code) {
    return res.status(400).json({ message: 'language and code are required.' });
  }
  if (!SUPPORTED_LANGUAGES.includes(language)) {
    return res.status(400).json({ message: `Unsupported language. Supported: ${SUPPORTED_LANGUAGES.join(', ')}` });
  }
  if (typeof code !== 'string' || code.trim().length === 0) {
    return res.status(400).json({ message: 'Code cannot be empty.' });
  }
  if (code.length > 100_000) {
    return res.status(400).json({ message: 'Code exceeds maximum size (100 KB).' });
  }

  const codeHash = hashCode(language, code);

  try {
    // ── Cache lookup ──
    const cached = await pool.query(
      `SELECT stdout, stderr, status
       FROM submissions
       WHERE code_hash = $1
         AND language  = $2
         AND user_id   = $3
       ORDER BY created_at DESC
       LIMIT 1`,
      [codeHash, language, userId]
    );

    if (cached.rows.length) {
      const row = cached.rows[0];
      console.log(`[execute] Cache HIT  user=${userId} lang=${language} hash=${codeHash.slice(0, 8)}`);
      return res.status(200).json({
        stdout: row.stdout || '',
        stderr: row.stderr || '',
        status: row.status,
        cached: true,
        execMs: 0,
      });
    }

    // ── Run in Docker ──
    console.log(`[execute] Cache MISS user=${userId} lang=${language} — spawning Docker`);
    const result = await runInDocker(language, code);
    console.log(`[execute] Docker done exitCode=${result.exitCode} execMs=${result.execMs}`);

    // FIX: Declare all variables FIRST before using them anywhere
    // Previously: status was never declared, res.json() was called before DB insert,
    // causing a 500 "headers already sent" error and the DB insert never ran.
    const status = result.exitCode === 0 ? 'success' : 'error';
    const execMs = result.execMs || 0;
    const stdout = result.stdout || '';
    const stderr = result.stderr || '';

    // FIX: Insert into DB BEFORE sending the response
    await pool.query(
      `INSERT INTO submissions
         (user_id, language, code, code_hash, stdout, stderr, status, cached, exec_ms)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [userId, language, code, codeHash, stdout, stderr, status, false, execMs]
    );

    // FIX: Send ONE response, after everything is done
    return res.status(200).json({
      stdout,
      stderr,
      status,
      cached: false,
      execMs,
    });

  } catch (err) {
    console.error('[execute]', err.message);
    return res.status(500).json({ message: 'Execution failed. ' + err.message });
  }
});

// ──────────────────────────────────────────
//  GET /api/execute/history
// ──────────────────────────────────────────
router.get('/history', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const limit  = Math.min(parseInt(req.query.limit  || '50'), 100);
  const offset = parseInt(req.query.offset || '0');

  try {
    const result = await pool.query(
      `SELECT id, language, code, stdout, stderr, status, cached, exec_ms, created_at
       FROM submissions
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );

    return res.status(200).json({
      submissions: result.rows,
      total:       result.rowCount,
    });

  } catch (err) {
    console.error('[history]', err.message);
    return res.status(500).json({ message: 'Failed to fetch history.' });
  }
});

// ──────────────────────────────────────────
//  DELETE /api/execute/history/:id
// ──────────────────────────────────────────
router.delete('/history/:id', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const { id } = req.params;

  try {
    const result = await pool.query(
      'DELETE FROM submissions WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, userId]
    );

    if (!result.rowCount) {
      return res.status(404).json({ message: 'Submission not found.' });
    }
    return res.status(200).json({ message: 'Deleted.' });

  } catch (err) {
    console.error('[delete history]', err.message);
    return res.status(500).json({ message: 'Failed to delete submission.' });
  }
});

module.exports = router;
