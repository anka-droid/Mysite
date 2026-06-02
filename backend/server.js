/**
 * Kamkhadze PA — Case Manager API Server
 *
 *   cp .env.example .env          ← fill DATABASE_URL, JWT_SECRET, SMTP_*
 *   npm install
 *   node db/init.js               ← create tables + seed admin (run once)
 *   npm run dev                   ← development
 *   npm start                     ← production
 */
require('dotenv').config();

const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');
const rateLimit  = require('express-rate-limit');
const path       = require('path');

const app = express();

// ── Security headers (helmet) ─────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:  ["'self'"],
      scriptSrc:   ["'self'", "'unsafe-inline'", 'cdn.jsdelivr.net', 'fonts.googleapis.com'],
      styleSrc:    ["'self'", "'unsafe-inline'", 'fonts.googleapis.com', 'fonts.gstatic.com'],
      fontSrc:     ["'self'", 'fonts.gstatic.com'],
      imgSrc:      ["'self'", 'data:'],
      connectSrc:  ["'self'"],
      frameSrc:    ["'none'"],
      objectSrc:   ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// ── CORS ──────────────────────────────────────────────────────────────────────
const allowedOrigins = [
  process.env.FRONTEND_URL || 'http://localhost:5173',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173',
];
app.use(cors({ origin: allowedOrigins, credentials: true }));

// ── Body parsing ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ── Rate limiting ─────────────────────────────────────────────────────────────
// Global: 200 requests per minute per IP
app.use(rateLimit({ windowMs: 60_000, max: 200, standardHeaders: true, legacyHeaders: false }));

// Auth endpoints: 10 requests per 15 minutes per IP (brute-force protection)
const authLimiter = rateLimit({
  windowMs: 15 * 60_000, max: 10,
  message: { error: 'Too many attempts — please wait 15 minutes before trying again.' },
  standardHeaders: true, legacyHeaders: false,
});
app.use('/api/auth/login',           authLimiter);
app.use('/api/auth/forgot-password', authLimiter);
app.use('/api/auth/reset-password',  authLimiter);

// ── Static frontend ───────────────────────────────────────────────────────────
// In packaged Electron builds, STATIC_ROOT is set to process.resourcesPath.
// In dev/standalone mode it falls back to the parent of the backend folder.
const STATIC_ROOT = process.env.STATIC_ROOT || path.join(__dirname, '..');
app.use(express.static(STATIC_ROOT, {
  index: 'case-manager.html',
}));

// ── API routes ────────────────────────────────────────────────────────────────
app.use('/api/auth',  require('./routes/auth'));
app.use('/api/cases', require('./routes/cases'));
app.use('/api/emails',require('./routes/emails'));
app.use('/api/zoom',  require('./routes/zoom'));
app.use('/api/files', require('./routes/files'));
app.use('/api/users', require('./routes/users'));

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => res.json({ ok: true, ts: new Date() }));

// ── SPA fallback ──────────────────────────────────────────────────────────────
app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.sendFile(path.join(STATIC_ROOT, 'case-manager.html'));
});

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n✅  Kamkhadze PA server  →  http://localhost:${PORT}`);
  console.log(`    Health check         →  http://localhost:${PORT}/api/health\n`);
});

module.exports = app; // exported for Electron
