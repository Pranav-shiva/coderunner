// server.js
// CodeRunner — Express entry point

require('dotenv').config();

const express    = require('express');
const cors       = require('cors');
const rateLimit  = require('express-rate-limit');
const { initSchema } = require('./config/db');

const authRoutes    = require('./routes/auth');
const executeRoutes = require('./routes/execute');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── CORS ──
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ── Body parsing ──
app.use(express.json({ limit: '200kb' }));
app.use(express.urlencoded({ extended: true }));

// ── Global rate limiter (all routes) ──
app.use(rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000'),
  max:      parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
  message:  { message: 'Too many requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders:   false,
}));

// ── Request logger (dev) ──
if (process.env.NODE_ENV !== 'production') {
  app.use((req, _res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
  });
}

// ── Health check ──
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  });
});

// ── API routes ──
app.use('/api/auth', require('./routes/auth'));
app.use('/api/execute', require('./routes/execute'));  // /api/execute, /api/history

// ── 404 handler ──
app.use((_req, res) => {
  res.status(404).json({ message: 'Route not found.' });
});

// ── Global error handler ──
app.use((err, _req, res, _next) => {
  console.error('[unhandled error]', err);
  res.status(500).json({ message: 'Internal server error.' });
});

// ── Boot ──
async function start() {
  try {
    await initSchema();
    app.listen(PORT, () => {
      console.log(`
╔══════════════════════════════════════╗
║   CodeRunner Backend  v1.0.0         ║
║   http://localhost:${PORT}               ║
╚══════════════════════════════════════╝
  ENV:      ${process.env.NODE_ENV || 'development'}
  DB:       ${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}
  JWT exp:  ${process.env.JWT_EXPIRES_IN || '7d'}
  Docker:   mem=${process.env.DOCKER_MEMORY_LIMIT} cpu=${process.env.DOCKER_CPU_LIMIT} timeout=${process.env.DOCKER_TIMEOUT_SECONDS}s
      `);
    });
  } catch (err) {
    console.error('[startup error]', err.message);
    process.exit(1);
  }
}

start();

module.exports = app; // for testing
