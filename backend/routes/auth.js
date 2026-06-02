const router  = require('express').Router();
const bcrypt  = require('bcrypt');
const jwt     = require('jsonwebtoken');
const crypto  = require('crypto');
const pool    = require('../db/pool');
const { requireAuth } = require('../middleware/auth');
const { sendPasswordReset, sendInvite } = require('../utils/email');

// ─── POST /api/auth/login ─────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: 'username and password are required' });

  try {
    const { rows } = await pool.query(
      `SELECT id, username, password_hash, display_name, role, status
       FROM users WHERE username = $1`,
      [username.toLowerCase().trim()]
    );
    const user = rows[0];
    if (!user || user.status === 'invited')
      return res.status(401).json({ error: 'Invalid credentials' });
    if (user.status === 'suspended')
      return res.status(403).json({ error: 'Account suspended. Contact your administrator.' });

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role, name: user.display_name },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );
    res.json({ token, user: { id: user.id, username: user.username, role: user.role, name: user.display_name } });
  } catch (err) {
    console.error('/auth/login:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── POST /api/auth/verify ────────────────────────────────────────────────────
router.post('/verify', (req, res) => {
  const header = req.headers.authorization || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ valid: false });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    res.json({ valid: true, user: payload });
  } catch {
    res.status(401).json({ valid: false });
  }
});

