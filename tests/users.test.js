/**
 * Integration tests for POST /users
 *
 * Requirements:
 *  - Uses a real PostgreSQL database (no mocking)
 *  - Verifies the user is persisted in the DB after registration
 *  - Cleans up every row created during the test suite
 */

const request  = require('supertest');
const app      = require('../src/app');
const { pool, initDB } = require('../src/db');

// Collect IDs of every user created so we can wipe them afterwards
const createdUserIds = [];

// ─── Lifecycle hooks ─────────────────────────────────────────────────────────

beforeAll(async () => {
  // Ensure the users table exists before any test runs
  await initDB();
});

afterAll(async () => {
  // ── Clean up: delete only the rows this test suite created ──
  if (createdUserIds.length > 0) {
    await pool.query(
      `DELETE FROM users WHERE id = ANY($1::int[])`,
      [createdUserIds]
    );
  }
  // Close the connection pool so Jest can exit cleanly
  await pool.end();
});

// ─── Helper ──────────────────────────────────────────────────────────────────

/**
 * POST /users and track the new id for cleanup.
 */
async function registerUser(payload) {
  const res = await request(app).post('/users').send(payload);
  if (res.status === 201 && res.body.user?.id) {
    createdUserIds.push(res.body.user.id);
  }
  return res;
}

// ─── Test suite ──────────────────────────────────────────────────────────────

describe('POST /users – register a new user', () => {

  // ── Happy path ──────────────────────────────────────────────────────────

  test('returns 201 and the created user object', async () => {
    const payload = { name: 'Alice Smith', email: 'alice@example.com' };
    const res     = await registerUser(payload);

    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({
      name:  'Alice Smith',
      email: 'alice@example.com',
    });
    expect(res.body.user.id).toBeDefined();
    expect(res.body.user.created_at).toBeDefined();
  });

  test('persists the user in PostgreSQL (DB verification)', async () => {
    const payload = { name: 'Bob Jones', email: 'bob@example.com' };
    const res     = await registerUser(payload);

    expect(res.status).toBe(201);

    const { id } = res.body.user;

    // Query the database directly – no mocking
    const dbResult = await pool.query(
      'SELECT id, name, email FROM users WHERE id = $1',
      [id]
    );

    expect(dbResult.rows).toHaveLength(1);
    expect(dbResult.rows[0]).toMatchObject({
      id,
      name:  'Bob Jones',
      email: 'bob@example.com',
    });
  });

  test('stores email in lower-case', async () => {
    const payload = { name: 'Carol White', email: 'Carol@Example.COM' };
    const res     = await registerUser(payload);

    expect(res.status).toBe(201);

    const dbResult = await pool.query(
      'SELECT email FROM users WHERE id = $1',
      [res.body.user.id]
    );

    expect(dbResult.rows[0].email).toBe('carol@example.com');
  });

  test('GET /users/:id returns the same user after registration', async () => {
    const payload = { name: 'Dan Brown', email: 'dan@example.com' };
    const postRes = await registerUser(payload);

    expect(postRes.status).toBe(201);
    const { id } = postRes.body.user;

    const getRes = await request(app).get(`/users/${id}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.user).toMatchObject({ id, name: 'Dan Brown' });
  });

  // ── Duplicate email ─────────────────────────────────────────────────────

  test('returns 409 when email is already registered', async () => {
    const payload = { name: 'Eve First', email: 'eve@example.com' };

    const first  = await registerUser(payload);
    expect(first.status).toBe(201);

    const second = await request(app).post('/users').send({
      name:  'Eve Second',
      email: 'eve@example.com',
    });

    expect(second.status).toBe(409);
    expect(second.body.error).toMatch(/already registered/i);
  });

  // ── Validation errors ───────────────────────────────────────────────────

  test('returns 400 when name is missing', async () => {
    const res = await request(app)
      .post('/users')
      .send({ email: 'noname@example.com' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/name/i);
  });

  test('returns 400 when email is missing', async () => {
    const res = await request(app)
      .post('/users')
      .send({ name: 'No Email' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/email/i);
  });

  test('returns 400 when email format is invalid', async () => {
    const res = await request(app)
      .post('/users')
      .send({ name: 'Bad Email', email: 'not-an-email' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/email/i);
  });

  test('returns 400 when name is an empty string', async () => {
    const res = await request(app)
      .post('/users')
      .send({ name: '   ', email: 'empty@example.com' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/name/i);
  });
});