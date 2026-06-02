const router = require('express').Router();
const { v4: uuid } = require('uuid');
const pool   = require('../db/pool');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

// ─── GET /api/zoom/meetings?caseId=xxx ───────────────────────────────────────
router.get('/meetings', async (req, res) => {
  const { caseId } = req.query;
  try {
    const { rows } = caseId
      ? await pool.query('SELECT * FROM zoom_meetings WHERE case_id = $1 ORDER BY date DESC, time DESC', [caseId])
      : await pool.query('SELECT * FROM zoom_meetings ORDER BY date DESC, time DESC');
    res.json(rows.map(rowToMeeting));
  } catch (err) {
    console.error('GET /zoom/meetings:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── POST /api/zoom/meetings ─────────────────────────────────────────────────
router.post('/meetings', async (req, res) => {
  const { id, caseId, clientName, topic, date, time, duration, timezone, link, status } = req.body;
  if (!topic || !date || !time) return res.status(400).json({ error: 'topic, date, time required' });

  try {
    const meetingId = id || uuid();
    const { rows } = await pool.query(`
      INSERT INTO zoom_meetings (id, case_id, client_name, topic, date, time, duration, timezone, link, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (id) DO UPDATE SET
        case_id=$2, client_name=$3, topic=$4, date=$5, time=$6,
        duration=$7, timezone=$8, link=$9, status=$10
      RETURNING *
    `, [meetingId, caseId || null, clientName || null, topic, date, time,
        duration || 60, timezone || 'America/New_York', link || null, status || 'Scheduled']);
    res.status(201).json(rowToMeeting(rows[0]));
  } catch (err) {
    console.error('POST /zoom/meetings:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── PUT /api/zoom/meetings/:id ───────────────────────────────────────────────
router.put('/meetings/:id', async (req, res) => {
  const { clientName, topic, date, time, duration, timezone, link, status } = req.body;
  try {
    const { rows } = await pool.query(`
      UPDATE zoom_meetings
      SET client_name=$2, topic=$3, date=$4, time=$5, duration=$6, timezone=$7, link=$8, status=$9
      WHERE id=$1 RETURNING *
    `, [req.params.id, clientName || null, topic, date, time,
        duration || 60, timezone || 'America/New_York', link || null, status || 'Scheduled']);
    if (!rows[0]) return res.status(404).json({ error: 'Meeting not found' });
    res.json(rowToMeeting(rows[0]));
  } catch (err) {
    console.error('PUT /zoom/meetings/:id:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── DELETE /api/zoom/meetings/:id ───────────────────────────────────────────
router.delete('/meetings/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM zoom_meetings WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /zoom/meetings/:id:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

function rowToMeeting(r) {
  return {
    id:         r.id,
    caseId:     r.case_id,
    clientName: r.client_name,
    topic:      r.topic,
    date:       r.date,
    time:       r.time,
    duration:   r.duration,
    timezone:   r.timezone,
    link:       r.link,
    status:     r.status,
    createdAt:  r.created_at,
  };
}

module.exports = router;
