const router = require('express').Router();
const pool   = require('../db/pool');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

// ─── GET /api/emails?direction=sent|received&caseId=xxx ──────────────────────
router.get('/', async (req, res) => {
  const { direction, caseId } = req.query;
  const conditions = [];
  const params = [];

  if (direction) { params.push(direction); conditions.push(`direction = $${params.length}`); }
  if (caseId)    { params.push(caseId);    conditions.push(`case_id   = $${params.length}`); }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
  try {
    const { rows } = await pool.query(
      `SELECT * FROM emails ${where} ORDER BY sent_at DESC LIMIT 500`,
      params
    );
    res.json(rows.map(rowToEmail));
  } catch (err) {
    console.error('GET /emails:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── POST /api/emails ─────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  const { caseId, caseTag, to, from: fromEmail, subject, body } = req.body;
  if (!to || !subject) return res.status(400).json({ error: 'to and subject are required' });

  try {
    const { rows } = await pool.query(`
      INSERT INTO emails (case_id, case_tag, direction, from_email, to_email, subject, body, preview)
      VALUES ($1, $2, 'sent', $3, $4, $5, $6, $7)
      RETURNING *
    `, [
      caseId  || null,
      caseTag || null,
      fromEmail || 'anka@esq.mba',
      to,
      subject,
      body || '',
      (body || '').slice(0, 200),
    ]);

    if (caseId) {
      await pool.query(`
        UPDATE cases
        SET email_log = email_log || $1::jsonb, updated_at = NOW()
        WHERE id = $2
      `, [JSON.stringify([{ subject, date: new Date().toISOString() }]), caseId]);
    }

    res.status(201).json(rowToEmail(rows[0]));
  } catch (err) {
    console.error('POST /emails:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── DELETE /api/emails/:id ───────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM emails WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /emails/:id:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

function rowToEmail(r) {
  return {
    id:        r.id,
    caseId:    r.case_id,
    caseTag:   r.case_tag,
    direction: r.direction,
    from:      r.from_email,
    to:        r.to_email,
    subject:   r.subject,
    body:      r.body,
    preview:   r.preview,
    unread:    r.unread,
    sentAt:    r.sent_at,
  };
}

module.exports = router;
