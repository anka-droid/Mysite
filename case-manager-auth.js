/* ============================================================
   Kamkhadze PA — Authentication & Encryption Layer
   Uses Web Crypto API: PBKDF2 key derivation + AES-256-GCM
   No external dependencies. All crypto runs in-browser.
   ============================================================ */

const Auth = (() => {
  const STORAGE_KEY   = 'km_auth_v1';      // auth config (salt + verifier)
  const SESSION_KEY   = 'km_session_v1';   // derived key in sessionStorage
  const LOCKOUT_KEY   = 'km_lockout_v1';   // failed attempts
  const PBKDF2_ITERS  = 600000;            // OWASP 2023 recommendation
  const SESSION_MINS  = 30;               // auto-logout after 30 min idle
  const MAX_ATTEMPTS  = 5;
  const LOCKOUT_MINS  = 5;
  const VERIFY_PLAIN  = 'kamkhadze-pa-auth-ok-v1';

  let _key = null;          // CryptoKey (in memory only)
  let _username = '';
  let _idleTimer = null;
  let _resolve = null;

  // Public promise that resolves when fully authenticated
  const ready = new Promise(res => { _resolve = res; });

  // ---- Utility ----
  const enc = v => new TextEncoder().encode(v);
  const toB64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
  const fromB64 = b64 => Uint8Array.from(atob(b64), c => c.charCodeAt(0));

  function randBytes(n) {
    return crypto.getRandomValues(new Uint8Array(n));
  }

  // ---- PBKDF2 key derivation ----
  async function deriveKey(password, salt) {
    const raw = await crypto.subtle.importKey('raw', enc(password), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: PBKDF2_ITERS, hash: 'SHA-256' },
      raw,
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );
  }

  // ---- AES-GCM encrypt/decrypt ----
  async function _encrypt(key, plaintext) {
    const iv = randBytes(12);
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc(plaintext));
    const out = new Uint8Array(12 + ct.byteLength);
    out.set(iv);
    out.set(new Uint8Array(ct), 12);
    return toB64(out.buffer);
  }

  async function _decrypt(key, b64) {
    const buf = fromB64(b64);
    const iv  = buf.slice(0, 12);
    const ct  = buf.slice(12);
    const pt  = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
    return new TextDecoder().decode(pt);
  }

  // ---- Public encrypt/decrypt (uses active session key) ----
  async function encrypt(plaintext) {
    if (!_key) throw new Error('Not authenticated');
    return _encrypt(_key, plaintext);
  }

  async function decrypt(b64) {
    if (!_key) throw new Error('Not authenticated');
    return _decrypt(_key, b64);
  }

  // ---- Session persistence (survives page refresh, cleared on tab close) ----
  async function storeSession(key, username) {
    const jwk = await crypto.subtle.exportKey('jwk', key);
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ jwk, username, ts: Date.now() }));
  }

  async function restoreSession() {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return false;
    try {
      const { jwk, username, ts } = JSON.parse(raw);
      // Reject if session is older than SESSION_MINS
      if (Date.now() - ts > SESSION_MINS * 60 * 1000) {
        sessionStorage.removeItem(SESSION_KEY);
        return false;
      }
      _key = await crypto.subtle.importKey('jwk', jwk, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
      _username = username;
      return true;
    } catch {
      sessionStorage.removeItem(SESSION_KEY);
      return false;
    }
  }

  function touchSession() {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return;
    try {
      const d = JSON.parse(raw);
      d.ts = Date.now();
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(d));
    } catch {}
  }

  // ---- Brute-force lockout ----
  function getLockout() {
    try { return JSON.parse(localStorage.getItem(LOCKOUT_KEY) || '{}'); } catch { return {}; }
  }

  function isLockedOut() {
    const l = getLockout();
    if (!l.until) return false;
    if (Date.now() < l.until) return { seconds: Math.ceil((l.until - Date.now()) / 1000) };
    localStorage.removeItem(LOCKOUT_KEY);
    return false;
  }

  function recordFailedAttempt() {
    const l = getLockout();
    l.count = (l.count || 0) + 1;
    if (l.count >= MAX_ATTEMPTS) {
      l.until = Date.now() + LOCKOUT_MINS * 60 * 1000;
      l.count = 0;
    }
    localStorage.setItem(LOCKOUT_KEY, JSON.stringify(l));
    return MAX_ATTEMPTS - (l.count || 0);
  }

  function clearLockout() {
    localStorage.removeItem(LOCKOUT_KEY);
  }

  // ---- Idle auto-logout ----
  function resetIdleTimer() {
    touchSession();
    clearTimeout(_idleTimer);
    _idleTimer = setTimeout(() => {
      logout(true);
    }, SESSION_MINS * 60 * 1000);
  }

  function attachIdleListeners() {
    ['mousemove','keydown','click','touchstart','scroll'].forEach(e =>
      document.addEventListener(e, resetIdleTimer, { passive: true })
    );
    resetIdleTimer();
    // Update the idle indicator every 60s
    setInterval(updateIdleIndicator, 60000);
  }

  function updateIdleIndicator() {
    const el = document.getElementById('auth-idle-indicator');
    if (!el) return;
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return;
    try {
      const { ts } = JSON.parse(raw);
      const idleMins = Math.floor((Date.now() - ts) / 60000);
      const remaining = SESSION_MINS - idleMins;
      el.textContent = remaining <= 5 ? `Auto-logout in ${remaining}m` : '';
      el.style.color = remaining <= 5 ? 'var(--yellow)' : '';
    } catch {}
  }

  // ---- Auth storage ----
  function getAuthConfig() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch { return null; }
  }

  function isSetup() {
    return !!getAuthConfig();
  }

  // ---- Logout ----
  function logout(idle = false) {
    _key = null;
    _username = '';
    sessionStorage.removeItem(SESSION_KEY);
    clearTimeout(_idleTimer);
    // Re-render login screen
    if (idle) {
      showLoginScreen('Your session expired due to inactivity.');
    } else {
      showLoginScreen();
    }
  }

  // ---- Password strength ----
  function passwordStrength(pw) {
    let score = 0;
    const checks = {
      length:   pw.length >= 12,
      upper:    /[A-Z]/.test(pw),
      lower:    /[a-z]/.test(pw),
      digit:    /[0-9]/.test(pw),
      special:  /[^A-Za-z0-9]/.test(pw),
      long:     pw.length >= 16,
    };
    score = Object.values(checks).filter(Boolean).length;
    if (score <= 2) return { label: 'Weak', color: 'var(--red)',    pct: 20 };
    if (score <= 3) return { label: 'Fair', color: 'var(--yellow)', pct: 45 };
    if (score <= 4) return { label: 'Good', color: 'var(--blue)',   pct: 70 };
    return               { label: 'Strong', color: 'var(--green)', pct: 100 };
  }

  // ---- UI ----
  function authCSS() {
    return `
      #auth-overlay {
        position: fixed; inset: 0;
        background: var(--bg);
        z-index: 9999;
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: var(--font-sans);
      }
      .auth-card {
        width: 100%;
        max-width: 420px;
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: var(--radius-lg);
        padding: 40px;
        margin: 24px;
      }
      .auth-logo {
        margin-bottom: 4px;
      }
      .auth-sub {
        font-size: 11px;
        font-weight: 600;
        letter-spacing: 0.15em;
        text-transform: uppercase;
        color: var(--text-3);
        margin-bottom: 32px;
      }
      .auth-title {
        font-family: var(--font-serif);
        font-size: 22px;
        font-weight: 400;
        color: var(--white);
        margin-bottom: 8px;
      }
      .auth-desc {
        font-size: 13px;
        color: var(--text-3);
        margin-bottom: 28px;
        line-height: 1.6;
      }
      .auth-field {
        display: flex;
        flex-direction: column;
        gap: 6px;
        margin-bottom: 16px;
      }
      .auth-field label {
        font-size: 11px;
        font-weight: 600;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        color: var(--text-3);
      }
      .auth-input-wrap { position: relative; }
      .auth-field input {
        width: 100%;
        background: var(--bg-2);
        border: 1px solid var(--border-2);
        border-radius: var(--radius);
        color: var(--text);
        font-family: var(--font-sans);
        font-size: 15px;
        padding: 11px 42px 11px 14px;
        outline: none;
        transition: border-color 0.2s;
        box-sizing: border-box;
      }
      .auth-field input:focus { border-color: var(--gold); }
      .auth-field input.error { border-color: var(--red); }
      .auth-show-pw {
        position: absolute;
        right: 12px; top: 50%;
        transform: translateY(-50%);
        background: none; border: none;
        color: var(--text-3); cursor: pointer;
        font-size: 16px; padding: 4px;
        transition: color 0.2s;
      }
      .auth-show-pw:hover { color: var(--text-2); }
      .pw-strength-bar {
        height: 4px;
        background: var(--surface-3);
        border-radius: 2px;
        overflow: hidden;
        margin-top: 6px;
      }
      .pw-strength-fill {
        height: 100%;
        border-radius: 2px;
        transition: width 0.3s, background 0.3s;
      }
      .pw-strength-label {
        font-size: 11px;
        margin-top: 4px;
        font-weight: 600;
        transition: color 0.3s;
      }
      .auth-error {
        background: var(--red-dim);
        border: 1px solid rgba(248,113,113,0.25);
        border-radius: var(--radius);
        padding: 10px 14px;
        font-size: 13px;
        color: var(--red);
        margin-bottom: 16px;
        display: none;
      }
      .auth-info {
        background: var(--gold-dim);
        border: 1px solid var(--border);
        border-radius: var(--radius);
        padding: 10px 14px;
        font-size: 13px;
        color: var(--gold-light);
        margin-bottom: 16px;
        display: none;
      }
      .auth-btn {
        width: 100%;
        padding: 13px;
        background: var(--gold);
        color: var(--bg);
        border: none;
        border-radius: var(--radius);
        font-family: var(--font-sans);
        font-size: 14px;
        font-weight: 600;
        letter-spacing: 0.04em;
        cursor: pointer;
        transition: background 0.2s, opacity 0.2s;
        margin-top: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
      }
      .auth-btn:hover { background: var(--gold-light); }
      .auth-btn:disabled { opacity: 0.5; cursor: not-allowed; }
      .auth-lockout-timer {
        text-align: center;
        font-size: 32px;
        font-family: var(--font-serif);
        font-weight: 600;
        color: var(--red);
        margin: 20px 0;
        letter-spacing: 0.05em;
      }
      .auth-footer {
        margin-top: 24px;
        padding-top: 20px;
        border-top: 1px solid var(--border-2);
        font-size: 11.5px;
        color: var(--text-3);
        text-align: center;
        line-height: 1.6;
      }
      .auth-spinner {
        width: 18px; height: 18px;
        border: 2px solid rgba(255,255,255,0.25);
        border-top-color: #fff;
        border-radius: 50%;
        animation: spin 0.7s linear infinite;
        display: none;
      }
      @keyframes spin { to { transform: rotate(360deg); } }
      #auth-session-bar {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 10px 12px;
        margin: 12px;
        background: var(--bg-3);
        border: 1px solid var(--border-2);
        border-radius: var(--radius);
        font-size: 12px;
        color: var(--text-3);
      }
      #auth-session-bar .user-dot {
        width: 7px; height: 7px;
        background: var(--green);
        border-radius: 50%;
        flex-shrink: 0;
      }
      #auth-session-bar .user-name {
        font-weight: 600;
        color: var(--text-2);
        flex: 1;
      }
      #auth-session-bar .logout-btn {
        background: none; border: none;
        color: var(--text-3); cursor: pointer;
        font-size: 11px; font-weight: 600;
        letter-spacing: 0.05em; text-transform: uppercase;
        padding: 3px 8px;
        border-radius: var(--radius);
        transition: color 0.2s, background 0.2s;
      }
      #auth-session-bar .logout-btn:hover {
        color: var(--red);
        background: var(--red-dim);
      }
    `;
  }

  function injectStyles() {
    if (document.getElementById('auth-styles')) return;
    const s = document.createElement('style');
    s.id = 'auth-styles';
    s.textContent = authCSS();
    document.head.appendChild(s);
  }

  function showLoginScreen(message = '') {
    injectStyles();
    const app = document.getElementById('app');
    if (app) app.innerHTML = '';

    const overlay = document.createElement('div');
    overlay.id = 'auth-overlay';

    const lockout = isLockedOut();

    overlay.innerHTML = `
      <div class="auth-card">
        <div class="auth-logo">
          <svg width="160" height="46" viewBox="0 0 160 46" xmlns="http://www.w3.org/2000/svg" style="display:block;margin-bottom:4px">
            <rect width="46" height="46" rx="4" fill="#1e3a8a"/>
            <rect x="3" y="3" width="19" height="40" rx="2" fill="white"/>
            <polyline points="7,10 17,23 7,36" fill="none" stroke="#2563eb" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
            <text x="52" y="18" font-family="Arial,sans-serif" font-size="11" font-weight="800" fill="var(--text)" letter-spacing="0.5">KAMKHADZE PA</text>
            <text x="52" y="35" font-family="Georgia,serif" font-size="10" font-style="italic" fill="var(--text-3)" letter-spacing="0.3">Immigration Law Firm</text>
          </svg>
        </div>
        <div class="auth-sub">Secure Case Manager</div>
        <div class="auth-title">Sign In</div>
        <div class="auth-desc">
          Attorney-client privileged data. Authorized personnel only.
        </div>
        ${message ? `<div class="auth-info" style="display:block">${message}</div>` : ''}
        <div class="auth-error" id="auth-error"></div>
        ${lockout ? `
          <div style="text-align:center">
            <div style="color:var(--red);font-size:13px;margin-bottom:8px">
              Account temporarily locked after too many failed attempts.
            </div>
            <div class="auth-lockout-timer" id="lockout-countdown"></div>
            <div style="font-size:12px;color:var(--text-3)">Please wait before trying again.</div>
          </div>
        ` : `
          <div class="auth-field">
            <label>Username</label>
            <input type="text" id="auth-username" autocomplete="username"
              placeholder="Enter your username" autofocus />
          </div>
          <div class="auth-field">
            <label>Password</label>
            <div class="auth-input-wrap">
              <input type="password" id="auth-password" autocomplete="current-password"
                placeholder="Enter your password" />
              <button type="button" class="auth-show-pw" onclick="togglePwVisibility('auth-password',this)" title="Show/hide">👁</button>
            </div>
          </div>
          <button class="auth-btn" id="auth-submit-btn" onclick="Auth._handleLogin()">
            <span id="auth-btn-text">Sign In</span>
            <div class="auth-spinner" id="auth-spinner"></div>
          </button>
        `}
        <div class="auth-footer">
          🔒 Encrypted with AES-256-GCM · PBKDF2 key derivation<br/>
          Data never leaves your device.
        </div>
      </div>`;

    document.body.innerHTML = '';
    document.body.appendChild(overlay);

    if (lockout) {
      startLockoutCountdown(lockout.seconds);
    } else {
      const pwInput = document.getElementById('auth-password');
      pwInput?.addEventListener('keydown', e => { if (e.key === 'Enter') Auth._handleLogin(); });
      document.getElementById('auth-username')?.addEventListener('keydown', e => {
        if (e.key === 'Enter') pwInput?.focus();
      });
    }
  }

  function showSetupScreen() {
    injectStyles();
    const overlay = document.createElement('div');
    overlay.id = 'auth-overlay';
    overlay.innerHTML = `
      <div class="auth-card">
        <div class="auth-logo">
          <svg width="160" height="46" viewBox="0 0 160 46" xmlns="http://www.w3.org/2000/svg" style="display:block;margin-bottom:4px">
            <rect width="46" height="46" rx="4" fill="#1e3a8a"/>
            <rect x="3" y="3" width="19" height="40" rx="2" fill="white"/>
            <polyline points="7,10 17,23 7,36" fill="none" stroke="#2563eb" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
            <text x="52" y="18" font-family="Arial,sans-serif" font-size="11" font-weight="800" fill="var(--text)" letter-spacing="0.5">KAMKHADZE PA</text>
            <text x="52" y="35" font-family="Georgia,serif" font-size="10" font-style="italic" fill="var(--text-3)" letter-spacing="0.3">Immigration Law Firm</text>
          </svg>
        </div>
        <div class="auth-sub">First-Time Setup</div>
        <div class="auth-title">Create Your Credentials</div>
        <div class="auth-desc">
          Choose a strong username and password. Your credentials encrypt all case data —
          they cannot be recovered if lost. Store them securely.
        </div>
        <div class="auth-error" id="auth-error"></div>
        <div class="auth-field">
          <label>Username</label>
          <input type="text" id="setup-username" autocomplete="username"
            placeholder="e.g. ana.kamkhadze" autofocus />
        </div>
        <div class="auth-field">
          <label>Password</label>
          <div class="auth-input-wrap">
            <input type="password" id="setup-password" autocomplete="new-password"
              placeholder="Minimum 12 characters"
              oninput="Auth._updateStrength(this.value)" />
            <button type="button" class="auth-show-pw" onclick="togglePwVisibility('setup-password',this)" title="Show/hide">👁</button>
          </div>
          <div class="pw-strength-bar">
            <div class="pw-strength-fill" id="pw-strength-fill" style="width:0%;background:var(--red)"></div>
          </div>
          <div class="pw-strength-label" id="pw-strength-label" style="color:var(--text-3)">Enter a password</div>
        </div>
        <div class="auth-field">
          <label>Confirm Password</label>
          <div class="auth-input-wrap">
            <input type="password" id="setup-confirm" autocomplete="new-password"
              placeholder="Repeat your password" />
            <button type="button" class="auth-show-pw" onclick="togglePwVisibility('setup-confirm',this)" title="Show/hide">👁</button>
          </div>
        </div>
        <button class="auth-btn" id="auth-submit-btn" onclick="Auth._handleSetup()">
          <span id="auth-btn-text">Create Account &amp; Enter</span>
          <div class="auth-spinner" id="auth-spinner"></div>
        </button>
        <div class="auth-footer">
          🔒 Your password is used to derive an AES-256 encryption key via PBKDF2.<br/>
          It is <strong>never stored</strong> — only a cryptographic verifier is saved.<br/>
          <span style="color:var(--red);font-weight:600">If you forget your password, all data will be unrecoverable.</span>
        </div>
      </div>`;

    document.body.innerHTML = '';
    document.body.appendChild(overlay);

    document.getElementById('setup-confirm')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') Auth._handleSetup();
    });
  }

  function startLockoutCountdown(seconds) {
    let remaining = seconds;
    const el = document.getElementById('lockout-countdown');
    if (!el) return;

    function tick() {
      if (remaining <= 0) {
        clearLockout();
        showLoginScreen();
        return;
      }
      const m = Math.floor(remaining / 60);
      const s = remaining % 60;
      el.textContent = `${m}:${String(s).padStart(2, '0')}`;
      remaining--;
      setTimeout(tick, 1000);
    }
    tick();
  }

  function showAuthError(msg) {
    const el = document.getElementById('auth-error');
    if (el) { el.textContent = msg; el.style.display = 'block'; }
  }

  function setLoading(on) {
    const btn  = document.getElementById('auth-submit-btn');
    const txt  = document.getElementById('auth-btn-text');
    const spin = document.getElementById('auth-spinner');
    if (btn)  btn.disabled = on;
    if (spin) spin.style.display = on ? 'block' : 'none';
    if (txt)  txt.style.display  = on ? 'none'  : 'inline';
  }

  // ---- Session bar (injected into sidebar) ----
  function injectSessionBar() {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar || document.getElementById('auth-session-bar')) return;
    const bar = document.createElement('div');
    bar.id = 'auth-session-bar';
    bar.innerHTML = `
      <div class="user-dot"></div>
      <div class="user-name">${_username}</div>
      <span id="auth-idle-indicator" style="font-size:10px"></span>
      <button class="logout-btn" onclick="Auth.logout()">Sign Out</button>`;
    sidebar.appendChild(bar);
  }

  // ---- Login handler ----
  async function _handleLogin() {
    const username = document.getElementById('auth-username')?.value.trim();
    const password = document.getElementById('auth-password')?.value;

    if (!username || !password) {
      showAuthError('Please enter your username and password.');
      return;
    }

    const cfg = getAuthConfig();
    if (!cfg) { showSetupScreen(); return; }
    if (cfg.username !== username) {
      recordFailedAttempt();
      showAuthError('Invalid username or password.');
      return;
    }

    const lockout = isLockedOut();
    if (lockout) { startLockoutCountdown(lockout.seconds); return; }

    setLoading(true);
    try {
      const salt = fromB64(cfg.salt);
      const key  = await deriveKey(password, salt);
      // Verify by decrypting the stored verifier
      await _decrypt(key, cfg.verifier); // throws if wrong password
      _key = key;
      _username = username;
      clearLockout();
      await storeSession(key, username);
      bootApp();
    } catch {
      setLoading(false);
      const remaining = recordFailedAttempt();
      const lockout2 = isLockedOut();
      if (lockout2) {
        showLoginScreen();
        return;
      }
      showAuthError(`Invalid username or password. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining before lockout.`);
    }
  }

  // ---- Setup handler ----
  async function _handleSetup() {
    const username = document.getElementById('setup-username')?.value.trim();
    const password = document.getElementById('setup-password')?.value;
    const confirm  = document.getElementById('setup-confirm')?.value;

    if (!username || username.length < 3) {
      showAuthError('Username must be at least 3 characters.');
      return;
    }
    if (!password || password.length < 12) {
      showAuthError('Password must be at least 12 characters.');
      return;
    }
    const strength = passwordStrength(password);
    if (strength.label === 'Weak') {
      showAuthError('Password is too weak. Use uppercase, lowercase, numbers and symbols.');
      return;
    }
    if (password !== confirm) {
      showAuthError('Passwords do not match.');
      document.getElementById('setup-confirm')?.classList.add('error');
      return;
    }

    setLoading(true);
    try {
      const salt = randBytes(16);
      const key  = await deriveKey(password, salt);
      // Store a verifier (encrypted known plaintext)
      const verifier = await _encrypt(key, VERIFY_PLAIN);
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        username,
        salt: toB64(salt.buffer),
        verifier,
      }));
      _key = key;
      _username = username;
      await storeSession(key, username);
      bootApp();
    } catch (err) {
      setLoading(false);
      showAuthError('Setup failed: ' + err.message);
    }
  }

  function _updateStrength(pw) {
    const s = passwordStrength(pw);
    const fill  = document.getElementById('pw-strength-fill');
    const label = document.getElementById('pw-strength-label');
    if (fill)  { fill.style.width = s.pct + '%'; fill.style.background = s.color; }
    if (label) { label.textContent = s.label; label.style.color = s.color; }
  }

  // ---- Boot app after authentication ----
  function bootApp() {
    // Re-create the app DOM
    document.body.innerHTML = '<div id="app"></div><div id="modal-root"></div>';
    const el = document.getElementById('auth-overlay');
    if (el) el.remove();
    attachIdleListeners();
    // Signal that auth is complete — app will load
    if (_resolve) { _resolve(); _resolve = null; }
    // Inject session bar once sidebar is rendered
    const observer = new MutationObserver(() => {
      if (document.getElementById('sidebar')) {
        injectSessionBar();
        observer.disconnect();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  // ---- Init ----
  async function init() {
    injectStyles();
    if (!isSetup()) {
      showSetupScreen();
      return;
    }
    const resumed = await restoreSession();
    if (resumed) {
      bootApp();
    } else {
      showLoginScreen();
    }
  }

  // ---- Public API ----
  return {
    ready,
    init,
    encrypt,
    decrypt,
    logout,
    get username() { return _username; },
    get isAuthenticated() { return !!_key; },
    // Exposed for inline handlers
    _handleLogin,
    _handleSetup,
    _updateStrength,
  };
})();

// ---- Global helpers for inline HTML handlers ----
function togglePwVisibility(inputId, btn) {
  const el = document.getElementById(inputId);
  if (!el) return;
  const isHidden = el.type === 'password';
  el.type = isHidden ? 'text' : 'password';
  btn.textContent = isHidden ? '🙈' : '👁';
}

// Boot
Auth.init();
