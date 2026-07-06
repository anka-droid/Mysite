/* ============================================================
   Kamkhadze PA — Authentication & Encryption Layer
   Uses Web Crypto API: PBKDF2 key derivation + AES-256-GCM
   No external dependencies. All crypto runs in-browser.
   ============================================================ */

const Auth = (() => {
  const STORAGE_KEY   = 'km_auth_v1';
  const SESSION_KEY   = 'km_session_v1';
  const LOCKOUT_KEY   = 'km_lockout_v1';
  const PBKDF2_ITERS  = 600000;
  const SESSION_MINS  = 30;
  const MAX_ATTEMPTS  = 5;
  const LOCKOUT_MINS  = 5;
  const VERIFY_PLAIN  = 'kamkhadze-pa-auth-ok-v1';

  let _key = null;        // the Data Encryption Key (DEK) once unlocked
  let _username = '';
  let _vaultId = '';      // whose data slot we read/write (shared vault owner)
  let _role = '';         // this user's role (managing_attorney, paralegal, …)
  let _idleTimer = null;
  let _resolve = null;

  const ready = new Promise(res => { _resolve = res; });

  const enc = v => new TextEncoder().encode(v);
  const toB64 = buf => {
    // Chunked conversion — spreading a large Uint8Array into String.fromCharCode
    // overflows the call stack once the data grows past a few dozen KB.
    const bytes = new Uint8Array(buf);
    let binary = '';
    const CHUNK = 0x8000; // 32K bytes per chunk
    for (let i = 0; i < bytes.length; i += CHUNK) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    }
    return btoa(binary);
  };
  const fromB64 = b64 => Uint8Array.from(atob(b64), c => c.charCodeAt(0));

  function randBytes(n) {
    return crypto.getRandomValues(new Uint8Array(n));
  }

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

  // ---- Key wrapping (multi-user vault) --------------------------------------
  // The shared Data Encryption Key (DEK) is wrapped with each user's
  // password-derived Key Encryption Key (KEK). This lets several people, each
  // with their own password, unlock the SAME encrypted case data without ever
  // re-encrypting it.
  async function _wrapKey(kek, dek) {
    const raw = await crypto.subtle.exportKey('raw', dek);
    return _encrypt(kek, toB64(raw));           // base64(raw DEK) → ciphertext
  }

  async function _unwrapKey(kek, wrapped) {
    const b64 = await _decrypt(kek, wrapped);   // throws on wrong KEK
    const raw = fromB64(b64);
    return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  }

  // Given a stored auth config + password, verify the password and return the
  // unlocked DEK plus vault/role metadata. Throws if the password is wrong.
  async function _unlock(cfg, password) {
    const salt = fromB64(cfg.salt);
    const kek  = await deriveKey(password, salt);
    await _decrypt(kek, cfg.verifier);          // password check (throws if bad)
    // v2 (vault) configs carry a wrapped DEK; v1 (legacy) configs derive the
    // data key directly from the password.
    const dataKey = cfg.wrappedDEK ? await _unwrapKey(kek, cfg.wrappedDEK) : kek;
    return { key: dataKey, vaultId: cfg.vaultId || cfg.username, role: cfg.role || '' };
  }

  function _applyRole() {
    if (_role && typeof RBAC !== 'undefined' && typeof RBAC.setUserRole === 'function') {
      RBAC.setUserRole(_username, _role);
    }
  }

  async function encrypt(plaintext) {
    if (!_key) throw new Error('Not authenticated');
    return _encrypt(_key, plaintext);
  }

  async function decrypt(b64) {
    if (!_key) throw new Error('Not authenticated');
    return _decrypt(_key, b64);
  }

  async function storeSession(key, username, vaultId, role) {
    const jwk = await crypto.subtle.exportKey('jwk', key);
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({
      jwk, username, vaultId: vaultId || username, role: role || '', ts: Date.now(),
    }));
  }

  async function restoreSession() {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return false;
    try {
      const { jwk, username, vaultId, role, ts } = JSON.parse(raw);
      if (Date.now() - ts > SESSION_MINS * 60 * 1000) {
        sessionStorage.removeItem(SESSION_KEY);
        return false;
      }
      _key = await crypto.subtle.importKey('jwk', jwk, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
      _username = username;
      _vaultId  = vaultId || username;
      _role     = role || '';
      _applyRole();
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

  function getAuthConfig() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch { return null; }
  }

  function isSetup() {
    return !!getAuthConfig();
  }

  function logout(idle = false) {
    _key = null;
    _username = '';
    _vaultId = '';
    _role = '';
    sessionStorage.removeItem(SESSION_KEY);
    clearTimeout(_idleTimer);
    if (idle) {
      showLoginScreen('Your session expired due to inactivity.');
    } else {
      showLoginScreen();
    }
  }

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
    if (score <= 2) return { label: 'Weak',   color: 'var(--red)',    pct: 20 };
    if (score <= 3) return { label: 'Fair',   color: 'var(--yellow)', pct: 45 };
    if (score <= 4) return { label: 'Good',   color: 'var(--blue)',   pct: 70 };
    return               { label: 'Strong', color: 'var(--green)',  pct: 100 };
  }

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
        font-family: var(--font-serif);
        font-size: 26px;
        font-weight: 600;
        color: var(--white);
        letter-spacing: 0.04em;
        margin-bottom: 4px;
      }
      .auth-logo span { color: var(--gold); }
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
        border: 2px solid rgba(8,8,15,0.3);
        border-top-color: var(--bg);
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
        <div class="auth-logo">ESQ<span>.</span>MBA</div>
        <div class="auth-sub">Secure Case Manager</div>
        <div class="auth-title">Sign In</div>
        <div class="auth-desc">
          Attorney-client privileged data. Authorized personnel only.
        </div>
        ${message ? `<div class="auth-info" style="display:block">${message}</div>` : ''}
        <div class="auth-error" id="auth-error"></div>
        <div class="auth-info" id="auth-info" style="display:none"></div>
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
          <div style="text-align:center;margin-top:14px;display:flex;justify-content:space-between;font-size:12px;">
            <a href="#" onclick="Auth._showSetup();return false"
              style="color:var(--text-3);text-decoration:underline;">Create account</a>
            <a href="#" onclick="Auth._showForgotPassword();return false"
              style="color:var(--text-3);text-decoration:underline;">Forgot password?</a>
          </div>
        `}
        <div class="auth-footer">
          🔒 Encrypted with AES-256-GCM · PBKDF2 key derivation<br/>
          Sign in from any device — your data restores automatically.
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
        <div class="auth-logo">ESQ<span>.</span>MBA</div>
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
        <div style="text-align:center;margin-top:16px;font-size:13px;color:var(--text-3)">
          Already have an account?
          <a href="#" onclick="Auth._showLogin();return false"
            style="color:var(--gold);text-decoration:none;font-weight:600"> Sign in →</a>
        </div>
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

  async function _handleLogin() {
    const username = document.getElementById('auth-username')?.value.trim();
    const password = document.getElementById('auth-password')?.value;

    if (!username || !password) {
      showAuthError('Please enter your username and password.');
      return;
    }

    const lockout = isLockedOut();
    if (lockout) { startLockoutCountdown(lockout.seconds); return; }

    setLoading(true);

    let cfg = getAuthConfig();

    // No local config for this username — new device (or a paralegal on their
    // own machine). Recover the account from Supabase.
    if (!cfg || cfg.username !== username) {
      showAuthNotice('New device detected — checking cloud for your account…');
      const remote = await _fetchRemoteAuthConfig(username);
      if (remote.error) {
        setLoading(false);
        showAuthError('Could not reach the cloud to verify your account. Check your connection and try again — do NOT create a new account, your data is safe.');
        return;
      }
      if (!remote.cfg) {
        setLoading(false);
        showAuthError('No account found for this username. Create one first.');
        return;
      }
      try {
        const unlocked = await _unlock(remote.cfg, password);
        // Password correct — cache config locally so future logins work offline
        localStorage.setItem(STORAGE_KEY, JSON.stringify(remote.cfg));
        _key = unlocked.key;
        _username = username;
        _vaultId = unlocked.vaultId;
        _role = unlocked.role;
        clearLockout();
        await storeSession(_key, username, _vaultId, _role);
        _applyRole();
        bootApp();
      } catch {
        setLoading(false);
        const remaining = recordFailedAttempt();
        showAuthError(`Invalid password. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.`);
      }
      return;
    }

    try {
      const unlocked = await _unlock(cfg, password);
      _key = unlocked.key;
      _username = username;
      _vaultId = unlocked.vaultId;
      _role = unlocked.role;
      clearLockout();
      await storeSession(_key, username, _vaultId, _role);
      _applyRole();
      // Self-heal: re-upload this account's credentials to the cloud on every
      // login, so another device can always recover it (fire-and-forget).
      _pushRemoteAuthConfig(username, cfg);
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
      const verifier = await _encrypt(key, VERIFY_PLAIN);
      // First account is the Managing Attorney and owns the shared data vault.
      const authCfg = { username, salt: toB64(salt.buffer), verifier, vaultId: username, role: 'managing_attorney' };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(authCfg));
      _key = key;
      _username = username;
      _vaultId = username;
      _role = 'managing_attorney';
      await storeSession(key, username, _vaultId, _role);
      _applyRole();
      // Push auth config to Supabase so this account can be recovered on any device
      await _pushRemoteAuthConfig(username, authCfg);
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

  function showAuthNotice(msg) {
    const el = document.getElementById('auth-info');
    if (el) { el.textContent = msg; el.style.display = 'block'; }
  }

  // ---- Supabase helpers (standalone — no dependency on case-manager-supabase.js) ----
  const _SB_URL = 'https://nqcgfiicirlqvnmkzehy.supabase.co';
  const _SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5xY2dmaWljaXJscXZubWt6ZWh5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk5NDQ0NDAsImV4cCI6MjA5NTUyMDQ0MH0.WPZbZNidW99ZlXUjKOQ9yXro12sev9cYp2Px2pkgKQI';

  // Returns { cfg } on success (cfg may be null if no such account),
  // or { error:'network' } if the cloud could not be reached / errored.
  // The distinction matters: never tell a user "no account, create one" when
  // the truth is simply that Supabase was unreachable.
  async function _fetchRemoteAuthConfig(username) {
    try {
      const url = localStorage.getItem('km_supabase_url') || _SB_URL;
      const key = localStorage.getItem('km_supabase_anon_key') || _SB_KEY;
      const res = await fetch(
        `${url}/rest/v1/km_sync?username=eq.${encodeURIComponent(username)}&slot=eq.auth_config&select=data&limit=1`,
        { headers: { apikey: key, Authorization: `Bearer ${key}` } }
      );
      if (!res.ok) return { error: 'network' };
      const rows = await res.json();
      return { cfg: rows?.[0]?.data ? JSON.parse(rows[0].data) : null };
    } catch { return { error: 'network' }; }
  }

  // Managing Attorney creates a login for another user (e.g. a paralegal).
  // Requires an unlocked session — the current DEK is wrapped with the new
  // user's password so they can decrypt the SAME shared case data.
  async function createUser(newUsername, tempPassword, role) {
    if (!_key) throw new Error('You must be signed in to create a user.');
    if (typeof RBAC !== 'undefined' && typeof RBAC.can === 'function' && !RBAC.can('manage_users')) {
      throw new Error('Only the Managing Attorney can create user logins.');
    }
    newUsername = (newUsername || '').trim();
    if (newUsername.length < 3) throw new Error('Username must be at least 3 characters.');
    if (!tempPassword || tempPassword.length < 8) throw new Error('Temporary password must be at least 8 characters.');

    const existing = await _fetchRemoteAuthConfig(newUsername);
    if (existing.error) throw new Error('Could not reach the cloud to create the account. Try again.');
    if (existing.cfg)  throw new Error('That username already exists — choose another.');

    const salt      = randBytes(16);
    const kek       = await deriveKey(tempPassword, salt);
    const verifier  = await _encrypt(kek, VERIFY_PLAIN);
    const wrappedDEK = await _wrapKey(kek, _key);
    const cfg = {
      v: 2,
      username: newUsername,
      salt: toB64(salt.buffer),
      verifier,
      wrappedDEK,
      vaultId: _vaultId || _username,   // share THIS user's data vault
      role: role || 'paralegal',
    };
    await _pushRemoteAuthConfig(newUsername, cfg);
    return cfg;
  }

  async function _pushRemoteAuthConfig(username, cfg) {
    try {
      const url = localStorage.getItem('km_supabase_url') || _SB_URL;
      const key = localStorage.getItem('km_supabase_anon_key') || _SB_KEY;
      await fetch(`${url}/rest/v1/km_sync?on_conflict=username,slot`, {
        method: 'POST',
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates',
        },
        body: JSON.stringify({
          username,
          slot: 'auth_config',
          data: JSON.stringify(cfg),
          updated_at: new Date().toISOString(),
        }),
      });
    } catch(e) {
      console.warn('[Auth] Could not push auth config to Supabase:', e.message);
    }
  }

  function bootApp() {
    document.body.innerHTML = '<div id="app"></div><div id="modal-root"></div>';
    const el = document.getElementById('auth-overlay');
    if (el) el.remove();
    attachIdleListeners();
    if (_resolve) { _resolve(); _resolve = null; }
    const observer = new MutationObserver(() => {
      if (document.getElementById('sidebar')) {
        injectSessionBar();
        observer.disconnect();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  // ── Forgot Password screen ────────────────────────────────────────────────
  function _showForgotPassword() {
    injectStyles();
    const overlay = document.getElementById('auth-overlay');
    if (!overlay) return;
    overlay.querySelector('.auth-card').innerHTML = `
      <div class="auth-logo">ESQ<span>.</span>MBA</div>
      <div class="auth-sub">Password Recovery</div>
      <div class="auth-title">Reset Password</div>
      <div class="auth-desc">
        Enter your account email address. If it exists, we'll send a reset link.
        The link expires in <strong style="color:var(--gold)">1 hour</strong>.
      </div>
      <div class="auth-error" id="auth-error"></div>
      <div class="auth-info" id="auth-info"></div>
      <div class="auth-field">
        <label>Email Address</label>
        <input type="email" id="forgot-email" autocomplete="email" placeholder="your-email@example.com" autofocus />
      </div>
      <button class="auth-btn" id="auth-submit-btn" onclick="Auth._handleForgotSubmit()">
        <span id="auth-btn-text">Send Reset Link</span>
        <div class="auth-spinner" id="auth-spinner"></div>
      </button>
      <div style="text-align:center;margin-top:14px">
        <button type="button" onclick="Auth._showLogin()"
          style="background:none;border:none;color:var(--text-3);font-size:12px;cursor:pointer;text-decoration:underline;padding:4px 8px;">
          ← Back to Sign In
        </button>
      </div>
      <div class="auth-footer">🔒 If your account exists, a secure link will be emailed to you.</div>`;
    document.getElementById('forgot-email')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') Auth._handleForgotSubmit();
    });
  }

  async function _handleForgotSubmit() {
    const email = document.getElementById('forgot-email')?.value.trim();
    if (!email) { const el = document.getElementById('auth-error'); if (el) { el.textContent='Please enter your email address.'; el.style.display='block'; } return; }
    if (!window.API) {
      const el = document.getElementById('auth-error');
      if (el) { el.textContent='Password reset requires a backend server. Contact anka@esq.mba to reset your password.'; el.style.display='block'; }
      return;
    }
    const btn = document.getElementById('auth-submit-btn');
    const spin = document.getElementById('auth-spinner');
    const txt  = document.getElementById('auth-btn-text');
    if (btn) btn.disabled = true;
    if (spin) spin.style.display = 'block';
    if (txt)  txt.style.display  = 'none';
    try {
      await window.API.post('/api/auth/forgot-password', { username: email });
      if (btn) btn.style.display = 'none';
      const info = document.getElementById('auth-info');
      if (info) { info.textContent = '✅ If that account exists, a reset email has been sent. Check your inbox.'; info.style.display = 'block'; }
    } catch {
      if (btn) { btn.disabled=false; }
      if (spin) spin.style.display='none';
      if (txt)  txt.style.display='inline';
      const el = document.getElementById('auth-error');
      if (el) { el.textContent='Could not send reset email. Please try again.'; el.style.display='block'; }
    }
  }

  // ── Accept Invite screen ──────────────────────────────────────────────────
  function _showAcceptInvite(token, name) {
    injectStyles();
    document.body.innerHTML = '';
    const overlay = document.createElement('div');
    overlay.id = 'auth-overlay';
    overlay.innerHTML = `
      <div class="auth-card">
        <div class="auth-logo">ESQ<span>.</span>MBA</div>
        <div class="auth-sub">Team Invitation</div>
        <div class="auth-title">Welcome${name ? ', ' + name : ''}!</div>
        <div class="auth-desc">
          You've been invited to join the Kamkhadze PA Case Management System.
          Set your password to activate your account.
        </div>
        <div class="auth-error" id="auth-error"></div>
        <div class="auth-field">
          <label>Your Name</label>
          <input type="text" id="invite-name" autocomplete="name" placeholder="Your full name" value="${name || ''}" autofocus />
        </div>
        <div class="auth-field">
          <label>Password</label>
          <div class="auth-input-wrap">
            <input type="password" id="invite-password" autocomplete="new-password"
              placeholder="Minimum 12 characters" oninput="Auth._updateStrength(this.value)" />
            <button type="button" class="auth-show-pw" onclick="togglePwVisibility('invite-password',this)">👁</button>
          </div>
          <div class="pw-strength-bar"><div class="pw-strength-fill" id="pw-strength-fill" style="width:0%;background:var(--red)"></div></div>
          <div class="pw-strength-label" id="pw-strength-label" style="color:var(--text-3)">Enter a password</div>
        </div>
        <div class="auth-field">
          <label>Confirm Password</label>
          <div class="auth-input-wrap">
            <input type="password" id="invite-confirm" autocomplete="new-password" placeholder="Repeat password" />
            <button type="button" class="auth-show-pw" onclick="togglePwVisibility('invite-confirm',this)">👁</button>
          </div>
        </div>
        <button class="auth-btn" id="auth-submit-btn" onclick="Auth._handleInviteSubmit('${token}')">
          <span id="auth-btn-text">Activate Account</span>
          <div class="auth-spinner" id="auth-spinner"></div>
        </button>
        <div class="auth-footer">🔒 Attorney-client privileged system. Do not share your credentials.</div>
      </div>`;
    document.body.appendChild(overlay);
  }

  async function _handleInviteSubmit(token) {
    const pw      = document.getElementById('invite-password')?.value;
    const confirm = document.getElementById('invite-confirm')?.value;
    const name    = document.getElementById('invite-name')?.value.trim();
    if (!pw || pw.length < 12) { const el=document.getElementById('auth-error'); if(el){el.textContent='Password must be at least 12 characters.';el.style.display='block';} return; }
    if (pw !== confirm)        { const el=document.getElementById('auth-error'); if(el){el.textContent='Passwords do not match.';el.style.display='block';} return; }
    if (!window.API) { const el=document.getElementById('auth-error'); if(el){el.textContent='Backend not connected.';el.style.display='block';} return; }
    setLoading(true);
    try {
      const data = await window.API.post('/api/auth/accept-invite', { token, password: pw, displayName: name || undefined });
      if (data?.token) { window.API.setToken(data.token); _username = data.user?.name || data.user?.username || ''; bootApp(); }
    } catch(err) {
      setLoading(false);
      const el = document.getElementById('auth-error');
      if (el) { el.textContent = err.message || 'Could not activate account. The invitation may have expired.'; el.style.display='block'; }
    }
  }

  // ── Create User (paralegal) modal — MA only, used inside the app ───────────
  function showCreateUser() {
    if (typeof RBAC !== 'undefined' && typeof RBAC.can === 'function' && !RBAC.can('manage_users')) {
      if (typeof toast === 'function') toast('Only the Managing Attorney can create logins', 'warn');
      return;
    }
    document.getElementById('create-user-modal')?.remove();
    const modal = document.createElement('div');
    modal.id = 'create-user-modal';
    modal.style.cssText = 'position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.55);backdrop-filter:blur(3px);font-family:var(--font-sans,sans-serif);';
    modal.innerHTML = `
      <div style="background:var(--surface,#fff);color:var(--text-1,#111);border:1px solid var(--border,#e5e7eb);border-radius:14px;padding:26px;width:100%;max-width:440px;box-shadow:0 24px 70px rgba(0,0,0,0.35);">
        <h3 style="margin:0 0 6px;font-size:1.15rem;font-weight:700;">Create a Team Login</h3>
        <p style="margin:0 0 18px;font-size:0.85rem;color:var(--text-3,#6b7280);line-height:1.5;">
          They'll sign in on their own device with this username and temporary password,
          and see the <strong>same cases</strong> you do. Share the password securely; they can use it right away.
        </p>
        <div id="cu-error" style="display:none;background:#fef2f2;color:#b91c1c;border:1px solid #fecaca;border-radius:8px;padding:8px 10px;font-size:0.8rem;margin-bottom:12px;"></div>
        <div style="margin-bottom:12px;">
          <label style="display:block;font-size:0.8rem;font-weight:600;margin-bottom:5px;">Username</label>
          <input id="cu-username" type="text" placeholder="e.g. maria.paralegal" autocomplete="off"
            style="width:100%;padding:0.55rem 0.7rem;border:1px solid var(--border,#d1d5db);border-radius:8px;font-size:0.9rem;box-sizing:border-box;background:var(--bg,#fff);color:inherit;">
        </div>
        <div style="margin-bottom:12px;">
          <label style="display:block;font-size:0.8rem;font-weight:600;margin-bottom:5px;">Role</label>
          <select id="cu-role" style="width:100%;padding:0.55rem 0.7rem;border:1px solid var(--border,#d1d5db);border-radius:8px;font-size:0.9rem;box-sizing:border-box;background:var(--bg,#fff);color:inherit;">
            <option value="paralegal" selected>Paralegal</option>
            <option value="case_manager">Case Manager</option>
            <option value="associate_attorney">Associate Attorney</option>
          </select>
        </div>
        <div style="margin-bottom:18px;">
          <label style="display:block;font-size:0.8rem;font-weight:600;margin-bottom:5px;">Temporary password</label>
          <div style="display:flex;gap:8px;">
            <input id="cu-password" type="text" placeholder="At least 8 characters"
              style="flex:1;padding:0.55rem 0.7rem;border:1px solid var(--border,#d1d5db);border-radius:8px;font-size:0.9rem;box-sizing:border-box;background:var(--bg,#fff);color:inherit;">
            <button type="button" onclick="document.getElementById('cu-password').value=Auth._genPassword()"
              style="border:1px solid var(--border,#d1d5db);border-radius:8px;background:none;color:inherit;padding:0 0.7rem;cursor:pointer;font-size:0.8rem;">Generate</button>
          </div>
        </div>
        <div style="display:flex;gap:10px;justify-content:flex-end;">
          <button onclick="document.getElementById('create-user-modal').remove()"
            style="background:none;border:1px solid var(--border,#d1d5db);border-radius:8px;padding:0.5rem 1.1rem;cursor:pointer;font-size:0.9rem;color:inherit;">Cancel</button>
          <button id="cu-submit" onclick="Auth._submitCreateUser()"
            style="background:#4f46e5;color:#fff;border:none;border-radius:8px;padding:0.5rem 1.25rem;cursor:pointer;font-size:0.9rem;font-weight:600;">Create Login</button>
        </div>
      </div>`;
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    document.body.appendChild(modal);
    setTimeout(() => document.getElementById('cu-username')?.focus(), 50);
  }

  function _genPassword() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    const bytes = randBytes(14);
    let out = '';
    for (let i = 0; i < bytes.length; i++) out += chars[bytes[i] % chars.length];
    return out;
  }

  async function _submitCreateUser() {
    const errEl = document.getElementById('cu-error');
    const showErr = m => { if (errEl) { errEl.textContent = m; errEl.style.display = 'block'; } };
    const username = document.getElementById('cu-username')?.value.trim();
    const role     = document.getElementById('cu-role')?.value;
    const password = document.getElementById('cu-password')?.value;
    const btn = document.getElementById('cu-submit');
    if (btn) { btn.disabled = true; btn.textContent = 'Creating…'; }
    try {
      await createUser(username, password, role);
      // Register them in the RBAC staff list too, for case assignment.
      if (typeof RBAC !== 'undefined' && typeof RBAC.saveStaff === 'function') {
        RBAC.saveStaff({ name: username, email: '', role });
      }
      document.getElementById('create-user-modal')?.remove();
      if (typeof toast === 'function') {
        toast(`Login created for ${username}. Password: ${password}`, 'success');
      } else {
        alert(`Login created.\n\nUsername: ${username}\nTemporary password: ${password}\n\nShare these securely.`);
      }
    } catch (err) {
      if (btn) { btn.disabled = false; btn.textContent = 'Create Login'; }
      showErr(err.message || 'Could not create the login.');
    }
  }

  async function init() {
    injectStyles();

    // Handle invite token in URL
    const params = new URLSearchParams(window.location.search);
    const inviteToken = params.get('invite_token');
    if (inviteToken) {
      _showAcceptInvite(inviteToken, params.get('name') || '');
      return;
    }

    if (!isSetup()) {
      // No local config — could be a new user or a returning user on a new device.
      // Show login first (it has a "Create account" link for truly new users).
      showLoginScreen();
      return;
    }
    const resumed = await restoreSession();
    if (resumed) {
      bootApp();
    } else {
      showLoginScreen();
    }
  }

  return {
    ready,
    init,
    encrypt,
    decrypt,
    logout,
    createUser,
    showCreateUser,
    get username() { return _username; },
    get isAuthenticated() { return !!_key; },
    get dataOwner() { return _vaultId || _username; },
    get role() { return _role; },
    _handleLogin,
    _handleSetup,
    _updateStrength,
    _showSetup: showSetupScreen,
    _showLogin: showLoginScreen,
    _showForgotPassword,
    _handleForgotSubmit,
    _showAcceptInvite,
    _handleInviteSubmit,
    _submitCreateUser,
    _genPassword,
  };
})();

function togglePwVisibility(inputId, btn) {
  const el = document.getElementById(inputId);
  if (!el) return;
  const isHidden = el.type === 'password';
  el.type = isHidden ? 'text' : 'password';
  btn.textContent = isHidden ? '🙈' : '👁';
}

Auth.init();
