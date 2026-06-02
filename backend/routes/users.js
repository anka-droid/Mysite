const router = require('express').Router();
const bcrypt = require('bcrypt');
const pool   = require('../db/pool');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

function rowToUser(r) {
  return {
    id:          r.id,
    username:    r.username,
    displayName: r.display_name,
    role:        r.role,
    status:      r.status,
    invitedBy:   r.invited_by,
    createdAt:   r.created_at,
  };
}

function isAdmin(req, res) {
  if (req.user.role !== 'admin') {
    res.status(403).json({ error: 'Admin access required' });
    return false;
  }
  return true;
}

// ─── GET /api/users ───────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, username, display_name, role, status, invited_by, created_at
       FROM users ORDER BY created_at ASC`
    );
    res.json(rows.map(rowToUser));
  } catch (err) {
    console.error('GET /users:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── GET /api/users/me ────────────────────────────────────────────────────────
router.get('/me', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, username, display_name, role, status, created_at
       FROM users WHERE id = $1`, [req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'User not found' });
    res.json(rowToUser(rows[0]));
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── PATCH /api/users/me ──────────────────────────────────────────────────────
router.patch('/me', async (req, res) => {
  const { displayName } = req.body;
  if (!displayName) return res.status(400).json({ error: 'displayName required' });
  try {
    const { rows } = await pool.query(
      `UPDATE users SET display_name = $1 WHERE id = $2 RETURNING *`,
      [displayName, req.user.id]
    );
    res.json(rowToUser(rows[0]));
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── PATCH /api/users/:id ─────────────────────────────────────────────────────
router.patch('/:id', async (req, res) => {
  if (!isAdmin(req, res)) return;
  const { role, status, displayName } = req.body;

  if (req.params.id === req.user.id && role && role !== 'admin')
    return res.status(400).json({ error: 'You cannot change your own role.' });

  const fields = [];
  const values = [];
  let i = 1;
  if (role)        { fields.push(`role = $${i++}`);         values.push(role); }
  if (status)      { fields.push(`status = $${i++}`);       values.push(status); }
  if (displayName) { fields.push(`display_name = $${i++}`); values.push(displayName); }
  if (!fields.length) return res.status(400).json({ error: 'Nothing to update' });

  values.push(req.params.id);
  try {
    const { rows } = await pool.query(
      `UPDATE users SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
      values
    );
    if (!rows[0]) return res.status(404).json({ error: 'User not found' });
    res.json(rowToUser(rows[0]));
  } catch (err) {
    console.error('PATCH /users/:id:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── DELETE /api/users/:id ────────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  if (!isAdmin(req, res)) return;
  if (req.params.id === req.user.id)
    return res.status(400).json({ error: 'You cannot delete your own account.' });
  try {
    await pool.query(`DELETE FROM users WHERE id = $1`, [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /users/:id:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── POST /api/users/:id/resend-invite ───────────────────────────────────────
router.post('/:id/resend-invite', async (req, res) => {
  if (!isAdmin(req, res)) return;
  const { sendInvite } = require('../utils/email');
  const crypto = require('crypto');

  try {
    const { rows } = await pool.query(
      `SELECT id, username, display_name, status FROM users WHERE id = $1`,
      [req.params.id]
    );
    const user = rows[0];
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.status !== 'invited')
      return res.status(400).json({ error: 'User has already accepted their invitation.' });

    const inviteToken  = crypto.randomBytes(32).toString('hex');
    const inviteExpiry = new Date(Date.now() + 48 * 60 * 60 * 1000);
    await pool.query(
      `UPDATE users SET invite_token = $1, invite_expires_at = $2 WHERE id = $3`,
      [inviteToken, inviteExpiry, user.id]
    );
    const inviteUrl = `${process.env.APP_URL || 'http://localhost:3000'}/?invite_token=${inviteToken}`;
    await sendInvite({ to: user.username, name: user.display_name, invitedBy: req.user.name, inviteUrl });
    res.json({ success: true, message: `Invitation re-sent to ${user.username}` });
  } catch (err) {
    console.error('resend-invite:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
