const router = require('express').Router();
const multer = require('multer');
const path   = require('path');
const fs     = require('fs');
const pool   = require('../db/pool');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

const uploadDir = path.join(__dirname, '..', process.env.UPLOAD_DIR || 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename:    (_req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}_${safe}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE || '52428800') },
});

// ─── GET /api/files?caseId=xxx&folder=xxx ────────────────────────────────────
router.get('/', async (req, res) => {
  const { caseId, folder } = req.query;
  const conditions = [];
  const params = [];
  if (caseId)  { params.push(caseId);  conditions.push(`case_id = $${params.length}`); }
  if (folder)  { params.push(folder);  conditions.push(`folder  = $${params.length}`); }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
  try {
    const { rows } = await pool.query(
      `SELECT * FROM files ${where} ORDER BY uploaded_at DESC`,
      params
    );
    res.json(rows.map(rowToFile));
  } catch (err) {
    console.error('GET /files:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── POST /api/files/upload ───────────────────────────────────────────────────
router.post('/upload', upload.array('files', 20), async (req, res) => {
  const { caseId, clientName, folder, uploadedBy } = req.body;
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No files uploaded' });
  }

  try {
    const saved = [];
    for (const f of req.files) {
      const { rows } = await pool.query(`
        INSERT INTO files (case_id, client_name, name, folder, size, mime_type, storage_path, uploaded_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `, [
        caseId       || null,
        clientName   || null,
        f.originalname,
        folder       || '01_Personal_Documents',
        f.size,
        f.mimetype,
        f.filename,
        uploadedBy   || 'Ana Kamkhadze',
      ]);
      saved.push(rowToFile(rows[0]));
    }
    res.status(201).json({ uploaded: saved.length, files: saved });
  } catch (err) {
    console.error('POST /files/upload:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── PATCH /api/files/:id ─────────────────────────────────────────────────────
router.patch('/:id', async (req, res) => {
  const { status } = req.body;
  if (!status) return res.status(400).json({ error: 'status required' });
  try {
    const { rows } = await pool.query(
      'UPDATE files SET status = $1 WHERE id = $2 RETURNING *',
      [status, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'File not found' });
    res.json(rowToFile(rows[0]));
  } catch (err) {
    console.error('PATCH /files/:id:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── GET /api/files/:id/download ─────────────────────────────────────────────
router.get('/:id/download', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM files WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'File not found' });
    const filePath = path.join(uploadDir, rows[0].storage_path);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File missing on disk' });
    res.download(filePath, rows[0].name);
  } catch (err) {
    console.error('GET /files/:id/download:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── DELETE /api/files/:id ────────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT storage_path FROM files WHERE id = $1', [req.params.id]);
    if (rows[0]) {
      const filePath = path.join(uploadDir, rows[0].storage_path);
      try { fs.unlinkSync(filePath); } catch {} // ignore missing file
    }
    await pool.query('DELETE FROM files WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /files/:id:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

function rowToFile(r) {
  return {
    id:          r.id,
    caseId:      r.case_id,
    clientName:  r.client_name,
    name:        r.name,
    folder:      r.folder,
    size:        r.size,
    type:        r.mime_type,
    status:      r.status,
    storagePath: r.storage_path,
    uploadedBy:  r.uploaded_by,
    uploadedAt:  r.uploaded_at,
  };
}

module.exports = router;