// ─── POST /api/auth/forgot-password ──────────────────────────────────────────
router.post('/forgot-password', async (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ error: 'username required' });

  try {
    const { rows } = await pool.query(
      `SELECT id, username, display_name FROM users
       WHERE username = $1 AND status = 'active'`,
      [username.toLowerCase().trim()]
    );
    const user = rows[0];

    if (user) {
      await pool.query(
        `UPDATE password_reset_tokens SET used = TRUE WHERE user_id = $1 AND used = FALSE`,
        [user.id]
      );

      const token     = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

      await pool.query(
        `INSERT INTO password_reset_tokens (user_id, token, expires_at)
         VALUES ($1, $2, $3)`,
        [user.id, token, expiresAt]
      );

      const resetUrl = `${process.env.APP_URL || 'http://localhost:3000'}/?reset_token=${token}`;
      await sendPasswordReset({ to: user.username, name: user.display_name, resetUrl });
    }

    res.json({ message: 'If that account exists, a reset email has been sent.' });
  } catch (err) {
    console.error('/auth/forgot-password:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── POST /api/auth/reset-password ───────────────────────────────────────────
router.post('/reset-password', async (req, res) => {
  const { token, newPassword } = req.body;
  if (!token || !newPassword || newPassword.length < 8)
    return res.status(400).json({ error: 'token and newPassword (min 8 chars) required' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `SELECT prt.id, prt.user_id, prt.used, prt.expires_at,
              u.username, u.display_name, u.status
       FROM password_reset_tokens prt
       JOIN users u ON u.id = prt.user_id
       WHERE prt.token = $1`,
      [token]
    );
    const row = rows[0];
    if (!row)       { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Invalid or expired reset link.' }); }
    if (row.used)   { await client.query('ROLLBACK'); return res.status(400).json({ error: 'This reset link has already been used.' }); }
    if (new Date() > new Date(row.expires_at)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'This reset link has expired. Please request a new one.' });
    }

    const hash = await bcrypt.hash(newPassword, 12);
    await client.query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [hash, row.user_id]);
    await client.query(`UPDATE password_reset_tokens SET used = TRUE WHERE id = $1`, [row.id]);
    await client.query('COMMIT');

    res.json({ success: true, message: 'Password updated successfully. You can now sign in.' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('/auth/reset-password:', err.message);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

// ─── POST /api/auth/change-password  (authenticated) ────────────────────────
router.post('/change-password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword || newPassword.length < 8)
    return res.status(400).json({ error: 'newPassword must be at least 8 characters' });

  try {
    const { rows } = await pool.query(`SELECT password_hash FROM users WHERE id = $1`, [req.user.id]);
    if (!rows[0]) return res.status(404).json({ error: 'User not found' });
    const ok = await bcrypt.compare(currentPassword, rows[0].password_hash);
    if (!ok) return res.status(401).json({ error: 'Current password is incorrect' });
    const hash = await bcrypt.hash(newPassword, 12);
    await pool.query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [hash, req.user.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('/auth/change-password:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── POST /api/auth/invite  (admin only) ─────────────────────────────────────
router.post('/invite', requireAuth, async (req, res) => {
  if (req.user.role !== 'admin')
    return res.status(403).json({ error: 'Admin access required' });

  const { username, displayName, role } = req.body;
  if (!username) return res.status(400).json({ error: 'username (email) required' });

  try {
    const existing = await pool.query(`SELECT id FROM users WHERE username = $1`, [username.toLowerCase()]);
    if (existing.rows[0])
      return res.status(409).json({ error: 'A user with that email already exists.' });

    const inviteToken  = crypto.randomBytes(32).toString('hex');
    const inviteExpiry = new Date(Date.now() + 48 * 60 * 60 * 1000);

    const { rows } = await pool.query(
      `INSERT INTO users (username, display_name, role, status, invite_token, invite_expires_at, invited_by)
       VALUES ($1, $2, $3, 'invited', $4, $5, $6) RETURNING id, username, display_name, role, status`,
      [username.toLowerCase(), displayName || username, role || 'attorney', inviteToken, inviteExpiry, req.user.id]
    );

    const inviteUrl = `${process.env.APP_URL || 'http://localhost:3000'}/?invite_token=${inviteToken}`;
    await sendInvite({
      to: username,
      name: displayName || username,
      invitedBy: req.user.name || 'Ana Kamkhadze',
      inviteUrl,
    });

    res.status(201).json({
      success: true,
      user: rows[0],
      message: `Invitation sent to ${username}`,
    });
  } catch (err) {
    console.error('/auth/invite:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── POST /api/auth/accept-invite ────────────────────────────────────────────
router.post('/accept-invite', async (req, res) => {
  const { token, password, displayName } = req.body;
  if (!token || !password || password.length < 8)
    return res.status(400).json({ error: 'token and password (min 8 chars) required' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `SELECT id, username, invite_expires_at, status FROM users WHERE invite_token = $1`,
      [token]
    );
    const user = rows[0];
    if (!user || user.status !== 'invited')
      { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Invalid invitation link.' }); }
    if (new Date() > new Date(user.invite_expires_at))
      { await client.query('ROLLBACK'); return res.status(400).json({ error: 'This invitation has expired. Ask an admin to re-send it.' }); }

    const hash = await bcrypt.hash(password, 12);
    await client.query(
      `UPDATE users SET password_hash=$1, display_name=COALESCE($2, display_name),
       status='active', invite_token=NULL, invite_expires_at=NULL
       WHERE id=$3`,
      [hash, displayName || null, user.id]
    );
    await client.query('COMMIT');

    const { rows: updated } = await pool.query(
      `SELECT id, username, display_name, role FROM users WHERE id = $1`, [user.id]
    );
    const u = updated[0];
    const jwtToken = jwt.sign(
      { id: u.id, username: u.username, role: u.role, name: u.display_name },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.json({ success: true, token: jwtToken, user: { id: u.id, username: u.username, role: u.role, name: u.display_name } });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('/auth/accept-invite:', err.message);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

// ─── GET /api/auth/validate-token?type=reset|invite&token=xxx ────────────────
router.get('/validate-token', async (req, res) => {
  const { type, token } = req.query;
  try {
    if (type === 'reset') {
      const { rows } = await pool.query(
        `SELECT u.username, u.display_name FROM password_reset_tokens prt
         JOIN users u ON u.id = prt.user_id
         WHERE prt.token = $1 AND prt.used = FALSE AND prt.expires_at > NOW()`,
        [token]
      );
      if (!rows[0]) return res.status(400).json({ valid: false, error: 'Invalid or expired link.' });
      return res.json({ valid: true, username: rows[0].username, name: rows[0].display_name });
    }
    if (type === 'invite') {
      const { rows } = await pool.query(
        `SELECT username, display_name FROM users
         WHERE invite_token = $1 AND status = 'invited' AND invite_expires_at > NOW()`,
        [token]
      );
      if (!rows[0]) return res.status(400).json({ valid: false, error: 'Invalid or expired invitation.' });
      return res.json({ valid: true, username: rows[0].username, name: rows[0].display_name });
    }
    res.status(400).json({ valid: false, error: 'Unknown token type' });
  } catch (err) {
    console.error('/auth/validate-token:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
