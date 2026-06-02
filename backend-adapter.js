/**
 * backend-adapter.js — Kamkhadze PA
 *
 * Wires the frontend to the Node.js/Express backend.
 * Load this AFTER case-manager-v2.js in index.html.
 *
 * To disable the backend, simply remove the <script> tag for this file.
 */

(function() {
  'use strict';

  const API_BASE = window.location.origin;

  const TOKEN_KEY = 'km_jwt_v1';

  function getToken() {
    return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY) || null;
  }
  function setToken(tok) {
    sessionStorage.setItem(TOKEN_KEY, tok);
    localStorage.setItem(TOKEN_KEY, tok);
  }
  function clearToken() {
    sessionStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(TOKEN_KEY);
  }

  async function api(method, path, body, opts = {}) {
    const token = getToken();
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(API_BASE + path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      ...opts,
    });

    if (res.status === 401) {
      clearToken();
      if (typeof toast === 'function') toast('Session expired — please log in again', 'warn');
      return null;
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${res.status}`);
    }

    return res.json().catch(() => null);
  }

  window.API = { get: (p) => api('GET', p), post: (p, b) => api('POST', p, b),
                 put: (p, b) => api('PUT', p, b), del: (p) => api('DELETE', p),
                 patch: (p, b) => api('PATCH', p, b), getToken, setToken, clearToken };

  window.BackendHooks.onLogin = async (username, password) => {
    const data = await api('POST', '/api/auth/login', { username, password });
    if (data && data.token) {
      setToken(data.token);
      console.log('[Adapter] Logged in as', data.user?.name || username);
      return data;
    }
    return null;
  };

  (async function verifyToken() {
    const token = getToken();
    if (!token) return;
    try {
      const data = await api('POST', '/api/auth/verify');
      if (data && data.valid) {
        console.log('[Adapter] Token valid — connected to backend ✅');
      } else {
        clearToken();
      }
    } catch {
      console.warn('[Adapter] Backend not reachable — running in offline mode');
    }
  })();

  const _syncedTimestamps = {};

  window.BackendHooks.onCaseSave = async (cases) => {
    if (!getToken()) return;
    if (!Array.isArray(cases) || !cases.length) return;
    try {
      const dirty = cases.filter(c => {
        const prev = _syncedTimestamps[c.id];
        return !prev || prev !== c.updatedAt;
      });
      if (!dirty.length) return;

      if (dirty.length === 1) {
        await api('POST', '/api/cases', dirty[0]);
      } else {
        await api('POST', '/api/cases/bulk', { cases: dirty });
      }

      dirty.forEach(c => { _syncedTimestamps[c.id] = c.updatedAt; });
      console.log(`[Adapter] Synced ${dirty.length} case(s) to backend`);
    } catch (err) {
      console.warn('[Adapter] Case save to backend failed:', err.message);
    }
  };

  async function loadCasesFromBackend() {
    if (!getToken()) return;
    try {
      const cases = await api('GET', '/api/cases');
      if (!Array.isArray(cases)) return;
      if (typeof State !== 'undefined') {
        State.cases = cases;
        if (typeof Storage !== 'undefined' && typeof Storage.save === 'function') {
          Storage.save();
        }
        if (typeof render === 'function') render();
        console.log(`[Adapter] Loaded ${cases.length} case(s) from backend`);
      }
    } catch (err) {
      console.warn('[Adapter] Could not load cases from backend:', err.message);
    }
  }

  if (document.readyState === 'complete') {
    setTimeout(loadCasesFromBackend, 300);
  } else {
    window.addEventListener('load', () => setTimeout(loadCasesFromBackend, 300));
  }

  window.BackendHooks.onEmailSend = async ({ to, subject, body, caseId, caseTag }) => {
    if (!getToken()) return;
    try {
      await api('POST', '/api/emails', { to, subject, body, caseId, caseTag });
      console.log('[Adapter] Email logged to backend');
    } catch (err) {
      console.warn('[Adapter] Email log failed:', err.message);
    }
  };

  window.BackendHooks.onZoomCreate = async (meeting) => {
    if (!getToken()) return;
    try {
      const saved = await api('POST', '/api/zoom/meetings', meeting);
      console.log('[Adapter] Zoom meeting saved to backend:', saved?.id);
      return saved;
    } catch (err) {
      console.warn('[Adapter] Zoom save failed:', err.message);
    }
  };

  window.BackendHooks.onFileUpload = async (file, { caseId, clientName, folder, uploadedBy }) => {
    if (!getToken()) return null;
    try {
      const fd = new FormData();
      fd.append('files', file);
      fd.append('caseId',     caseId      || '');
      fd.append('clientName', clientName  || '');
      fd.append('folder',     folder      || '01_Personal_Documents');
      fd.append('uploadedBy', uploadedBy  || 'Ana Kamkhadze');

      const token = getToken();
      const res = await fetch(`${API_BASE}/api/files/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      console.log('[Adapter] File uploaded to backend:', data.files?.[0]?.id);
      return data.files?.[0] || null;
    } catch (err) {
      console.warn('[Adapter] File upload failed:', err.message);
      return null;
    }
  };

  window.BackendHooks.onCaseDelete = async (caseId) => {
    if (!getToken()) return;
    try { await api('DELETE', `/api/cases/${caseId}`); } catch(e) {}
  };

  window.BackendHooks.onZoomDelete = async (meetingId) => {
    if (!getToken()) return;
    try { await api('DELETE', `/api/zoom/meetings/${meetingId}`); } catch(e) {}
  };

  window.BackendHooks.onFileDelete = async (fileId) => {
    if (!getToken()) return;
    try { await api('DELETE', `/api/files/${fileId}`); } catch(e) {}
  };

  console.log('[Adapter] Backend adapter loaded ✅ — API at', API_BASE + '/api');
})();
