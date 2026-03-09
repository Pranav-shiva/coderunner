// config/db.js
// PostgreSQL connection pool + schema bootstrap

const { Pool } = require('pg');

const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME     || 'coderunner',
  user:     process.env.DB_USER     || 'postgres',
  password: process.env.DB_PASSWORD || '',
  ssl: process.env.DB_SSL === 'true'
    ? { rejectUnauthorized: false }   // AWS RDS requires SSL
    : false,
  max:              10,   // max pool connections
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('[DB] Unexpected pool error:', err.message);
});

// ── Create tables if they don't exist ──
async function initSchema() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        email        VARCHAR(255) UNIQUE NOT NULL,
        password_hash TEXT        NOT NULL,
        created_at   TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS submissions (
        id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        language    VARCHAR(16) NOT NULL,
        code        TEXT        NOT NULL,
        code_hash   VARCHAR(64) NOT NULL,
        stdout      TEXT,
        stderr      TEXT,
        status      VARCHAR(16) NOT NULL DEFAULT 'success',
        cached      BOOLEAN     NOT NULL DEFAULT FALSE,
        exec_ms     INTEGER,
        created_at  TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_submissions_user   ON submissions(user_id);
      CREATE INDEX IF NOT EXISTS idx_submissions_hash   ON submissions(code_hash);
      CREATE INDEX IF NOT EXISTS idx_submissions_created ON submissions(created_at DESC);
    `);
    console.log('[DB] Schema ready');
  } finally {
    client.release();
  }
}

module.exports = { pool, initSchema };
