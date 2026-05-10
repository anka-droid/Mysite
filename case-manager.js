/* ============================================================
   Kamkhadze PA — Case Manager Application
   Requires: case-manager-auth.js loaded first
   ============================================================ */

// ---- State ----
const State = {
  cases: [],
  view: 'dashboard',    // dashboard | cases | case-detail
  activeTab: 'overview',
  selectedCaseId: null,
  filter: { search: '', stage: '', visaType: '' },
  emailDraft: null,
  emailLang: 'en',
};

// ---- Encrypted Persistence ----
// All case data is AES-256-GCM encrypted before writing to localStorage.
// The encryption key is derived from the user's password (never stored).
const ENC_CASES_KEY = 'km_cases_enc_v1';
const PLAIN_LEGACY  = 'km_cases'; // unencrypted key from pre-auth version

const Storage = {
  async save() {
    try {
      const json = JSON.stringify(State.cases);
      const blob = await Auth.encrypt(json);
      localStorage.setItem(ENC_CASES_KEY, blob);
      // Remove any leftover plaintext data
      localStorage.removeItem(PLAIN_LEGACY);
    } catch (e) {
      console.error('Save failed:', e);
    }
  },
  async load() {
    try {
      const blob = localStorage.getItem(ENC_CASES_KEY);
      if (blob) {
        const json = await Auth.decrypt(blob);
        State.cases = JSON.parse(json);
        return;
      }
      // Migrate unencrypted legacy data if present
      const legacy = localStorage.getItem(PLAIN_LEGACY);
      if (legacy) {
        State.cases = JSON.parse(legacy);
        await Storage.save(); // re-save encrypted
        localStorage.removeItem(PLAIN_LEGACY);
        return;
      }
      State.cases = [];
    } catch {
      State.cases = [];
    }
  },
};

// ---- Import helpers ----
function _visaFromCase(s) {
  const u = (s||'').toUpperCase();
  if (/EB[- ]?1[1A]|EB11|EB1A/.test(u)) return 'EB-1A';
  if (/EB[- ]?2|NIW/.test(u)) return 'EB-2 NIW';
  if (/\bO[- ]?1/.test(u)) return 'O-1A';
  if (/\bE2\b|E2\s|E-2/.test(u)) return 'E-2';
  if (/H[- ]?1B/.test(u)) return 'H-1B';
  if (/\bL[- ]?1/.test(u)) return 'L-1A';
  if (/\bTN\b/.test(u)) return 'TN';
  if (/\bP[- ]?1\b/.test(u)) return 'P-1';
  return 'Other';
}
function _stageFromData(fd, r, exp) {
  const f=(fd||'').toLowerCase(), rx=(r||'').toLowerCase(), ex=(exp||'').toLowerCase();
  if (/denied/.test(f)||/denied/.test(rx)) return 'denied';
  if (/withdrawn|noid/.test(f)||/withdrawn/.test(rx)) return 'closed';
  if (/approved/.test(f)||/approved/.test(rx)||/^approved$/i.test(rx.trim())) return 'approved';
  if (/\brfe\b/.test(f)||/\brfe\b/.test(rx)) return 'rfe';
  if (/interview|iv scheduled/.test(f)||/interview/.test(rx)) return 'filed';
  if (/filed/.test(f)||/^[a-z]{2,3}\d{7}/i.test(rx)) return 'filed';
  if (/nvc/.test(f)||/nvc/.test(rx)) return 'filed';
  if (/docs? pending/i.test(rx)) return 'documents';
  if (/lpr/.test(ex)) return 'approved';
  return 'lead';
}
function _xDate(s) {
  const m=(s||'').match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](20\d{2})/);
  return m?`${m[3]}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}`:''
}
function _xApprDate(fd,r) {
  const src=/approved/i.test(fd)?fd:(/approved/i.test(r)?r:'');
  return _xDate(src);
}
function _xReceipt(s) {
  const m=(s||'').match(/\b([A-Z]{2,3}\d{7,13})\b/i);
  return m?m[1].toUpperCase():'';
}
function _xAmt(s) {
  const n=parseFloat((s||'').replace(/[\$,\s]/g,''));
  return (!isNaN(n)&&n>0)?String(n):'';
}
