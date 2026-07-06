/* ============================================================
   Kamkhadze PA — Supabase Cloud Sync
   All data is encrypted client-side with AES-256-GCM BEFORE
   being sent to Supabase. Supabase only ever sees ciphertext.
   Load AFTER case-manager-auth.js and case-manager.js
   ============================================================ */

// Pre-configured Supabase credentials (baked in — no manual setup needed)
const _SB_URL = 'https://nqcgfiicirlqvnmkzehy.supabase.co';
const _SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5xY2dmaWljaXJscXZubWt6ZWh5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk5NDQ0NDAsImV4cCI6MjA5NTUyMDQ0MH0.WPZbZNidW99ZlXUjKOQ9yXro12sev9cYp2Px2pkgKQI';

// Seed localStorage on first load so Settings panel shows them
if (!localStorage.getItem('km_supabase_url')) localStorage.setItem('km_supabase_url', _SB_URL);
if (!localStorage.getItem('km_supabase_anon_key')) localStorage.setItem('km_supabase_anon_key', _SB_KEY);

const SupabaseSync = (() => {
  const CFG_URL = 'km_supabase_url';
  const CFG_KEY = 'km_supabase_anon_key';

  function cfg() {
    return {
      url: (localStorage.getItem(CFG_URL) || _SB_URL).replace(/\/$/, ''),
      key: localStorage.getItem(CFG_KEY) || _SB_KEY,
    };
  }

  function isConfigured() {
    // Always configured — credentials are baked in
    return true;
  }

  async function _req(method, path, body) {
    const c = cfg();
    if (!c.url || !c.key) throw new Error('Supabase not configured');
    const headers = {
      'apikey': c.key,
      'Authorization': `Bearer ${c.key}`,
      'Content-Type': 'application/json',
    };
    if (method === 'POST' || method === 'PUT') {
      headers['Prefer'] = 'resolution=merge-duplicates,return=representation';
    }
    const res = await fetch(`${c.url}/rest/v1/${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`Supabase ${res.status}: ${txt}`);
    }
    return res.json().catch(() => null);
  }

  // Push one slot of encrypted data for this user.
  // on_conflict=username,slot tells PostgREST to UPDATE the existing row
  // instead of inserting a duplicate (which violates the unique constraint).
  async function push(username, slot, blob) {
    if (!isConfigured()) return;
    await _req('POST', 'km_sync?on_conflict=username,slot', {
      username,
      slot,
      data: blob,
      updated_at: new Date().toISOString(),
    });
  }

  // Pull one slot
  async function pull(username, slot) {
    if (!isConfigured()) return null;
    const rows = await _req('GET',
      `km_sync?username=eq.${encodeURIComponent(username)}&slot=eq.${encodeURIComponent(slot)}&select=data,updated_at&order=updated_at.desc&limit=1`
    );
    return rows?.[0] || null;
  }

  // Pull all slots for user (for full restore)
  async function pullAll(username) {
    if (!isConfigured()) return [];
    const rows = await _req('GET',
      `km_sync?username=eq.${encodeURIComponent(username)}&select=slot,data,updated_at`
    );
    return rows || [];
  }

  // Test connection
  async function testConnection() {
    try {
      await _req('GET', 'km_sync?limit=1&select=slot');
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  return { isConfigured, push, pull, pullAll, testConnection, cfg };
})();


// ================================================================
// Patch Storage.save to also push to Supabase (encrypted)
// ================================================================
const _origStorageSave = Storage.save.bind(Storage);
Storage.save = async function() {
  await _origStorageSave();

  if (!SupabaseSync.isConfigured()) return;
  if (!Auth.isAuthenticated) return;

  try {
    const blob = localStorage.getItem('km_cases_enc_v1');
    if (blob) {
      await SupabaseSync.push(Auth.dataOwner || Auth.username, 'cases', blob);
    }
  } catch (e) {
    console.warn('[Supabase] Push failed (cases):', e.message);
  }
};


// ================================================================
// Patch Storage.load to pull from Supabase if local is empty
// ================================================================
const _origStorageLoad = Storage.load.bind(Storage);
Storage.load = async function() {
  await _origStorageLoad();

  if (!SupabaseSync.isConfigured()) return;
  if (!Auth.isAuthenticated) return;

  try {
    const remote = await SupabaseSync.pull(Auth.dataOwner || Auth.username, 'cases');
    if (!remote) return;

    const localBlob = localStorage.getItem('km_cases_enc_v1');

    // Use whichever is newer
    const remoteNewer = !localBlob || (remote.updated_at && new Date(remote.updated_at) > _localUpdatedAt());

    if (remoteNewer && remote.data) {
      try {
        const json = await Auth.decrypt(remote.data);
        State.cases = JSON.parse(json);
        // Write to local too
        localStorage.setItem('km_cases_enc_v1', remote.data);
        console.info('[Supabase] Restored cases from cloud');
      } catch (e) {
        console.warn('[Supabase] Could not decrypt remote cases:', e.message);
      }
    }
  } catch (e) {
    console.warn('[Supabase] Pull failed:', e.message);
  }
};

function _localUpdatedAt() {
  try {
    const ts = localStorage.getItem('km_cases_updated_at');
    return ts ? new Date(ts) : new Date(0);
  } catch { return new Date(0); }
}

// Track when we last saved locally
const _origSave2 = Storage.save.bind(Storage);
const _origLoad2 = Storage.load.bind(Storage);

// Timestamp every local save
(function patchSaveTimestamp() {
  const orig = Storage.save;
  Storage.save = async function() {
    await orig.call(this);
    localStorage.setItem('km_cases_updated_at', new Date().toISOString());
  };
})();


// ================================================================
// Sync all other data (zoom, emails, invoices) to Supabase
// ================================================================
async function _syncSlot(slot, localKey) {
  if (!SupabaseSync.isConfigured() || !Auth.isAuthenticated) return;
  try {
    const raw = localStorage.getItem(localKey);
    if (!raw) return;
    const encrypted = await Auth.encrypt(raw);
    await SupabaseSync.push(Auth.dataOwner || Auth.username, slot, encrypted);
  } catch (e) {
    console.warn(`[Supabase] Push failed (${slot}):`, e.message);
  }
}

async function _restoreSlot(slot, localKey) {
  if (!SupabaseSync.isConfigured() || !Auth.isAuthenticated) return;
  try {
    const remote = await SupabaseSync.pull(Auth.dataOwner || Auth.username, slot);
    if (!remote?.data) return;
    const plain = await Auth.decrypt(remote.data);
    localStorage.setItem(localKey, plain);
    return JSON.parse(plain);
  } catch (e) {
    console.warn(`[Supabase] Restore failed (${slot}):`, e.message);
    return null;
  }
}

// Call after boot to pull all supplementary data from cloud
async function supabaseRestoreAll() {
  if (!SupabaseSync.isConfigured()) return;
  await Promise.allSettled([
    _restoreSlot('zoom',          'km_zoom_meetings'),
    _restoreSlot('email_sent',    'km_email_sent'),
    _restoreSlot('invoices',      'km_invoices'),
    _restoreSlot('questionnaires','km_questionnaires'),
    _restoreSlot('team_chat',     'km_team_chat'),
    _restoreSlot('email_drafts',  'km_email_drafts'),
  ]);
  console.info('[Supabase] All slots restored from cloud');
}

// Push all data to cloud (called on changes)
async function supabasePushAll() {
  if (!SupabaseSync.isConfigured()) return;
  await Promise.allSettled([
    _syncSlot('zoom',          'km_zoom_meetings'),
    _syncSlot('email_sent',    'km_email_sent'),
    _syncSlot('invoices',      'km_invoices'),
    _syncSlot('questionnaires','km_questionnaires'),
    _syncSlot('team_chat',     'km_team_chat'),
    _syncSlot('email_drafts',  'km_email_drafts'),
  ]);
}

// Patch key localStorage writes to auto-sync
(function patchLocalStorageSync() {
  const orig = localStorage.setItem.bind(localStorage);
  const syncSlots = {
    'km_zoom_meetings':    ['zoom',          'km_zoom_meetings'],
    'km_email_sent':       ['email_sent',    'km_email_sent'],
    'km_invoices':         ['invoices',      'km_invoices'],
    'km_questionnaires':   ['questionnaires','km_questionnaires'],
    'km_team_chat':        ['team_chat',     'km_team_chat'],
    'km_email_drafts':     ['email_drafts',  'km_email_drafts'],
  };
  localStorage.setItem = function(key, value) {
    orig(key, value);
    if (syncSlots[key] && SupabaseSync.isConfigured() && Auth.isAuthenticated) {
      const [slot, localKey] = syncSlots[key];
      _syncSlot(slot, localKey);
    }
  };
})();


// ================================================================
// Full Backup / Restore
// ================================================================
async function supabaseFullBackup() {
  if (!SupabaseSync.isConfigured()) {
    toast('Supabase not configured — go to Settings', 'warn');
    return;
  }
  const btn = document.getElementById('sb-backup-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Backing up…'; }
  try {
    await Storage.save();
    await supabasePushAll();
    toast('✓ Full backup to cloud complete');
    if (btn) { btn.disabled = false; btn.textContent = '☁ Backup Now'; }
    renderSupabaseStatus();
  } catch (e) {
    toast('Backup failed: ' + e.message, 'error');
    if (btn) { btn.disabled = false; btn.textContent = '☁ Backup Now'; }
  }
}

async function supabaseFullRestore() {
  if (!SupabaseSync.isConfigured()) {
    toast('Supabase not configured — go to Settings', 'warn');
    return;
  }
  if (!confirm('Restore all data from cloud? This will overwrite your local data.')) return;
  const btn = document.getElementById('sb-restore-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Restoring…'; }
  try {
    await Storage.load();
    await supabaseRestoreAll();
    toast('✓ Data restored from cloud');
    if (btn) { btn.disabled = false; btn.textContent = '⬇ Restore from Cloud'; }
    render();
  } catch (e) {
    toast('Restore failed: ' + e.message, 'error');
    if (btn) { btn.disabled = false; btn.textContent = '⬇ Restore from Cloud'; }
  }
}


// ================================================================
// Status indicator in sidebar
// ================================================================
function renderSupabaseStatus() {
  const el = document.getElementById('sb-sync-status');
  if (!el) return;
  if (!SupabaseSync.isConfigured()) {
    el.innerHTML = '<span style="color:var(--text-3);font-size:11px">☁ Cloud sync off</span>';
    return;
  }
  el.innerHTML = '<span style="color:var(--green);font-size:11px">● Cloud synced</span>';
}


// ================================================================
// Settings panel (injected into existing settings page)
// ================================================================
function renderSupabaseSettings() {
  const c = SupabaseSync.cfg();
  const configured = SupabaseSync.isConfigured();

  return `
    <div class="panel" style="margin-bottom:16px;border-color:${configured ? 'rgba(74,222,128,0.3)' : 'var(--border-2)'}">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
        <span style="font-size:22px">☁</span>
        <strong style="font-size:15px;color:var(--text)">Supabase Cloud Sync</strong>
        <span class="badge ${configured ? 'badge-approved' : 'badge-lead'}">${configured ? '● Connected' : 'Not Connected'}</span>
      </div>

      <p style="font-size:13px;color:var(--text-3);margin-bottom:16px;line-height:1.6">
        Sync all your data to Supabase so it's accessible from any device.
        <strong style="color:var(--gold)">All data is encrypted client-side before upload</strong> — Supabase never sees your plaintext.
      </p>

      ${!configured ? `
      <details style="margin-bottom:16px">
        <summary style="color:var(--gold);font-size:12px;cursor:pointer;font-weight:600">▶ Setup Instructions (one time)</summary>
        <div style="margin-top:12px;padding:14px;background:var(--surface-2);border-radius:8px;font-size:12.5px;color:var(--text-2);line-height:1.8">
          <strong style="color:var(--text)">Step 1:</strong> Go to <strong>supabase.com</strong> → New project<br>
          <strong style="color:var(--text)">Step 2:</strong> In your project → SQL Editor → run this SQL:<br>
          <pre style="background:var(--bg);padding:12px;border-radius:6px;margin:8px 0;overflow-x:auto;font-size:11px;color:var(--green)">create table if not exists km_sync (
  id uuid default gen_random_uuid() primary key,
  username text not null,
  slot text not null,
  data text not null,
  updated_at timestamptz default now(),
  unique(username, slot)
);
alter table km_sync enable row level security;
create policy "anon_all" on km_sync for all to anon using (true) with check (true);</pre>
          <strong style="color:var(--text)">Step 3:</strong> Settings → API → copy Project URL and anon/public key below<br>
          <strong style="color:var(--text)">Step 4:</strong> Click Connect and then Backup Now
        </div>
      </details>` : ''}

      <div class="field">
        <label style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-3)">Supabase Project URL</label>
        <input type="url" id="sb-url" placeholder="https://xxxxxxxxxxxx.supabase.co"
          value="${escAttr(c.url)}"
          style="background:var(--surface-2);border:1px solid var(--border-2);border-radius:6px;padding:8px 12px;color:var(--text);font-size:13px;width:100%;box-sizing:border-box" />
      </div>
      <div class="field">
        <label style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-3)">Anon / Public Key</label>
        <input type="text" id="sb-anon-key" placeholder="eyJhbGci…"
          value="${escAttr(c.key)}"
          style="background:var(--surface-2);border:1px solid var(--border-2);border-radius:6px;padding:8px 12px;color:var(--text);font-size:13px;width:100%;box-sizing:border-box" />
      </div>

      <div id="sb-test-result" style="margin-bottom:12px;font-size:13px;min-height:20px"></div>

      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-gold" onclick="_sbSaveAndTest()">
          ${configured ? 'Update & Test' : 'Connect'}
        </button>
        ${configured ? `
        <button class="btn btn-ghost" id="sb-backup-btn" onclick="supabaseFullBackup()">☁ Backup Now</button>
        <button class="btn btn-ghost" id="sb-restore-btn" onclick="supabaseFullRestore()">⬇ Restore from Cloud</button>
        <button class="btn btn-ghost" style="color:var(--red)" onclick="_sbDisconnect()">Disconnect</button>
        ` : ''}
      </div>

      ${configured ? `
      <div style="margin-top:16px;padding:12px;background:var(--surface-2);border-radius:6px;font-size:12px;color:var(--text-3)">
        <strong style="color:var(--text-2)">Security note:</strong>
        Your data is encrypted with AES-256-GCM using your login password as the key.
        Even if someone accessed your Supabase database directly, they would only see encrypted ciphertext.
        Only someone with your password can decrypt the data.
      </div>` : ''}
    </div>`;
}

async function _sbSaveAndTest() {
  const url = document.getElementById('sb-url')?.value.trim();
  const key = document.getElementById('sb-anon-key')?.value.trim();
  const res = document.getElementById('sb-test-result');

  if (!url || !key) {
    if (res) res.innerHTML = '<span style="color:var(--red)">Both URL and key are required</span>';
    return;
  }

  if (res) res.innerHTML = '<span style="color:var(--text-3)">Testing connection…</span>';
  localStorage.setItem('km_supabase_url', url);
  localStorage.setItem('km_supabase_anon_key', key);

  const result = await SupabaseSync.testConnection();
  if (result.ok) {
    if (res) res.innerHTML = '<span style="color:var(--green)">✓ Connected successfully!</span>';
    toast('Supabase connected! Click "Backup Now" to upload your data.');
    setTimeout(() => navigate('settings'), 1000);
  } else {
    if (res) res.innerHTML = `<span style="color:var(--red)">✗ ${escHtml(result.error)}</span>`;
    toast('Connection failed — check your URL and key', 'error');
  }
}

function _sbDisconnect() {
  if (!confirm('Disconnect Supabase? Your local data is unaffected.')) return;
  localStorage.removeItem('km_supabase_url');
  localStorage.removeItem('km_supabase_anon_key');
  toast('Supabase disconnected');
  navigate('settings');
}


// ================================================================
// Inject Supabase panel into Settings page
// ================================================================
const _origRenderSettings = renderSettings;
renderSettings = function() {
  let html = _origRenderSettings();
  // Insert Supabase panel before the first <div class="panel"
  const sbPanel = `<div id="supabase-settings-panel">${renderSupabaseSettings()}</div>`;
  html = html.replace('<div class="panel-title mb-16">Integrations</div>', sbPanel + '<div class="panel-title mb-16">Integrations</div>');
  return html;
};


// ================================================================
// Boot: restore from cloud on login
// ================================================================
Auth.ready.then(async () => {
  if (SupabaseSync.isConfigured()) {
    try {
      await supabaseRestoreAll();
      // Reload zoom meetings into State after restore
      try {
        const zm = localStorage.getItem('km_zoom_meetings');
        if (zm) State.zoom.meetings = JSON.parse(zm);
      } catch(e) {}
      // Reload email sent log
      try {
        const es = localStorage.getItem('km_email_sent');
        if (es) State.email.sent = JSON.parse(es);
      } catch(e) {}
    } catch(e) {
      console.warn('[Supabase] Boot restore failed:', e.message);
    }
  }
});

console.info('[Kamkhadze PA] Supabase sync loaded. Configured:', SupabaseSync.isConfigured());
