// tests/api.test.js
// Run with: npm test

const request = require('supertest');
const app     = require('../server');

// ── We mock the DB and Docker so tests run without infra ──
jest.mock('../config/db', () => ({
  pool: {
    query: jest.fn(),
  },
  initSchema: jest.fn().mockResolvedValue(),
}));

jest.mock('../services/dockerService', () => ({
  runInDocker: jest.fn().mockResolvedValue({
    stdout:  'Hello from CodeRunner!\n',
    stderr:  '',
    exitCode: 0,
    execMs:  120,
  }),
}));

const { pool }        = require('../config/db');
const { runInDocker } = require('../services/dockerService');

// ──────────────────────────────────────────
//  Auth tests
// ──────────────────────────────────────────
describe('POST /api/auth/signup', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 400 when email is missing', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .send({ password: 'Secret1!' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/required/i);
  });

  it('returns 400 for a weak password', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .send({ email: 'test@example.com', password: 'weak' });
    expect(res.status).toBe(400);
  });

  it('returns 409 when email already exists', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ id: 'existing-id' }] });
    const res = await request(app)
      .post('/api/auth/signup')
      .send({ email: 'dupe@example.com', password: 'Strong1!' });
    expect(res.status).toBe(409);
  });

  it('creates a user and returns a token', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [] })                          // no existing user
      .mockResolvedValueOnce({ rows: [{ id: 'new-uuid-123' }] });  // insert

    const res = await request(app)
      .post('/api/auth/signup')
      .send({ email: 'new@example.com', password: 'Strong1!' });

    expect(res.status).toBe(201);
    expect(res.body.token).toBeDefined();
    expect(res.body.userId).toBe('new-uuid-123');
  });
});

describe('POST /api/auth/login', () => {
  it('returns 401 for unknown email', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'whatever' });
    expect(res.status).toBe(401);
  });
});

// ──────────────────────────────────────────
//  Execute tests
// ──────────────────────────────────────────
describe('POST /api/execute', () => {
  // Helper: get a valid JWT for a fake user
  const jwt = require('jsonwebtoken');
  const fakeToken = () => jwt.sign(
    { userId: 'user-1', email: 'test@example.com' },
    process.env.JWT_SECRET || 'test-secret',
    { expiresIn: '1h' }
  );

  beforeAll(() => { process.env.JWT_SECRET = 'test-secret'; });
  beforeEach(() => jest.clearAllMocks());

  it('returns 401 without a token', async () => {
    const res = await request(app).post('/api/execute').send({ language: 'python', code: 'print(1)' });
    expect(res.status).toBe(401);
  });

  it('returns 400 for unsupported language', async () => {
    const res = await request(app)
      .post('/api/execute')
      .set('Authorization', `Bearer ${fakeToken()}`)
      .send({ language: 'ruby', code: 'puts "hi"' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/unsupported/i);
  });

  it('returns cached result when hash matches', async () => {
    pool.query.mockResolvedValueOnce({
      rows: [{ stdout: 'cached output\n', stderr: '', status: 'success' }]
    });

    const res = await request(app)
      .post('/api/execute')
      .set('Authorization', `Bearer ${fakeToken()}`)
      .send({ language: 'python', code: 'print("hi")' });

    expect(res.status).toBe(200);
    expect(res.body.cached).toBe(true);
    expect(res.body.stdout).toBe('cached output\n');
    expect(runInDocker).not.toHaveBeenCalled();
  });

  it('runs Docker and stores result on cache miss', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [] })   // cache miss
      .mockResolvedValueOnce({});            // insert

    const res = await request(app)
      .post('/api/execute')
      .set('Authorization', `Bearer ${fakeToken()}`)
      .send({ language: 'python', code: 'print("hello")' });

    expect(res.status).toBe(200);
    expect(res.body.cached).toBe(false);
    expect(res.body.stdout).toBe('Hello from CodeRunner!\n');
    expect(runInDocker).toHaveBeenCalledWith('python', 'print("hello")');
  });
});

// ──────────────────────────────────────────
//  Health check
// ──────────────────────────────────────────
describe('GET /health', () => {
  it('returns ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});
