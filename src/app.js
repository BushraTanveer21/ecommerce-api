const express = require('express');
const { pool } = require('./db');

const app = express();
app.use(express.json());

// ─── POST /users ────────────────────────────────────────────────────────────
// Register a new user.
// Body: { name: string, email: string }
app.post('/users', async (req, res) => {
  const { name, email } = req.body;

  // --- basic validation ---
  if (!name || typeof name !== 'string' || name.trim() === '') {
    return res.status(400).json({ error: 'name is required' });
  }
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return res.status(400).json({ error: 'a valid email is required' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO users (name, email)
       VALUES ($1, $2)
       RETURNING id, name, email, created_at`,
      [name.trim(), email.trim().toLowerCase()]
    );

    return res.status(201).json({ user: result.rows[0] });
  } catch (err) {
    // PostgreSQL unique-violation code
    if (err.code === '23505') {
      return res.status(409).json({ error: 'email already registered' });
    }
    console.error('POST /users error:', err);
    return res.status(500).json({ error: 'internal server error' });
  }
});

// ─── GET /users/:id ──────────────────────────────────────────────────────────
// Fetch a single user by primary key (handy for verifying inserts in tests).
app.get('/users/:id', async (req, res) => {
  const { id } = req.params;

  if (isNaN(Number(id))) {
    return res.status(400).json({ error: 'id must be a number' });
  }

  try {
    const result = await pool.query(
      'SELECT id, name, email, created_at FROM users WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'user not found' });
    }

    return res.status(200).json({ user: result.rows[0] });
  } catch (err) {
    console.error('GET /users/:id error:', err);
    return res.status(500).json({ error: 'internal server error' });
  }
});

module.exports = app;