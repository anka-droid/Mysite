/* ============================================================
   Kamkhadze PA — Case Manager Application
   Requires: case-manager-auth.js loaded first
   ============================================================ */

// ---- State ----
const State = {
  cases: [],
  view: 'dashboard',    // dashboard | cases | case-detail | dropbox | zoom
  activeTab: 'overview',
  selectedCaseId: null,
  filter: { search: '', stage: '', visaType: '' },
  emailDraft: null,
  emailLang: 'en',
  // Dropbox vault state (loaded by case-manager-v2.js)
  dropbox: {
    files: [],
    tab: 'all',
    search: '',
    activeFileId: null,
    viewMode: 'grid',
    sortBy: 'name',
    sortDir: 'asc',
    filterStatus: '',
    notes: {},
  },
  // Zoom meetings state (loaded by case-manager-v2.js)
  zoom: {
    meetings: [],
    showScheduleForm: false,
    scheduleTopic: '',
    scheduleDate: '',
    scheduleTime: '10:00',
    scheduleDuration: '30',
    scheduleClient: '',
    scheduleCase: '',
    timezone: 'America/New_York',
    tzSearch: '',
    clientSearch: '',
  },
  // Email state (loaded by case-manager-v2.js)
  email: {
    composing: false,
    tab: 'inbox',
    composeData: { to: '', subject: '', body: '' },
    sent: JSON.parse(localStorage.getItem('km_email_sent') || '[]'),
    activeEmailId: null,
  },
  teamChat: {
    currentChannel: 'general',
  },
  invoices: null, // loaded lazily from localStorage
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

// ---- Helpers ----
function uuid() {
  return 'c' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtDateInput(iso) {
  if (!iso) return '';
  return iso.split('T')[0];
}

function today() {
  return new Date().toISOString().split('T')[0];
}

function getCase(id) {
  return State.cases.find(c => c.id === id);
}

// ---- Canonical 9-value status set (in defined order) ----
const CASE_STATUSES = [
  { value: 'Lead',             label: 'Lead',             color: '#6B7280', bg: 'rgba(107,114,128,0.1)'  },
  { value: 'RA Pending',       label: 'RA Pending',       color: '#7C3AED', bg: 'rgba(124,58,237,0.1)'   },
  { value: 'Case Development', label: 'Case Development', color: '#4A6CF7', bg: 'rgba(74,108,247,0.12)'  },
  { value: 'Almost Ready',     label: 'Almost Ready',     color: '#6366F1', bg: 'rgba(99,102,241,0.12)'  },
  { value: 'Ready',            label: 'Ready',            color: '#0D9488', bg: 'rgba(13,148,136,0.12)'  },
  { value: 'Filed',            label: 'Filed',            color: '#D97706', bg: 'rgba(217,119,6,0.12)'   },
  { value: 'RFE',              label: 'RFE',              color: '#DC2626', bg: 'rgba(220,38,38,0.1)'    },
  { value: 'Approved',         label: 'Approved',         color: '#16A34A', bg: 'rgba(22,163,74,0.12)'   },
  { value: 'Denied',           label: 'Denied',           color: '#9B1C1C', bg: 'rgba(155,28,28,0.1)'    },
];

const CASE_STATUS_MAP = Object.fromEntries(CASE_STATUSES.map(s => [s.value, s]));
const CASE_STATUS_VALUES = CASE_STATUSES.map(s => s.value);

// Keep legacy aliases for modules that still reference them
const STAGES = CASE_STATUSES.map(s => ({ value: s.value, label: s.label }));
const STATUS_CODES = CASE_STATUSES;
const STATUS_CODE_MAP = CASE_STATUS_MAP;
const STAGE_ORDER = CASE_STATUS_VALUES;

// One-time migration: old value → new canonical value, null = flag for manual review
const STATUS_MIGRATION = {
  // Legacy STAGES
  'lead':           'Lead',
  'onboarding':     'RA Pending',
  'consultation':   'Lead',
  'representation': 'RA Pending',
  'documents':      'Case Development',
  'petition':       'Case Development',
  'filed':          'Filed',
  'rfe':            'RFE',
  'approved':       'Approved',
  'denied':         'Denied',
  'closed':         null,           // manual review required
  // Prior STATUS_CODES from v1
  'KDE':            'Case Development',
  'KAR':            'Almost Ready',
  'KRE':            'Ready',
  'KFI':            'Filed',
  'KAP':            'Approved',
  'RFE':            'RFE',
  'RFF':            'RFE',
  'RFA':            'RFE',
  'RFR':            'RFE',
  'KW2':            null,           // Withdrawal — manual review
  'APF':            null,           // Appeal Filed — manual review
};

// Migrate all cases in State.cases to the new status set.
// Sets c.statusCode to canonical value; marks unmappable cases with _needsStatusReview = true.
function migrateStatuses() {
  let migrated = 0, flagged = 0;
  State.cases.forEach(c => {
    const current = c.statusCode || c.stage;
    if (CASE_STATUS_MAP[current]) return; // already canonical
    const mapped = STATUS_MIGRATION[current];
    if (mapped) {
      c.statusCode = mapped;
      c.stage = mapped;
      migrated++;
    } else if (current) {
      c._needsStatusReview = true;
      c._originalStatus = current;
      // Keep closest guess: null means unmappable — leave current, just flag
      flagged++;
    }
  });
  if (migrated || flagged) {
    Storage.save();
    if (flagged) console.warn(`[Migration] ${flagged} case(s) have unmappable statuses and need manual review. Search for _needsStatusReview=true.`);
  }
}

// USCIS officer decision types
const OFFICER_DECISION_TYPES = ['', 'Approved', 'Denied', 'NOID', 'Second RFE', 'Pending'];

// Normalize officer number: trim whitespace + uppercase
function normalizeOfficerNumber(raw) {
  return (raw || '').trim().toUpperCase();
}

const VISA_TYPES = [
  'O-1A', 'O-1B', 'EB-1A', 'EB-1B', 'EB-1C', 'EB-2 NIW', 'H-1B', 'L-1A', 'L-1B',
  'E-2', 'TN', 'P-1', 'EB-5', 'AOS', 'CP', 'COS', 'EOS', 'Other'
];

// Deadline engine — days remaining from today to a date
function daysRemaining(isoDate) {
  if (!isoDate) return null;
  const diff = new Date(isoDate) - new Date();
  return Math.ceil(diff / 86400000);
}

function urgencyClass(days) {
  if (days === null) return '';
  if (days < 0)   return 'urgency-overdue';
  if (days <= 30)  return 'urgency-critical';
  if (days <= 90)  return 'urgency-warning';
  return 'urgency-ok';
}

function daysLabel(days) {
  if (days === null) return '—';
  if (days < 0)  return `${Math.abs(days)}d overdue`;
  if (days === 0) return 'Today';
  return `${days}d`;
}

// Collect all deadline alerts across all cases
function getDeadlineAlerts() {
  const alerts = [];
  const now = new Date();
  State.cases.forEach(c => {
    const name = `${c.firstName} ${c.lastName}`;
    // Expiration date
    if (c.expirationDate) {
      const d = daysRemaining(c.expirationDate);
      if (d !== null && d <= 90) {
        alerts.push({ caseId: c.id, name, type: 'expiration', label: 'Status Expiring', date: c.expirationDate, days: d, visa: c.visaType });
      }
    }
    // RFE due date
    if (c.rfeDueDate) {
      const d = daysRemaining(c.rfeDueDate);
      if (d !== null && d <= 30) {
        alerts.push({ caseId: c.id, name, type: 'rfe', label: 'RFE Response Due', date: c.rfeDueDate, days: d, visa: c.visaType });
      }
    }
    // Target filing date
    if (c.targetFilingDate) {
      const d = daysRemaining(c.targetFilingDate);
      if (d !== null && d <= 30) {
        alerts.push({ caseId: c.id, name, type: 'tfd', label: 'Target Filing Date', date: c.targetFilingDate, days: d, visa: c.visaType });
      }
    }
  });
  return alerts.sort((a, b) => (a.days ?? 9999) - (b.days ?? 9999));
}

// Document templates by visa type
const DOC_TEMPLATES = {
  'O-1A': [
    { category: 'Personal Documents', items: [
      'Passport (all pages)', 'Current visa / status documents', 'Professional CV / Resume',
      'Professional headshot (high-res)', 'List of all prior U.S. entries'
    ]},
    { category: 'Criterion Evidence', items: [
      'Awards & prizes documentation', 'Press / media articles (original + translations)',
      'Membership certificates (elite organizations)', 'Judge/reviewer invitations & outcome letters',
      'Original contributions evidence (patents, publications, market impact)',
      'Scholarly articles authored', 'High compensation evidence (offers, contracts, W-2s)',
      'Critical role documentation (board resolutions, org charts)'
    ]},
    { category: 'Employer / Petitioner', items: [
      'Employer support letter', 'Offer letter / contract', 'Company incorporation / registration docs',
      'Company financials / funding docs (if startup)', 'Advisory board documentation'
    ]},
    { category: 'Expert Recommendation Letters', items: [
      'Recommendation letter #1', 'Recommendation letter #2', 'Recommendation letter #3',
      'Recommendation letter #4 (optional)', 'Recommendation letter #5 (optional)'
    ]},
    { category: 'Financial', items: [
      'Most recent tax return (if U.S.)', 'Bank statements (3 months)'
    ]},
  ],
  'EB-1A': [
    { category: 'Personal Documents', items: [
      'Passport (all pages)', 'Current visa / status documents', 'Professional CV / Resume',
      'Professional headshot', 'All prior U.S. entries list', 'Birth certificate + translation'
    ]},
    { category: 'Criterion Evidence', items: [
      'Major national/international awards', 'Press / media coverage articles',
      'Elite membership certificates', 'Judging activity documentation',
      'Original scholarly/scientific contributions', 'Scholarly articles (with citation data)',
      'Artistic exhibition records', 'Leading/critical role documentation',
      'High salary evidence', 'Commercial success documentation'
    ]},
    { category: 'Support Letters', items: [
      'Expert recommendation letter #1', 'Expert recommendation letter #2',
      'Expert recommendation letter #3', 'Expert recommendation letter #4',
      'Expert recommendation letter #5 (optional)'
    ]},
    { category: 'I-140 Specific', items: [
      'National interest statement (if applicable)', 'Future employment / self-employment plan',
      'Company/organization evidence (if self-petitioning)'
    ]},
    { category: 'Financial', items: [
      'Most recent tax return', 'Bank statements (3 months)'
    ]},
  ],
  'EB-2 NIW': [
    { category: 'Personal Documents', items: [
      'Passport (all pages)', 'Current immigration status docs', 'Detailed CV / Resume',
      'Academic transcripts & diplomas', 'Professional licenses / certifications'
    ]},
    { category: 'NIW Evidence', items: [
      'Substantial merit — field description & national importance statement',
      'Well-positioned evidence (publications, grants, patents)',
      'Balance of benefits — future plans description',
      'Research publications list with citations', 'Grant funding documentation',
      'Conference presentations', 'Peer review / editorial roles'
    ]},
    { category: 'Support Letters', items: [
      'Independent expert recommendation #1', 'Independent expert recommendation #2',
      'Independent expert recommendation #3', 'Institutional support letter (optional)'
    ]},
  ],
};

const DEFAULT_DOC_TEMPLATE = [
  { category: 'Personal Documents', items: [
    'Passport (all pages)', 'Current visa / status documents', 'Professional CV / Resume'
  ]},
  { category: 'Case-Specific Documents', items: [
    'Primary evidence document #1', 'Primary evidence document #2', 'Support letter #1'
  ]},
];

function getDocTemplate(visaType) {
  return DOC_TEMPLATES[visaType] || DEFAULT_DOC_TEMPLATE;
}

function buildDefaultDocs(visaType) {
  const template = getDocTemplate(visaType);
  const docs = [];
  template.forEach(cat => {
    cat.items.forEach(name => {
      docs.push({ id: uuid(), category: cat.category, name, status: 'pending', notes: '' });
    });
  });
  return docs;
}

// ---- New Case Factory ----
function newCase(overrides = {}) {
  return {
    id: uuid(),
    firstName: '', lastName: '', email: '', phone: '',
    nationality: '', location: '', company: '',
    geo: '',                      // country code / flag
    visaType: 'O-1A',
    filingType: 'AOS',            // AOS | CP | COS | EOS | PP
    stage: 'Lead',                 // canonical status (9-value set)
    statusCode: 'Lead',
    uscisReceiptNumber: '', consulateCase: '', consulateName: '',
    priorityDate: '', filingDate: '', approvalDate: '',
    targetFilingDate: '',         // TFD
    expirationDate: '',           // visa/status expiration
    rfeDueDate: '',               // RFE response due date
    rfeResponseFiledDate: '',     // SECURITY: date RFE response was submitted
    pif: false,                   // Paid In Full
    cmConc: '',                   // CM/CONC notation
    assignedAttorney: '',         // attorney username
    assignedCM: '',               // case manager username
    priorityScore: 0,
    // USCIS Officer Adjudication tracking
    uscisOfficerNumber: '',       // normalized (uppercase, trimmed) on save
    officerAssignedDate: '',      // when officer was identified
    decisionType: '',             // Approved | Denied | NOID | Second RFE | Pending
    decisionDate: '',             // date of decision after RFE response
    consultationDate: '', consultationTime: '', consultationDuration: '60',
    consultationNotes: '', consultationConfirmed: false,
    retainerPaid: false, retainerAmount: '', retainerDate: '',
    filingFeesPaid: false, filingFeesAmount: '',
    dropboxLink: '',
    documents: [],
    exhibits: [],
    petition: {
      coverLetter: '',
      executiveSummary: '',
      legalBrief: '',
      evidenceIndex: '',
      notes: '',
    },
    statusHistory: [],
    emailLog: [],
    notes: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

// ---- Toast notifications ----
function toast(msg, type = 'success') {
  const container = document.getElementById('toast-container') ||
    (() => {
      const d = document.createElement('div');
      d.id = 'toast-container';
      d.className = 'toast-container';
      document.body.appendChild(d);
      return d;
    })();

  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<span class="toast-icon ${type === 'warn' ? 'warn' : ''}">${type === 'warn' ? '⚠' : '✓'}</span> ${msg}`;
  container.appendChild(el);
  setTimeout(() => el.remove(), 3100);
}

// ---- Render helpers ----
function stageBadge(stage) {
  const sc = CASE_STATUS_MAP[stage];
  if (sc) {
    return `<span class="badge" style="background:${sc.bg};color:${sc.color};border-color:${sc.color}33;font-weight:600;letter-spacing:0.02em">${escHtml(sc.label)}</span>`;
  }
  // Fallback for any unmigrated value
  return `<span class="badge" style="background:rgba(107,114,128,0.1);color:#6B7280;font-size:11px">${escHtml(stage || '—')}</span>`;
}

function statusCodeSelect(currentVal, fieldName, caseId) {
  return `<select onchange="updateCaseField('${caseId}','${fieldName}',this.value);updateCaseField('${caseId}','stage',this.value)">
    ${CASE_STATUSES.map(s => `<option value="${escAttr(s.value)}" ${currentVal===s.value?'selected':''}>${escHtml(s.label)}</option>`).join('')}
  </select>`;
}

function docStatusBadge(status) {
  const labels = { pending: 'Pending', uploaded: 'Uploaded', reviewed: 'Reviewed', approved: 'Approved', missing: 'Missing' };
  return `<span class="badge badge-doc-${status}">${labels[status] || status}</span>`;
}

function svgIcon(name) {
  const icons = {
    dashboard: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>`,
    cases: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>`,
    calendar: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>`,
    email: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>`,
    docs: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"/></svg>`,
    petition: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>`,
    status: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>`,
    overview: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>`,
    add: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>`,
    back: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>`,
    edit: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>`,
    trash: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>`,
    dropbox: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 2L6 6l6 4 6-4-6-4zM6 14l6 4 6-4-6-4-6 4zM6 6l-4 4 4 4 6-4-6-4zM18 6l4 4-4 4-6-4 6-4z"/></svg>`,
    copy: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>`,
    link: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/></svg>`,
    check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 13l4 4L19 7"/></svg>`,
  };
  return icons[name] || '';
}

// ---- SVG icon element ----
function icon(name, cls = '') {
  return `<span class="nav-icon ${cls}">${svgIcon(name)}</span>`;
}

// ---- Sidebar ----
function renderSidebar() {
  const activeView = State.view;
  const activeCaseId = State.selectedCaseId;

  const counts = {
    active: State.cases.filter(c => !['KAP','KW2','approved','denied','closed'].includes(c.stage || c.statusCode)).length,
    consultation: State.cases.filter(c => c.stage === 'consultation').length,
    rfe: State.cases.filter(c => ['RFE','RFF','RFA','RFR','rfe'].includes(c.stage || c.statusCode)).length,
  };
  const alerts = getDeadlineAlerts().filter(a => a.days <= 14);

  return `
    <aside class="sidebar" id="sidebar">
      <div class="sidebar-logo">
        <a href="index.html" class="logo">ESQ<span>.</span>MBA</a>
        <div class="sidebar-sub">Case Manager</div>
      </div>
      <nav class="sidebar-nav">
        <div class="nav-section-label">Overview</div>
        <button class="nav-item ${activeView === 'dashboard' ? 'active' : ''}" onclick="navigate('dashboard')">
          ${icon('dashboard')} Dashboard
        </button>
        <button class="nav-item ${activeView === 'cases' ? 'active' : ''}" onclick="navigate('cases')">
          ${icon('cases')} All Cases
          ${counts.active ? `<span class="nav-badge">${counts.active}</span>` : ''}
        </button>
        ${counts.consultation ? `
        <button class="nav-item" onclick="navigate('cases'); setFilter('stage','consultation')">
          ${icon('calendar')} Consultations
          <span class="nav-badge">${counts.consultation}</span>
        </button>` : ''}
        ${counts.rfe ? `
        <button class="nav-item" onclick="navigate('cases'); setFilter('stage','rfe')">
          ${icon('docs')} RFE Pending
          <span class="nav-badge" style="background:var(--red-dim);color:var(--red);border-color:rgba(248,113,113,0.2)">${counts.rfe}</span>
        </button>` : ''}
        ${activeCaseId ? (() => {
          const c = getCase(activeCaseId);
          return c ? `
          <div class="nav-section-label" style="margin-top:16px">Current Case</div>
          <button class="nav-item active" onclick="navigate('case-detail','${c.id}')">
            ${icon('overview')} ${c.firstName} ${c.lastName}
          </button>` : '';
        })() : ''}
        <div class="nav-section-label" style="margin-top:16px">Communication</div>
        <button class="nav-item ${activeView === 'team-chat' ? 'active' : ''}" onclick="navigate('team-chat')">
          ${icon('email')} Team Chat
        </button>
        <button class="nav-item ${activeView === 'email' ? 'active' : ''}" onclick="navigate('email')">
          ${icon('email')} Email
        </button>
        <button class="nav-item ${activeView === 'zoom' ? 'active' : ''}" onclick="navigate('zoom')">
          ${icon('calendar')} Zoom Meetings
        </button>
        <div class="nav-section-label" style="margin-top:16px">Documents</div>
        <button class="nav-item ${activeView === 'dropbox' ? 'active' : ''}" onclick="navigate('dropbox')">
          ${icon('dropbox')} Document Vault
        </button>
        <button class="nav-item ${activeView === 'invoices' ? 'active' : ''}" onclick="navigate('invoices')">
          ${icon('docs')} Invoices
        </button>
        <button class="nav-item ${activeView === 'questionnaires' ? 'active' : ''}" onclick="navigate('questionnaires')">
          ${icon('petition')} Questionnaires
        </button>
        <button class="nav-item ${activeView === 'uscis-forms' ? 'active' : ''}" onclick="navigate('uscis-forms')">
          ${icon('status')} USCIS Forms
        </button>
        <div class="nav-section-label" style="margin-top:16px">Reports</div>
        <button class="nav-item ${activeView === 'reports' ? 'active' : ''}" onclick="navigate('reports')">
          ${icon('status')} Reports
        </button>
        <button class="nav-item ${activeView === 'officer-report' ? 'active' : ''}" onclick="navigate('officer-report')">
          ${icon('docs')} Officer Report
        </button>
        <button class="nav-item ${activeView === 'time-tracking' ? 'active' : ''}" onclick="navigate('time-tracking')">
          ${icon('overview')} Time Tracking
        </button>
        ${alerts.length ? `
        <button class="nav-item" onclick="navigate('deadline-alerts')" style="color:#DC2626">
          ${icon('docs')} ⚠ ${alerts.length} Deadline${alerts.length > 1 ? 's' : ''}
        </button>` : ''}
        <div class="nav-section-label" style="margin-top:16px">Actions</div>
        <button class="nav-item" onclick="showAddCase()">
          ${icon('add')} New Case
        </button>
        <button class="nav-item ${activeView === 'settings' ? 'active' : ''}" onclick="navigate('settings')">
          ${icon('status')} Settings
        </button>
      </nav>
      <div class="session-bar">
        <div style="font-size:12px;font-weight:500;color:rgba(255,255,255,0.85)">${Auth.username || 'Attorney'}</div>
        ${typeof RBAC !== 'undefined' ? RBAC.roleBadge(RBAC.getRole()) : ''}
        <div id="sb-sync-status" style="font-size:11px;margin-top:4px">
          ${typeof SupabaseSync !== 'undefined' && SupabaseSync.isConfigured()
            ? '<span style="color:#4ade80">● Cloud synced</span>'
            : '<span style="color:rgba(255,255,255,0.4)">☁ <a href="#" onclick="navigate(\'settings\')" style="color:#C9A84C">Enable sync</a></span>'}
        </div>
        <button class="session-logout" onclick="Auth.logout()">Sign Out</button>
      </div>
    </aside>`;
}

// ---- Deadline Alerts View ----
function renderDeadlineAlerts() {
  const alerts = getDeadlineAlerts();
  return `
    <div class="topbar">
      <div class="topbar-title">Deadline Alerts</div>
    </div>
    <div class="content">
      ${alerts.length === 0 ? `
        <div class="empty-state">
          <div class="empty-state-icon">${svgIcon('check')}</div>
          <h3>No Upcoming Deadlines</h3>
          <p>All cases are clear for the next 90 days.</p>
        </div>` : `
        <div class="panel">
          <div class="panel-title">Cases Requiring Attention (${alerts.length})</div>
          <table class="report-table" style="width:100%">
            <thead><tr>
              <th>Client</th><th>Case Type</th><th>Alert Type</th>
              <th>Date</th><th>Days</th><th>Attorney</th><th>Actions</th>
            </tr></thead>
            <tbody>
            ${alerts.map(a => {
              const c = getCase(a.caseId);
              return `<tr class="${urgencyClass(a.days)}">
                <td style="font-weight:500">${escHtml(a.name)}</td>
                <td>${escHtml(a.visa)}</td>
                <td>${escHtml(a.label)}</td>
                <td>${fmtDate(a.date)}</td>
                <td><strong>${daysLabel(a.days)}</strong></td>
                <td style="font-size:12px">${escHtml(c?.assignedAttorney || '—')}</td>
                <td>
                  <button class="btn btn-ghost btn-sm" onclick="navigate('case-detail','${a.caseId}')">View</button>
                </td>
              </tr>`;
            }).join('')}
            </tbody>
          </table>
        </div>`}
    </div>`;
}

// ---- Dashboard ----
function renderDashboard() {
  const cases = State.cases;
  const total = cases.length;
  const active = cases.filter(c => !['KAP','KW2','approved','denied','closed'].includes(c.statusCode || c.stage)).length;
  const approved = cases.filter(c => ['KAP','approved'].includes(c.statusCode || c.stage)).length;
  const rfe = cases.filter(c => ['RFE','RFF','RFA','RFR','rfe'].includes(c.statusCode || c.stage)).length;
  const filed = cases.filter(c => ['KFI','filed'].includes(c.statusCode || c.stage)).length;

  // Recent cases
  const recent = [...cases]
    .sort((a,b) => new Date(b.updatedAt) - new Date(a.updatedAt))
    .slice(0, 5);

  // Stage breakdown — combine new status codes + legacy
  const stageBreakdown = STATUS_CODES.map(s => ({
    ...s, label: `${s.value} — ${s.label}`,
    count: cases.filter(c => (c.statusCode || c.stage) === s.value).length
  })).filter(s => s.count > 0);

  // Upcoming consultations
  const upcoming = cases.filter(c => c.consultationDate && !c.consultationConfirmed && new Date(c.consultationDate) >= new Date())
    .sort((a,b) => new Date(a.consultationDate) - new Date(b.consultationDate))
    .slice(0, 5);

  return `
    <div class="topbar">
      <div class="topbar-title">Dashboard</div>
      <div class="topbar-actions">
        <button class="btn btn-ghost" onclick="showImportCases()" style="margin-right:4px">
          ${icon('docs')} Import
        </button>
        <button class="btn btn-gold" onclick="showAddCase()">
          ${icon('add')} New Case
        </button>
      </div>
    </div>
    <div class="content">
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-card-label">Total Cases</div>
          <div class="stat-card-value">${total}</div>
          <div class="stat-card-sub">All clients on record</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-label">Active Cases</div>
          <div class="stat-card-value" style="color:var(--blue)">${active}</div>
          <div class="stat-card-sub">Currently in progress</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-label">Filed / Pending</div>
          <div class="stat-card-value" style="color:var(--yellow)">${filed}</div>
          <div class="stat-card-sub">Awaiting USCIS decision</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-label">Approved</div>
          <div class="stat-card-value" style="color:var(--green)">${approved}</div>
          <div class="stat-card-sub">Successful outcomes${total ? ` · ${Math.round(approved/total*100)}%` : ''}</div>
        </div>
      </div>

      ${(() => {
        const urgentAlerts = getDeadlineAlerts().filter(a => a.days <= 14);
        if (!urgentAlerts.length && !rfe) return '';
        return `<div class="panel" style="border-color:rgba(220,38,38,0.3);background:rgba(220,38,38,0.04);margin-bottom:24px">
          <div style="font-weight:600;color:#DC2626;margin-bottom:10px">⚠ Urgent Deadlines (within 14 days)</div>
          ${urgentAlerts.map(a => `
            <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid rgba(220,38,38,0.1)">
              <div>
                <span style="font-weight:500;color:var(--text)">${escHtml(a.name)}</span>
                <span style="margin-left:8px;font-size:12px;color:var(--text-3)">${escHtml(a.label)} · ${fmtDate(a.date)}</span>
              </div>
              <span class="${urgencyClass(a.days)}" style="font-size:12px;font-weight:600">${daysLabel(a.days)}</span>
            </div>`).join('')}
          ${rfe ? `<div style="margin-top:8px;font-size:13px;color:#DC2626">+ ${rfe} RFE${rfe>1?'s':''} pending response</div>` : ''}
        </div>`;
      })()}

      <div class="two-col" style="gap:24px">
        <div>
          <div class="panel-title mb-16">Recent Activity</div>
          ${recent.length ? recent.map(c => `
            <div class="flex-between" style="padding:12px 0;border-bottom:1px solid var(--border-2);cursor:pointer" onclick="navigate('case-detail','${c.id}')">
              <div>
                <div style="font-size:14px;font-weight:500;color:var(--text)">${c.firstName} ${c.lastName}</div>
                <div style="font-size:12px;color:var(--text-3)">${c.visaType} · Updated ${fmtDate(c.updatedAt)}</div>
              </div>
              ${stageBadge(c.stage)}
            </div>`).join('') : `<div class="text-muted">No cases yet.</div>`}
        </div>

        <div>
          <div class="panel-title mb-16">Pipeline by Stage</div>
          ${stageBreakdown.map(s => `
            <div class="progress-overview">
              <span class="progress-label" style="font-size:12px">${s.label}</span>
              <div class="progress-bar-wrap">
                <div class="progress-bar-fill" style="width:${total ? Math.round(s.count/total*100) : 0}%"></div>
              </div>
              <span class="progress-pct" style="font-size:12px">${s.count}</span>
            </div>`).join('') || `<div class="text-muted">No cases yet.</div>`}

          ${upcoming.length ? `
          <div class="divider"></div>
          <div class="panel-title mb-8" style="margin-top:0">Upcoming Consultations</div>
          ${upcoming.map(c => `
            <div class="flex-between" style="padding:10px 0;border-bottom:1px solid var(--border-2);cursor:pointer" onclick="navigate('case-detail','${c.id}')">
              <div>
                <div style="font-size:13.5px;color:var(--text)">${c.firstName} ${c.lastName}</div>
                <div style="font-size:12px;color:var(--text-3)">${fmtDate(c.consultationDate)} ${c.consultationTime ? '· ' + c.consultationTime : ''}</div>
              </div>
              <span class="badge badge-consultation">${c.visaType}</span>
            </div>`).join('')}` : ''}
        </div>
      </div>
    </div>`;
}

// ---- Cases List ----
function renderCasesList() {
  let cases = [...State.cases];
  const { search, stage, visaType } = State.filter;

  if (search) {
    const q = search.toLowerCase();
    cases = cases.filter(c =>
      `${c.firstName} ${c.lastName}`.toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q) ||
      (c.uscisReceiptNumber || '').toLowerCase().includes(q) ||
      (c.visaType || '').toLowerCase().includes(q)
    );
  }
  if (stage) cases = cases.filter(c => c.stage === stage);
  if (visaType) cases = cases.filter(c => c.visaType === visaType);

  cases.sort((a,b) => STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage) || new Date(b.updatedAt) - new Date(a.updatedAt));

  const visaTypes = [...new Set(State.cases.map(c => c.visaType))];

  return `
    <div class="topbar">
      <div class="topbar-title">All Cases <em style="font-size:16px;font-family:var(--font-sans);font-style:normal;color:var(--text-3)">(${cases.length})</em></div>
      <div class="topbar-actions">
        <button class="btn btn-gold" onclick="showAddCase()">
          ${icon('add')} New Case
        </button>
      </div>
    </div>
    <div class="content">
      <div class="list-header">
        <div class="search-filter">
          <div class="search-box">
            <span class="search-icon" style="width:14px;height:14px">${svgIcon('docs')}</span>
            <input type="text" placeholder="Search name, email, receipt #…" value="${search}"
              oninput="State.filter.search=this.value; rerenderCasesList()" />
          </div>
          <select class="filter-select" onchange="State.filter.stage=this.value; rerenderCasesList()">
            <option value="">All Statuses</option>
            ${CASE_STATUSES.map(s => `<option value="${escAttr(s.value)}" ${stage===s.value?'selected':''}>${escHtml(s.label)}</option>`).join('')}
          </select>
          <select class="filter-select" onchange="State.filter.visaType=this.value; rerenderCasesList()">
            <option value="">All Visa Types</option>
            ${visaTypes.map(v => `<option value="${v}" ${visaType===v?'selected':''}>${v}</option>`).join('')}
          </select>
          ${(search||stage||visaType) ? `<button class="btn btn-ghost btn-sm" onclick="State.filter={search:'',stage:'',visaType:''}; rerenderCasesList()">Clear</button>` : ''}
        </div>
      </div>

      ${cases.length === 0 ? `
        <div class="empty-state">
          <div class="empty-state-icon">${svgIcon('cases')}</div>
          <h3>${State.cases.length === 0 ? 'No cases yet' : 'No matching cases'}</h3>
          <p>${State.cases.length === 0 ? 'Start by adding your first client case.' : 'Try adjusting your search or filters.'}</p>
          ${State.cases.length === 0 ? `<button class="btn btn-gold" onclick="showAddCase()">Add First Case</button>` : ''}
        </div>
      ` : `
        <table class="cases-table">
          <thead>
            <tr>
              <th>Client</th>
              <th>Geo</th>
              <th>Case Type</th>
              <th>Filing</th>
              <th>Status</th>
              <th>TFD</th>
              <th>Days</th>
              <th>Expiration</th>
              <th>PIF</th>
              <th>Assigned</th>
            </tr>
          </thead>
          <tbody>
            ${cases.map(c => {
              const statusVal = c.statusCode || c.stage;
              const tfdDays = daysRemaining(c.targetFilingDate);
              const expDays = daysRemaining(c.expirationDate);
              return `
                <tr onclick="navigate('case-detail','${c.id}')">
                  <td>
                    <div class="client-name">${escHtml(c.firstName)} ${escHtml(c.lastName)}</div>
                    <div class="client-email">${escHtml(c.email || '—')}</div>
                  </td>
                  <td style="font-size:16px">${escHtml(c.geo || c.nationality?.slice(0,2) || '—')}</td>
                  <td><span style="font-size:12px;font-weight:600;color:var(--navy)">${escHtml(c.visaType)}</span></td>
                  <td style="font-size:12px;color:var(--text-3)">${escHtml(c.filingType || '—')}</td>
                  <td>${stageBadge(statusVal)}</td>
                  <td style="font-size:12px;color:var(--text-3)">${c.targetFilingDate ? fmtDate(c.targetFilingDate) : '—'}</td>
                  <td><span class="${urgencyClass(tfdDays)}" style="font-size:12px;font-weight:600">${daysLabel(tfdDays)}</span></td>
                  <td><span class="${urgencyClass(expDays)}" style="font-size:12px">${c.expirationDate ? fmtDate(c.expirationDate) : '—'}</span></td>
                  <td style="font-size:13px">${c.pif ? '<span style="color:#16A34A">✓</span>' : '<span style="color:var(--text-3)">—</span>'}</td>
                  <td style="font-size:12px;color:var(--text-3)">${escHtml(c.assignedAttorney || '—')}</td>
                </tr>`;
            }).join('')}
          </tbody>
        </table>`}
    </div>`;
}

function rerenderCasesList() {
  document.getElementById('main-content').innerHTML = renderCasesList();
}

function setFilter(key, val) {
  State.filter[key] = val;
  setTimeout(() => rerenderCasesList(), 50);
}

// ---- Case Detail ----
function renderCaseDetail(caseId) {
  const c = getCase(caseId);
  if (!c) { navigate('cases'); return ''; }
  State.selectedCaseId = caseId;

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'schedule', label: 'Consultation' },
    { id: 'emails', label: 'Emails' },
    { id: 'documents', label: 'Documents' },
    { id: 'petition', label: 'Petition' },
    { id: 'status', label: 'USCIS Status' },
    { id: 'time-log', label: 'Time Log' },
  ];

  const docs = c.documents || [];
  const approvedDocs = docs.filter(d => ['approved','reviewed'].includes(d.status)).length;
  const docPct = docs.length ? Math.round(approvedDocs / docs.length * 100) : 0;

  return `
    <div class="topbar">
      <div class="topbar-title">${c.firstName} ${c.lastName} <em>· ${c.visaType}</em></div>
      <div class="topbar-actions">
        <button class="btn btn-ghost btn-sm" onclick="showEditCase('${c.id}')">
          ${icon('edit')} Edit
        </button>
        <button class="btn btn-ghost btn-sm" onclick="advanceStage('${c.id}')">
          Advance Stage →
        </button>
      </div>
    </div>
    <div class="content">
      <button class="back-btn" onclick="navigate('cases')">
        ${icon('back')} Back to Cases
      </button>

      <div class="case-header">
        <div class="case-header-info">
          <h2>${c.firstName} ${c.lastName}</h2>
          <div class="case-meta">
            ${stageBadge(c.stage)}
            <div class="case-meta-item">${svgIcon('docs').replace('class="','class="nav-icon ')} <span>${c.visaType}</span></div>
            ${c.email ? `<div class="case-meta-item">✉ <span>${c.email}</span></div>` : ''}
            ${c.phone ? `<div class="case-meta-item">✆ <span>${c.phone}</span></div>` : ''}
            ${c.nationality ? `<div class="case-meta-item">🌐 <span>${c.nationality}</span></div>` : ''}
            ${c.uscisReceiptNumber ? `<div class="case-meta-item">USCIS: <span style="font-family:monospace">${c.uscisReceiptNumber}</span></div>` : ''}
          </div>
        </div>
        <div class="case-header-actions">
          ${c.email ? `<a href="mailto:${c.email}" class="btn btn-ghost btn-sm">${icon('email')} Email Client</a>` : ''}
        </div>
      </div>

      <div class="tabs">
        ${tabs.map(t => `
          <button class="tab-btn ${State.activeTab === t.id ? 'active' : ''}"
            onclick="switchTab('${t.id}', '${c.id}')">${t.label}</button>
        `).join('')}
      </div>

      <div id="tab-content">
        ${renderTab(State.activeTab, c, docPct)}
      </div>
    </div>`;
}

function switchTab(tabId, caseId) {
  State.activeTab = tabId;
  const c = getCase(caseId);
  if (!c) return;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  event.currentTarget?.classList.add('active');
  document.getElementById('tab-content').innerHTML = renderTab(tabId, c,
    c.documents?.length ? Math.round(c.documents.filter(d => ['approved','reviewed'].includes(d.status)).length / c.documents.length * 100) : 0
  );
}

function renderTab(tab, c, docPct) {
  switch (tab) {
    case 'overview':   return renderOverviewTab(c, docPct);
    case 'schedule':   return renderScheduleTab(c);
    case 'emails':     return renderEmailsTab(c);
    case 'documents':  return renderDocumentsTab(c);
    case 'petition':   return renderPetitionTab(c);
    case 'status':     return renderStatusTab(c);
    case 'time-log':   return typeof TimeTracker !== 'undefined'
      ? `<div style="margin-top:16px">${TimeTracker.renderCaseTimeLog(c.id)}</div>`
      : '<p style="padding:20px;color:var(--text-3)">Time tracking module not loaded.</p>';
    default:           return renderOverviewTab(c, docPct);
  }
}

// ---- Overview Tab ----
function renderOverviewTab(c, docPct) {
  const stageIdx = STAGE_ORDER.indexOf(c.stage);

  return `
    <div class="two-col">
      <div>
        <div class="panel">
          <div class="panel-title">Client Information</div>
          <div class="three-col" style="gap:12px">
            ${infoRow('Full Name', `${c.firstName} ${c.lastName}`)}
            ${infoRow('Email', c.email || '—')}
            ${infoRow('Phone', c.phone || '—')}
            ${infoRow('Nationality / Geo', c.nationality || c.geo || '—')}
            ${infoRow('Location', c.location || '—')}
            ${infoRow('Company', c.company || '—')}
          </div>
        </div>

        <div class="panel">
          <div class="panel-title">Case Details</div>
          <div class="three-col" style="gap:12px">
            ${infoRow('Status Code', stageBadge(c.statusCode || c.stage))}
            ${infoRow('Filing Type', c.filingType || '—')}
            ${infoRow('PIF', c.pif ? '<span style="color:#16A34A;font-weight:600">✓ Paid In Full</span>' : '<span style="color:var(--text-3)">Pending</span>')}
            ${infoRow('Target Filing Date', c.targetFilingDate ? `${fmtDate(c.targetFilingDate)} <span class="${urgencyClass(daysRemaining(c.targetFilingDate))}">(${daysLabel(daysRemaining(c.targetFilingDate))})</span>` : '—')}
            ${infoRow('Status/Visa Expiration', c.expirationDate ? `${fmtDate(c.expirationDate)} <span class="${urgencyClass(daysRemaining(c.expirationDate))}">(${daysLabel(daysRemaining(c.expirationDate))})</span>` : '—')}
            ${infoRow('RFE Due Date', c.rfeDueDate ? `${fmtDate(c.rfeDueDate)} <span class="${urgencyClass(daysRemaining(c.rfeDueDate))}">(${daysLabel(daysRemaining(c.rfeDueDate))})</span>` : '—')}
            ${infoRow('Assigned Attorney', c.assignedAttorney || '—')}
            ${infoRow('Case Manager', c.assignedCM || '—')}
            ${infoRow('CM/CONC', c.cmConc || '—')}
          </div>
        </div>

        <div class="panel">
          <div class="panel-title">Case Progress</div>
          <div class="progress-overview" style="margin-bottom:20px">
            <span class="progress-label">Stage</span>
            <div class="progress-bar-wrap">
              <div class="progress-bar-fill" style="width:${Math.round((stageIdx+1)/STAGE_ORDER.length*100)}%"></div>
            </div>
            <span class="progress-pct">${STAGES[stageIdx]?.label || '—'}</span>
          </div>
          <div class="progress-overview">
            <span class="progress-label">Documents</span>
            <div class="progress-bar-wrap">
              <div class="progress-bar-fill" style="width:${docPct}%"></div>
            </div>
            <span class="progress-pct">${docPct}%</span>
          </div>
        </div>

        <div class="panel">
          <div class="panel-title">Financial</div>
          <div class="two-col" style="gap:12px">
            ${infoRow('Retainer', c.retainerPaid ? `✓ Paid${c.retainerAmount ? ' · $'+c.retainerAmount : ''}` : '⏳ Pending', c.retainerPaid ? 'var(--green)' : 'var(--yellow)')}
            ${infoRow('Filing Fees', c.filingFeesPaid ? `✓ Paid${c.filingFeesAmount ? ' · $'+c.filingFeesAmount : ''}` : '⏳ Pending', c.filingFeesPaid ? 'var(--green)' : 'var(--text-3)')}
            ${c.retainerDate ? infoRow('Retainer Date', fmtDate(c.retainerDate)) : ''}
          </div>
        </div>
      </div>

      <div>
        <div class="panel">
          <div class="panel-title">Case Timeline</div>
          <div class="timeline">
            ${renderTimeline(c)}
          </div>
        </div>

        ${c.notes ? `
        <div class="panel">
          <div class="panel-title">Notes</div>
          <div style="font-size:14px;color:var(--text-2);line-height:1.75;white-space:pre-wrap">${escHtml(c.notes)}</div>
        </div>` : ''}

        <div class="panel">
          <div class="panel-title">Quick Actions</div>
          <div style="display:flex;flex-wrap:wrap;gap:8px">
            <button class="btn btn-ghost btn-sm" onclick="switchTab('emails','${c.id}'); State.emailDraft='consultation-confirm'; switchTab('emails','${c.id}')">
              ${icon('email')} Consultation Email
            </button>
            <button class="btn btn-ghost btn-sm" onclick="State.activeTab='emails'; switchTab('emails','${c.id}')">
              ${icon('email')} Send Update
            </button>
            <button class="btn btn-ghost btn-sm" onclick="State.activeTab='documents'; switchTab('documents','${c.id}')">
              ${icon('docs')} View Documents
            </button>
            ${c.uscisReceiptNumber ? `
            <a href="https://egov.uscis.gov/casestatus/mycasestatus.do?appReceiptNum=${c.uscisReceiptNumber}" target="_blank" class="btn btn-ghost btn-sm">
              ${icon('status')} Check USCIS Status ↗
            </a>` : ''}
            <button class="btn btn-ghost btn-sm" onclick="showRepAgreement('${c.id}')">
              ${icon('petition')} Rep. Agreement
            </button>
          </div>
        </div>
      </div>
    </div>`;
}

function infoRow(label, value, color = '') {
  return `
    <div style="margin-bottom:12px">
      <div style="font-size:10px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:var(--text-3);margin-bottom:3px">${label}</div>
      <div style="font-size:13.5px;color:${color || 'var(--text-2)'}">${value || '—'}</div>
    </div>`;
}

function renderTimeline(c) {
  const events = [];
  if (c.createdAt) events.push({ date: c.createdAt, title: 'Case Created', done: true });
  if (c.consultationDate) events.push({ date: c.consultationDate, title: 'Strategy Consultation', note: c.consultationConfirmed ? 'Confirmed' : 'Scheduled', done: c.consultationConfirmed });
  if (c.retainerPaid) events.push({ date: c.retainerDate || c.createdAt, title: 'Representation Agreement Signed', done: true });
  if (c.filingDate) events.push({ date: c.filingDate, title: 'Petition Filed', done: true });
  if (c.stage === 'rfe') events.push({ date: '', title: 'RFE Received', note: 'Response in preparation', done: false });
  if (c.approvalDate) events.push({ date: c.approvalDate, title: 'Approved', done: true });

  if (!events.length) return `<div class="text-muted">No timeline events yet.</div>`;

  return events.map(e => `
    <div class="timeline-item">
      <div class="timeline-dot ${e.done ? 'done' : ''}"></div>
      <div class="timeline-content">
        <div class="timeline-title">${e.title}</div>
        ${e.date ? `<div class="timeline-date">${fmtDate(e.date)}</div>` : ''}
        ${e.note ? `<div class="timeline-note">${e.note}</div>` : ''}
      </div>
    </div>`).join('');
}

// ---- Schedule Tab ----
function renderScheduleTab(c) {
  const slots = ['9:00 AM','9:30 AM','10:00 AM','10:30 AM','11:00 AM','11:30 AM','12:00 PM','1:00 PM','2:00 PM','2:30 PM','3:00 PM','3:30 PM','4:00 PM','4:30 PM','5:00 PM','6:00 PM'];

  return `
    ${c.consultationConfirmed ? `
    <div class="consult-confirmed-banner">
      ${icon('check')} Consultation confirmed — ${fmtDate(c.consultationDate)} at ${c.consultationTime}
    </div>` : ''}

    <div class="two-col">
      <div>
        <div class="panel">
          <div class="panel-title">Schedule Consultation</div>
          <div class="field">
            <label>Date</label>
            <input type="date" value="${fmtDateInput(c.consultationDate)}" min="${today()}"
              onchange="updateCaseField('${c.id}','consultationDate',this.value)" />
          </div>
          <div class="field">
            <label>Select Time Slot</label>
            <div class="time-slots">
              ${slots.map(s => `
                <div class="time-slot ${c.consultationTime === s ? 'selected' : ''}"
                  onclick="updateCaseField('${c.id}','consultationTime','${s}'); this.parentNode.querySelectorAll('.time-slot').forEach(x=>x.classList.remove('selected')); this.classList.add('selected')">
                  ${s}
                </div>`).join('')}
            </div>
          </div>
          <div class="field">
            <label>Duration</label>
            <select onchange="updateCaseField('${c.id}','consultationDuration',this.value)">
              <option value="30" ${c.consultationDuration==='30'?'selected':''}>30 minutes</option>
              <option value="60" ${!c.consultationDuration||c.consultationDuration==='60'?'selected':''}>60 minutes</option>
              <option value="90" ${c.consultationDuration==='90'?'selected':''}>90 minutes</option>
            </select>
          </div>
          <div class="field">
            <label>Consultation Notes</label>
            <textarea placeholder="Strategy notes, eligibility assessment, criteria analysis…"
              onblur="updateCaseField('${c.id}','consultationNotes',this.value)">${escHtml(c.consultationNotes || '')}</textarea>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn btn-gold" onclick="confirmConsultation('${c.id}')">Mark as Confirmed</button>
            <button class="btn btn-ghost" onclick="State.emailDraft='consultation-confirm'; State.activeTab='emails'; switchTab('emails','${c.id}')">
              ${icon('email')} Send Confirmation Email
            </button>
          </div>
        </div>
      </div>

      <div>
        <div class="panel">
          <div class="panel-title">Consultation Details</div>
          ${infoRow('Date', c.consultationDate ? fmtDate(c.consultationDate) : 'Not scheduled')}
          ${infoRow('Time', c.consultationTime || '—')}
          ${infoRow('Duration', c.consultationDuration ? c.consultationDuration + ' minutes' : '60 minutes')}
          ${infoRow('Status', c.consultationConfirmed ? 'Confirmed' : 'Pending confirmation', c.consultationConfirmed ? 'var(--green)' : 'var(--yellow)')}
          ${c.consultationNotes ? `
          <div class="divider"></div>
          <div class="panel-title" style="margin-bottom:8px">Notes from Consultation</div>
          <div style="font-size:13.5px;color:var(--text-2);line-height:1.75;white-space:pre-wrap">${escHtml(c.consultationNotes)}</div>` : ''}
        </div>
      </div>
    </div>`;
}

// ---- Email Templates Tab ----
function renderEmailsTab(c) {
  const templates = [
    { id: 'consultation-confirm', title: 'Consultation Confirmation', desc: 'Confirm scheduled consultation date & time' },
    { id: 'intro-welcome', title: 'Welcome / Introduction', desc: 'Welcome email after initial inquiry' },
    { id: 'representation', title: 'Representation Agreement', desc: 'Send engagement agreement for signing' },
    { id: 'bank-info', title: 'Payment Instructions', desc: 'Retainer and banking details' },
    { id: 'doc-request', title: 'Document Upload Request', desc: 'Request documents via Dropbox link' },
    { id: 'status-update', title: 'Case Status Update', desc: 'Notify client of USCIS case update' },
    { id: 'rfe-received', title: 'RFE Received Notice', desc: 'Inform client of Request for Evidence' },
    { id: 'approval', title: 'Approval Notification', desc: 'Congratulations — case approved!' },
  ];

  const activeDraft = State.emailDraft;

  return `
    ${!activeDraft ? `
    <div class="email-template-grid">
      ${templates.map(t => `
        <div class="email-card" onclick="State.emailDraft='${t.id}'; switchTab('emails','${c.id}')">
          <div class="email-card-icon">${svgIcon('email')}</div>
          <h4>${t.title}</h4>
          <p>${t.desc}</p>
        </div>`).join('')}
    </div>

    ${c.emailLog?.length ? `
    <div class="panel">
      <div class="panel-title">Email Log</div>
      ${c.emailLog.map(e => `
        <div class="flex-between" style="padding:10px 0;border-bottom:1px solid var(--border-2)">
          <div>
            <div style="font-size:13.5px;color:var(--text)">${e.subject}</div>
            <div style="font-size:12px;color:var(--text-3)">${fmtDate(e.date)}</div>
          </div>
          <span class="badge badge-approved">Sent</span>
        </div>`).join('')}
    </div>` : ''}
    ` : renderEmailComposer(c, activeDraft)}`;
}

function renderEmailComposer(c, templateId) {
  const draft = buildEmailDraft(c, templateId);
  return `
    <div style="margin-bottom:16px">
      <button class="btn btn-ghost btn-sm" onclick="State.emailDraft=null; switchTab('emails','${c.id}')">
        ← Back to Templates
      </button>
    </div>
    <div class="email-composer">
      <div class="email-composer-header">
        <span>${draft.templateName}</span>
        <div style="display:flex;gap:8px;align-items:center">
          <div style="display:flex;border:1px solid var(--border-2);border-radius:6px;overflow:hidden">
            <button onclick="State.emailLang='en'; switchTab('emails','${c.id}')" style="padding:4px 10px;font-size:11px;background:${State.emailLang==='en'?'var(--gold)':'transparent'};color:${State.emailLang==='en'?'#000':'var(--text-2)'};border:none;cursor:pointer">EN</button>
            <button onclick="State.emailLang='ka'; switchTab('emails','${c.id}')" style="padding:4px 10px;font-size:11px;background:${State.emailLang==='ka'?'var(--gold)':'transparent'};color:${State.emailLang==='ka'?'#000':'var(--text-2)'};border:none;cursor:pointer">ქართ</button>
          </div>
          <button class="copy-btn" onclick="copyEmailToClipboard('${c.id}')">Copy All</button>
          <a class="btn btn-ghost btn-sm" href="${buildMailtoLink(c, draft)}" target="_blank">Open in Mail App ↗</a>
          <button class="btn btn-gold btn-sm" onclick="logEmailSent('${c.id}','${escAttr(draft.subject)}')">
            Mark as Sent
          </button>
        </div>
      </div>
      <div class="email-composer-fields">
        <div class="email-field-row">
          <span class="email-field-label">To</span>
          <input class="email-field-value" id="email-to" value="${escAttr(c.email || '')}" />
        </div>
        <div style="height:1px;background:var(--border-2)"></div>
        <div class="email-field-row">
          <span class="email-field-label">Subject</span>
          <input class="email-field-value" id="email-subject" value="${escAttr(draft.subject)}" />
        </div>
      </div>
      <div class="email-body">
        <textarea id="email-body" rows="16">${escHtml(draft.body)}</textarea>
      </div>
    </div>`;
}

function buildEmailDraft(c, templateId) {
  const name = c.firstName || 'Client';
  const fullName = `${c.firstName} ${c.lastName}`.trim() || 'Client';
  const visa = c.visaType || 'immigration';
  const consultDate = c.consultationDate ? fmtDate(c.consultationDate) : '[DATE]';
  const consultTime = c.consultationTime || '[TIME]';
  const receipt = c.uscisReceiptNumber || '[RECEIPT NUMBER]';

  const templates = {
    'consultation-confirm': {
      templateName: 'Consultation Confirmation',
      subject: `Your ${visa} Strategy Consultation — Confirmed`,
      body: `Dear ${name},

I am pleased to confirm your strategy consultation with Ana Kamkhadze, Esq. MBA.

Date: ${consultDate}
Time: ${consultTime} (Eastern Time)
Duration: ${c.consultationDuration || 60} minutes
Format: Video call (Zoom link to follow) / Phone

During our session, we will:
• Assess your eligibility profile for ${visa}
• Map your achievements to the relevant USCIS criteria
• Identify any evidence gaps and how to address them
• Outline the optimal visa pathway and timeline

Please have the following ready for our call:
• Updated CV / Resume
• Brief description of your professional achievements
• Any prior immigration filings (if applicable)

If you need to reschedule, please reply to this email at least 24 hours in advance.

Looking forward to speaking with you,

Ana Kamkhadze, Esq. MBA
Founder & Immigration Attorney
Kamkhadze PA
anka@esq.mba | (786) 590-9400
Hollywood Beach, FL

Attorney advertising. Submitting this message does not create an attorney-client relationship.`,
    },

    'intro-welcome': {
      templateName: 'Welcome / Introduction',
      subject: `Welcome to Kamkhadze PA — Next Steps for Your ${visa} Case`,
      body: `Dear ${name},

Welcome to Kamkhadze PA. It is a privilege to represent you in your U.S. immigration journey.

We specialize exclusively in U.S. Immigration and Nationality Law, with deep expertise in ${visa} petitions for extraordinary entrepreneurs, founders, and executives. Our goal is to build the strongest possible case that tells your professional story compellingly to USCIS.

Here is what to expect in the coming weeks:

1. Representation Agreement — Please review and sign the attached engagement letter.
2. Retainer Payment — Payment instructions will follow in a separate email.
3. Document Collection — You will receive a customized checklist and a secure Dropbox folder for uploading documents.
4. Strategy Session — We will schedule a focused call to walk through your evidence architecture.

Please don't hesitate to reach out at any time. My direct line is (786) 590-9400 and email is anka@esq.mba.

Warmly,

Ana Kamkhadze, Esq. MBA
Kamkhadze PA
anka@esq.mba | (786) 590-9400`,
    },

    'representation': {
      templateName: 'Representation Agreement',
      subject: `Representation Agreement — Kamkhadze PA × ${fullName}`,
      body: `Dear ${name},

Please find attached your Representation Agreement with Kamkhadze PA for legal services in connection with your ${visa} petition.

Please review the agreement carefully. It covers:
• Scope of legal services
• Attorney fees and payment schedule
• Your rights and responsibilities as a client
• Communication protocols

To proceed, please:
1. Review the attached agreement
2. Sign and return a copy to anka@esq.mba
3. Retain a copy for your records

Upon receipt of your signed agreement and retainer payment, we will formally open your case file and begin work immediately.

If you have any questions about any provisions in the agreement, please do not hesitate to contact me directly.

Best regards,

Ana Kamkhadze, Esq. MBA
Kamkhadze PA
anka@esq.mba | (786) 590-9400

PRIVILEGED & CONFIDENTIAL — ATTORNEY-CLIENT COMMUNICATION`,
    },

    'bank-info': {
      templateName: 'Payment Instructions',
      subject: `Payment Instructions — Kamkhadze PA`,
      body: `Dear ${name},

Thank you for engaging Kamkhadze PA for your ${visa} representation. Please find below our payment instructions for the retainer fee.

WIRE TRANSFER / ACH:
Bank: [BANK NAME]
Account Name: Kamkhadze PA
Account Number: [ACCOUNT NUMBER]
Routing Number: [ROUTING NUMBER]
Reference: ${fullName} — ${visa}

ZELLE:
Email: anka@esq.mba
Reference: ${fullName} — ${visa}

CHECK (payable to):
Kamkhadze PA
3800 S Ocean Dr
Hollywood Beach, FL [ZIP]

Retainer Amount: $[AMOUNT]
Due By: [DATE]

Please note: your case file will be formally opened upon receipt of both the signed representation agreement and the retainer payment.

Once payment is received, please send a confirmation to anka@esq.mba.

Thank you,

Ana Kamkhadze, Esq. MBA
Kamkhadze PA`,
    },

    'doc-request': {
      templateName: 'Document Upload Request',
      subject: `Action Required: Document Upload — ${visa} Case`,
      body: `Dear ${name},

Your ${visa} case file is now open and we are ready to begin building your evidence portfolio.

DOCUMENT UPLOAD:
Please upload all documents to your secure, private Dropbox folder:
${c.dropboxLink || '[DROPBOX LINK — please add in Case Manager]'}

FOLDER STRUCTURE:
Your folder is organized as follows:
• 01_Personal_Documents — Passport, CV, status docs
• 02_Evidence — Awards, press, publications, contributions
• 03_Support_Letters — Recommendation letters
• 04_Financial — Tax returns, compensation docs
• 05_Correspondence — For any additional documents

PRIORITY DOCUMENTS (please upload first):
• Passport copy (all pages)
• Updated CV / Resume
• Any awards, press articles, or recognition
• Compensation documentation

DOCUMENT GUIDELINES:
• Upload files in PDF, JPG, or PNG format
• Name files clearly (e.g., "Passport_${c.firstName}${c.lastName}.pdf")
• Include English translations for any non-English documents
• Higher quality scans preferred (300 DPI minimum)

Please aim to upload your priority documents within 7 days. I will review as documents come in and will reach out with any questions.

If you have difficulty with the upload link, please email me directly.

Best regards,

Ana Kamkhadze, Esq. MBA
Kamkhadze PA
anka@esq.mba | (786) 590-9400`,
    },

    'status-update': {
      templateName: 'Case Status Update',
      subject: `Case Status Update — ${receipt}`,
      body: `Dear ${name},

I am writing with an update on the status of your ${visa} petition.

USCIS Receipt Number: ${receipt}
Current Status: [STATUS]
Date of Update: ${fmtDate(new Date().toISOString())}

[PROVIDE STATUS DETAILS HERE]

You can also check your case status directly at any time:
https://egov.uscis.gov/casestatus/mycasestatus.do?appReceiptNum=${c.uscisReceiptNumber || ''}

WHAT THIS MEANS:
[Explain what the status means in plain language]

NEXT STEPS:
[Outline next steps]

Please do not hesitate to contact me if you have any questions. I will continue to monitor your case and will notify you promptly of any further updates.

Best regards,

Ana Kamkhadze, Esq. MBA
Kamkhadze PA
anka@esq.mba | (786) 590-9400`,
    },

    'rfe-received': {
      templateName: 'RFE Received Notice',
      subject: `Important: Request for Evidence Received — ${receipt}`,
      body: `Dear ${name},

USCIS has issued a Request for Evidence (RFE) on your ${visa} petition.

Receipt Number: ${receipt}
RFE Date: [DATE]
Response Deadline: [DEADLINE — typically 87 days from RFE date]

This is a routine part of the adjudication process. Receiving an RFE does not mean your case will be denied — it simply means the adjudicator requires additional documentation or clarification on specific points.

USCIS IS REQUESTING:
[List specific items requested in the RFE]

OUR RESPONSE STRATEGY:
I have carefully reviewed the RFE and have developed a response strategy. [Brief description of approach]

WHAT I NEED FROM YOU:
[List any additional documents or information needed from client]

I will have a draft response prepared for your review by [DATE]. Please plan to provide the requested materials within [X] days so we have sufficient time to prepare a thorough response.

Do not be concerned — we will address each point comprehensively. Please call or email me if you have questions.

Best regards,

Ana Kamkhadze, Esq. MBA
Kamkhadze PA
anka@esq.mba | (786) 590-9400`,
    },

    'approval': {
      templateName: 'Approval Notification',
      subject: `APPROVED — Your ${visa} Petition`,
      body: `Dear ${name},

I am thrilled to share wonderful news — your ${visa} petition has been APPROVED by USCIS!

APPROVAL DETAILS:
Receipt Number: ${receipt}
Approval Date: ${c.approvalDate ? fmtDate(c.approvalDate) : '[DATE]'}
Valid Through: [VALIDITY DATE]

This is a tremendous achievement and a testament to the strength of your extraordinary profile. Congratulations!

NEXT STEPS:
[Outline next steps — e.g., visa stamp appointment at consulate, I-485 filing, EAD/AP application, etc.]

It has been a genuine privilege to work with you on this case. Your dedication throughout the process — gathering evidence, collaborating on the legal brief, and your patience during the adjudication period — made all the difference.

Please keep this approval notice in a safe, accessible location.

If you have any questions about your next steps or future immigration planning (EB-1A, renewal, etc.), please do not hesitate to reach out. We would love to continue supporting your U.S. journey.

With warmest congratulations,

Ana Kamkhadze, Esq. MBA
Kamkhadze PA
anka@esq.mba | (786) 590-9400`,
    },
  };

  if (State.emailLang === 'ka') {
    const geo = {
      'consultation-confirm': {
        templateName: 'კონსულტაციის დადასტურება',
        subject: `თქვენი ${visa} სტრატეგიული კონსულტაცია — დადასტურებულია`,
        body: `ძვირფასო ${name},

სიამოვნებით გიდასტურებთ სტრატეგიულ კონსულტაციას ანა კამხაძესთან, Esq. MBA.

თარიღი: ${consultDate}
დრო: ${consultTime} (აღმოსავლეთ სტანდარტული დრო)
ხანგრძლივობა: ${c.consultationDuration || 60} წუთი
ფორმატი: ვიდეო ზარი (Zoom ბმული მოგვიანებით) / ტელეფონი

კონსულტაციის განმავლობაში განვიხილავთ:
• თქვენს ${visa} კრიტერიუმებს
• მტკიცებულებათა სტრუქტურას
• საქმის სტრატეგიას და ვადებს

გთხოვთ, გადაფასების შემთხვევის შემთხვების შეგვატყობინოთ 24 საათით ადრე.

პატივისცემით,

ანა კამხაძე, Esq. MBA
კამხაძე PA
anka@esq.mba | (786) 590-9400`,
      },
      'intro-welcome': {
        templateName: 'მოგესალმებით',
        subject: `კეთილი იყოს თქვენი მობრძანება — კამხაძე PA — ${visa}`,
        body: `ძვირფასო ${name},

კეთილი იყოს თქვენი მობრძანება კამხაძე PA-ში. პატივად მიმაჩნია თქვენი წარმომადგენლობა.

ჩვენ სპეციალიზდებით ${visa} შუამდგომლობებში. ჩვენი მიზანია ყველაზე ძლიერი საქმის მომზადება.

მომდევნო ნაბიჯები:
1. წარმომადგენლობის შეთანხმება — გთხოვთ გადახედოთ და ხელი მოაწეროთ.
2. ავანსის გადახდა — გადახდის ინსტრუქცია გამოგეგზავნებათ ცალკე.
3. დოკუმენტების შეგროვება — მიიღებთ Dropbox-ის ლინქს.
4. სტრატეგიული სესია — შეხვედრა განვიხილავთ თქვენი საქმის არქიტექტურას.

ნებისმიერ კითხვაზე მიმართეთ: anka@esq.mba | (786) 590-9400

პატივისცემით,
ანა კამხაძე, Esq. MBA`,
      },
      'representation': {
        templateName: 'წარმომადგენლობის შეთანხმება',
        subject: `წარმომადგენლობის შეთანხმება — კამხაძე PA × ${fullName}`,
        body: `ძვირფასო ${name},

თანდართულია თქვენი წარმომადგენლობის შეთანხმება კამხაძე PA-სთან ${visa} შუამდგომლობასთან დაკავშირებით.

გთხოვთ:
1. გადახედოთ შეთანხმებას
2. ხელი მოაწეროთ და გამოგვიგზავნოთ anka@esq.mba-ზე
3. შეინახოთ ასლი

ხელმოწერილი შეთანხმებისა და ავანსის მიღების შემდეგ, დაუყოვნლებლივ დავიწყობთ მუშაობა.

PRIVILEGED & CONFIDENTIAL — ATTORNEY-CLIENT COMMUNICATION

პატივისცემით,
ანა კამხაძე, Esq. MBA
კამხაძე PA`,
      },
      'bank-info': {
        templateName: 'გადახდის ინსტრუქცია',
        subject: `გადახდის ინსტრუქცია — კამხაძე PA`,
        body: `ძვირფასო ${name},

გიგზავნით გადახდის ინსტრუქციებს ${visa} წარმომადგენლობის ავანსის გადასახდელად.

WIRE TRANSFER / ACH:
ბანკი: [BANK NAME]
ანგარიშის სახელი: Kamkhadze PA
ანგარიშის ნომერი: [ACCOUNT NUMBER]
Routing: [ROUTING NUMBER]
დანიშნულება: ${fullName} — ${visa}

ZELLE:
Email: anka@esq.mba
დანიშნულება: ${fullName} — ${visa}

CHECK (გამოწერილი):
Kamkhadze PA
3800 S Ocean Dr
Hollywood Beach, FL

ავანსი: $[AMOUNT]
გადახდის ვადა: [DATE]

გადახდის შემდეგ დაგვიდასტურეთ: anka@esq.mba

პატივისცემით,
ანა კამხაძე, Esq. MBA`,
      },
      'doc-request': {
        templateName: 'დოკუმენტების მოთხოვნა',
        subject: `სავალდებულო: დოკუმენტების ატვირთვა — ${visa}`,
        body: `ძვირფასო ${name},

თქვენი ${visa} საქმის ფაილი გახსნილია. გთხოვთ ატვირთოთ დოკუმენტები Dropbox-ის პირად საქაღალდეში:
${c.dropboxLink || '[DROPBOX ბმული]'}

საქაღალდის სტრუქტურა:
• 01_Personal_Documents — პასპორტი, CV, სტატუსი
• 02_Evidence — ჯილდოები, პრესა, პუბლიკაციები
• 03_Support_Letters — სარეკომენდაციო წერილები
• 04_Financial — საგადასახადო, ანაზღაურება
• 05_Correspondence — სხვა

პრიორიტეტული დოკუმენტები (ჯერ ატვირთეთ):
• პასპორტი (ყველა გვერდი)
• განახლებული CV
• ჯილდოები, პრესა, აღიარება

7 დღის განმავლობაში გთხოვთ ატვირთოთ.

პატივისცემით,
ანა კამხაძე, Esq. MBA`,
      },
      'status-update': {
        templateName: 'საქმის სტატუსი',
        subject: `საქმის სტატუსის განახლება — ${receipt}`,
        body: `ძვირფასო ${name},

გიგზავნით განახლებას თქვენი ${visa} შუამდგომლობის სტატუსზე.

USCIS-ის მიღების ნომერი: ${receipt}
მიმდინარე სტატუსი: [სტატუსი]
განახლების თარიღი: ${fmtDate(new Date().toISOString())}

[სტატუსის დეტალები]

სტატუსის პირდაპირ შემოწმება:
https://egov.uscis.gov/casestatus/mycasestatus.do?appReceiptNum=${c.uscisReceiptNumber || ''}

მომდევნო ნაბიჯები: [ახსნა]

პატივისცემით,
ანა კამხაძე, Esq. MBA`,
      },
      'rfe-received': {
        templateName: 'RFE მიღებულია',
        subject: `მნიშვნელოვანი: მტკიცებულების მოთხოვნა — ${receipt}`,
        body: `ძვირფასო ${name},

USCIS-მა გამოაგზავნა Evidence-ის მოთხოვნა (RFE) თქვენს ${visa} შუამდგომლობაზე.

მიღების ნომერი: ${receipt}
RFE თარიღი: [თარიღი]
პასუხის ვადა: [ვადა — ჩვეულებრივ 87 დღე]

ეს სტანდარტული პროცედურის ნაწილია. RFE-ის მიღება არ ნიშნავს უარყოფას.

USCIS მოითხოვს: [სია]

ჩვენი სტრატეგია: [მოკლე აღწერა]

დასჭირდება: [კლიენტისგან საჭირო]

პასუხს მოამზადებ [თარიზამდე].

პატივისცემით,
ანა კამხაძე, Esq. MBA`,
      },
      'approval': {
        templateName: 'დამტკიცება!',
        subject: `დამტკიცდა — თქვენი ${visa} შუამდგომლობა`,
        body: `ძვირფასო ${name},

გილოცავთ! — თქვენი ${visa} შუამდგომლობა USCIS-მა დაამტკიცა!

დამტკიცების დეტალები:
მიღების ნომერი: ${receipt}
დამტკიცების თარიღი: ${c.approvalDate ? fmtDate(c.approvalDate) : '[თარიღი]'}

ეს დიდი მიღწევაა! გილოცავთ!

მომდევნო ნაბიჯები: [ახსნა]

იყო დიდი პატივი ამ საქმეზე თქვენთან ერთად მუშაობა.

თბილი მილოცვით,
ანა კამხაძე, Esq. MBA
კამხაძე PA`,
      },
    };
    return geo[templateId] || geo['status-update'] || templates[templateId] || templates['status-update'];
  }
  return templates[templateId] || templates['status-update'];
}

function buildMailtoLink(c, draft) {
  const to = c.email || '';
  const subject = encodeURIComponent(draft.subject);
  const body = encodeURIComponent(draft.body);
  return `mailto:${to}?subject=${subject}&body=${body}`;
}

function copyEmailToClipboard(caseId) {
  const to = document.getElementById('email-to')?.value || '';
  const subject = document.getElementById('email-subject')?.value || '';
  const body = document.getElementById('email-body')?.value || '';
  const text = `To: ${to}\nSubject: ${subject}\n\n${body}`;
  navigator.clipboard.writeText(text).then(() => toast('Email copied to clipboard'));
}

function logEmailSent(caseId, subject) {
  const c = getCase(caseId);
  if (!c) return;
  if (!c.emailLog) c.emailLog = [];
  c.emailLog.push({ subject, date: new Date().toISOString() });
  c.updatedAt = new Date().toISOString();
  Storage.save();
  toast('Email marked as sent');
  State.emailDraft = null;
  rerenderTab(caseId);
}

// ---- Documents Tab ----
function renderDocumentsTab(c) {
  const docs = c.documents || [];
  const categories = [...new Set(docs.map(d => d.category))];

  const total = docs.length;
  const counts = {
    pending: docs.filter(d => d.status === 'pending').length,
    uploaded: docs.filter(d => d.status === 'uploaded').length,
    reviewed: docs.filter(d => d.status === 'reviewed').length,
    approved: docs.filter(d => d.status === 'approved').length,
    missing: docs.filter(d => d.status === 'missing').length,
  };
  const done = counts.reviewed + counts.approved;
  const pct = total ? Math.round(done / total * 100) : 0;

  return `
    <div class="two-col">
      <div>
        <div class="panel">
          <div class="panel-title">
            Document Progress
            <button class="btn btn-ghost btn-sm" onclick="showAddDocument('${c.id}')">+ Add Document</button>
          </div>
          <div class="progress-overview" style="margin-bottom:20px">
            <span class="progress-label">Complete</span>
            <div class="progress-bar-wrap">
              <div class="progress-bar-fill" style="width:${pct}%"></div>
            </div>
            <span class="progress-pct">${pct}%</span>
          </div>
          <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px">
            <span class="badge badge-doc-pending">${counts.pending} Pending</span>
            <span class="badge badge-doc-uploaded">${counts.uploaded} Uploaded</span>
            <span class="badge badge-doc-reviewed">${counts.reviewed} Reviewed</span>
            <span class="badge badge-doc-approved">${counts.approved} Approved</span>
            ${counts.missing ? `<span class="badge badge-doc-missing">${counts.missing} Missing</span>` : ''}
          </div>
        </div>

        ${!docs.length ? `
        <div class="panel">
          <div class="empty-state" style="padding:40px 20px">
            <div class="empty-state-icon">${svgIcon('docs')}</div>
            <h3 style="font-size:18px">No documents yet</h3>
            <p>Initialize from visa type template or add manually.</p>
            <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
              <button class="btn btn-gold" onclick="initDocuments('${c.id}')">Initialize ${c.visaType} Checklist</button>
              <button class="btn btn-ghost" onclick="showAddDocument('${c.id}')">Add Manually</button>
            </div>
          </div>
        </div>` : `
        <div class="doc-list">
          ${categories.map(cat => {
            const catDocs = docs.filter(d => d.category === cat);
            return `
              <div class="doc-category">
                <div class="doc-category-title">${cat}</div>
                ${catDocs.map(d => `
                  <div class="doc-item">
                    <div class="doc-item-name">${escHtml(d.name)}</div>
                    <div class="doc-item-actions">
                      <select class="doc-status-select" onchange="updateDocStatus('${c.id}','${d.id}',this.value)" style="color:${statusColor(d.status)}">
                        <option value="pending" ${d.status==='pending'?'selected':''}>Pending</option>
                        <option value="uploaded" ${d.status==='uploaded'?'selected':''}>Uploaded</option>
                        <option value="reviewed" ${d.status==='reviewed'?'selected':''}>Reviewed</option>
                        <option value="approved" ${d.status==='approved'?'selected':''}>Approved</option>
                        <option value="missing" ${d.status==='missing'?'selected':''}>Missing</option>
                      </select>
                      <button class="btn-icon" onclick="removeDocument('${c.id}','${d.id}')" title="Remove"
                        style="padding:4px;background:none;border:none;color:var(--text-3);cursor:pointer;font-size:16px">×</button>
                    </div>
                  </div>`).join('')}
              </div>`;
          }).join('')}
        </div>`}
      </div>

      <div>
        <div class="panel">
          <div class="panel-title">Dropbox Folder</div>
          <div class="field">
            <label>Dropbox Shared Link</label>
            <input type="url" placeholder="https://www.dropbox.com/sh/…"
              value="${escAttr(c.dropboxLink || '')}"
              onblur="updateCaseField('${c.id}','dropboxLink',this.value)" />
          </div>
          ${c.dropboxLink ? `
          <a href="${escAttr(c.dropboxLink)}" target="_blank" class="btn btn-ghost btn-sm" style="margin-top:8px">
            ${icon('dropbox')} Open Dropbox Folder ↗
          </a>` : ''}
          <div class="panel-title" style="margin-top:20px;margin-bottom:8px">Suggested Folder Structure</div>
          <div class="dropbox-folder-tree">
<span class="folder">📁 ${c.firstName}_${c.lastName}_${c.visaType.replace(/ /g,'')}_KamkhadzePA/</span>
  <span class="subfolder">├── 01_Personal_Documents/</span>
  <span class="subfolder">│   ├── Passport/</span>
  <span class="subfolder">│   └── CV_Resume/</span>
  <span class="subfolder">├── 02_Evidence/</span>
  <span class="subfolder">│   ├── Awards_Recognition/</span>
  <span class="subfolder">│   ├── Press_Media/</span>
  <span class="subfolder">│   ├── Publications/</span>
  <span class="subfolder">│   ├── Judge_Reviewer/</span>
  <span class="subfolder">│   └── Other_Evidence/</span>
  <span class="subfolder">├── 03_Support_Letters/</span>
  <span class="subfolder">├── 04_Financial_Documents/</span>
  <span class="subfolder">└── 05_Correspondence/</span></div>
          <button class="copy-btn" style="margin-top:8px" onclick="copyFolderStructure('${c.id}')">Copy Folder Names</button>
        </div>

        <div class="panel" style="margin-top:16px">
          <div class="panel-title">Send Document Request Email</div>
          <p style="font-size:13px;color:var(--text-3);margin-bottom:12px">Send the client their Dropbox link and document checklist.</p>
          <button class="btn btn-ghost btn-sm" onclick="State.emailDraft='doc-request'; State.activeTab='emails'; switchTab('emails','${c.id}')">
            ${icon('email')} Compose Document Request
          </button>
        </div>
      </div>
    </div>`;
}

function statusColor(s) {
  const map = { pending: 'var(--text-3)', uploaded: 'var(--blue)', reviewed: 'var(--yellow)', approved: 'var(--green)', missing: 'var(--red)' };
  return map[s] || 'var(--text-3)';
}

function copyFolderStructure(caseId) {
  const c = getCase(caseId);
  if (!c) return;
  const text = `${c.firstName}_${c.lastName}_${c.visaType.replace(/ /g,'')}_KamkhadzePA/\n  01_Personal_Documents/\n    Passport/\n    CV_Resume/\n  02_Evidence/\n    Awards_Recognition/\n    Press_Media/\n    Publications/\n    Judge_Reviewer/\n    Other_Evidence/\n  03_Support_Letters/\n  04_Financial_Documents/\n  05_Correspondence/`;
  navigator.clipboard.writeText(text).then(() => toast('Folder structure copied'));
}

// ---- Petition Tab ----
function renderPetitionTab(c) {
  const p = c.petition || {};
  const exhibits = c.exhibits || [];

  const sections = [
    { key: 'coverLetter', title: 'Cover Letter / Filing Instructions' },
    { key: 'executiveSummary', title: 'Executive Summary of Extraordinary Ability' },
    { key: 'legalBrief', title: 'Legal Brief / Petition Statement' },
    { key: 'evidenceIndex', title: 'Evidence Index / Table of Contents' },
    { key: 'notes', title: 'Internal Notes & Drafting Notes' },
  ];

  return `
    <div class="two-col">
      <div>
        <div class="panel">
          <div class="panel-title">Petition Drafts</div>
          ${sections.map(s => `
            <div class="petition-section">
              <div class="petition-section-header" onclick="togglePetitionSection(this)">
                <h4>${s.title}</h4>
                <span style="color:var(--text-3);font-size:18px;transition:transform 0.2s">▾</span>
              </div>
              <div class="petition-section-body">
                <textarea rows="8" placeholder="Draft ${s.title}…"
                  onblur="updatePetitionField('${c.id}','${s.key}',this.value)">${escHtml(p[s.key] || '')}</textarea>
              </div>
            </div>`).join('')}
        </div>
      </div>

      <div>
        <div class="panel">
          <div class="panel-title">
            Exhibit List
            <button class="btn btn-ghost btn-sm" onclick="showAddExhibit('${c.id}')">+ Add Exhibit</button>
          </div>
          ${exhibits.length ? exhibits.map((ex, i) => `
            <div class="exhibit-item">
              <div class="exhibit-number">Ex.${String(i+1).padStart(2,'0')}</div>
              <div class="exhibit-name">${escHtml(ex.name)}</div>
              ${docStatusBadge(ex.status || 'pending')}
              <button onclick="removeExhibit('${c.id}','${ex.id}')"
                style="background:none;border:none;color:var(--text-3);cursor:pointer;font-size:18px;padding:2px 6px">×</button>
            </div>`).join('') : `
            <div class="empty-state" style="padding:30px 20px">
              <p>No exhibits listed. Add exhibits to build your evidence index.</p>
            </div>`}
        </div>

        <div class="panel" style="margin-top:16px">
          <div class="panel-title">Filing Details</div>
          <div class="field">
            <label>Filing Date</label>
            <input type="date" value="${fmtDateInput(c.filingDate)}"
              onchange="updateCaseField('${c.id}','filingDate',this.value)" />
          </div>
          <div class="field">
            <label>Priority Date</label>
            <input type="date" value="${fmtDateInput(c.priorityDate)}"
              onchange="updateCaseField('${c.id}','priorityDate',this.value)" />
          </div>
          <div class="field">
            <label>Approval Date</label>
            <input type="date" value="${fmtDateInput(c.approvalDate)}"
              onchange="updateCaseField('${c.id}','approvalDate',this.value)" />
          </div>
        </div>
      </div>
    </div>`;
}

function togglePetitionSection(header) {
  const body = header.nextElementSibling;
  const arrow = header.querySelector('span');
  const isOpen = body.style.display !== 'none';
  body.style.display = isOpen ? 'none' : 'block';
  arrow.style.transform = isOpen ? 'rotate(-90deg)' : '';
}

// ---- USCIS Status Tab ----
function renderStatusTab(c) {
  const history = c.statusHistory || [];

  return `
    <div class="two-col">
      <div>
        <div class="status-card">
          <div class="panel-title">USCIS Adjudication</div>
          <div class="field-row">
            <div class="field">
              <label>Officer Number</label>
              <input type="text" placeholder="Officer ID (auto-normalized: trimmed, uppercase)"
                value="${escAttr(c.uscisOfficerNumber || '')}"
                style="font-family:monospace"
                onblur="updateCaseField('${c.id}','uscisOfficerNumber',normalizeOfficerNumber(this.value))" />
            </div>
            <div class="field">
              <label>Officer Identified Date</label>
              <input type="date" value="${escAttr(c.officerAssignedDate || '')}"
                onchange="updateCaseField('${c.id}','officerAssignedDate',this.value)" />
            </div>
          </div>
          <div class="field-row">
            <div class="field">
              <label>RFE Response Filed Date</label>
              <input type="date" value="${escAttr(c.rfeResponseFiledDate || '')}"
                onchange="updateCaseField('${c.id}','rfeResponseFiledDate',this.value)" />
            </div>
            <div class="field">
              <label>Decision Date</label>
              <input type="date" value="${escAttr(c.decisionDate || '')}"
                onchange="updateCaseField('${c.id}','decisionDate',this.value)" />
            </div>
          </div>
          <div class="field" style="max-width:260px">
            <label>Decision Type</label>
            <select onchange="updateCaseField('${c.id}','decisionType',this.value)">
              ${OFFICER_DECISION_TYPES.map(d => `<option value="${escAttr(d)}" ${(c.decisionType||'')===d?'selected':''}>${d || '— Not set —'}</option>`).join('')}
            </select>
          </div>
          ${c.uscisOfficerNumber ? `
          <div style="margin-top:12px">
            <button class="btn btn-ghost btn-sm" onclick="navigate('officer-report'); window._officerFilter='${escAttr(c.uscisOfficerNumber)}'">
              ${icon('status')} View Officer ${escHtml(c.uscisOfficerNumber)} Report →
            </button>
          </div>` : ''}
        </div>

        <div class="status-card">
          <div class="panel-title">USCIS Case Information</div>
          <div class="field">
            <label>USCIS Receipt Number</label>
            <input type="text" placeholder="e.g. IOE1234567890 or WAC2212345678"
              value="${escAttr(c.uscisReceiptNumber || '')}"
              onblur="updateCaseField('${c.id}','uscisReceiptNumber',this.value.toUpperCase())"
              style="font-family:monospace;font-size:16px;letter-spacing:0.05em" />
          </div>
          ${c.uscisReceiptNumber ? `
          <div class="receipt-display">${c.uscisReceiptNumber}</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:20px">
            <a href="https://egov.uscis.gov/casestatus/mycasestatus.do?appReceiptNum=${c.uscisReceiptNumber}"
              target="_blank" class="btn btn-gold btn-sm">
              Check Status on USCIS.gov ↗
            </a>
            <button class="copy-btn" onclick="navigator.clipboard.writeText('${c.uscisReceiptNumber}').then(()=>toast('Receipt number copied'))">
              Copy Receipt #
            </button>
          </div>` : ''}
          <div class="field">
            <label>Consulate Case Number (if applicable)</label>
            <input type="text" placeholder="Case number / NVC number"
              value="${escAttr(c.consulateCase || '')}"
              onblur="updateCaseField('${c.id}','consulateCase',this.value)" />
          </div>
          <div class="field">
            <label>Consulate / Embassy Name</label>
            <input type="text" placeholder="e.g. U.S. Embassy London"
              value="${escAttr(c.consulateName || '')}"
              onblur="updateCaseField('${c.id}','consulateName',this.value)" />
          </div>
        </div>

        <div class="status-card">
          <div class="panel-title">
            Status History
            <button class="btn btn-ghost btn-sm" onclick="showAddStatusUpdate('${c.id}')">+ Add Update</button>
          </div>
          ${history.length ? `
          <div class="status-history">
            ${[...history].reverse().map(h => `
              <div class="status-history-item">
                <div class="status-history-date">${fmtDate(h.date)}</div>
                <div class="status-history-text">${escHtml(h.status)}</div>
              </div>`).join('')}
          </div>` : `<div class="text-muted" style="padding:12px 0">No status updates recorded yet.</div>`}
        </div>
      </div>

      <div>
        <div class="status-card">
          <div class="panel-title">Useful Links</div>
          <div style="display:flex;flex-direction:column;gap:10px">
            <a href="https://egov.uscis.gov/casestatus/mycasestatus.do" target="_blank" class="btn btn-ghost btn-sm" style="justify-content:flex-start">
              ${icon('link')} USCIS Case Status Checker ↗
            </a>
            <a href="https://travel.state.gov/content/travel/en/us-visas/visa-information-resources/wait-times.html" target="_blank" class="btn btn-ghost btn-sm" style="justify-content:flex-start">
              ${icon('link')} Consulate Wait Times ↗
            </a>
            <a href="https://travel.state.gov/content/travel/en/legal/visa-law0/visa-bulletin.html" target="_blank" class="btn btn-ghost btn-sm" style="justify-content:flex-start">
              ${icon('link')} Visa Bulletin (Priority Dates) ↗
            </a>
            <a href="https://egov.uscis.gov/processing-times/" target="_blank" class="btn btn-ghost btn-sm" style="justify-content:flex-start">
              ${icon('link')} USCIS Processing Times ↗
            </a>
            <a href="https://ceac.state.gov/CEACStatTracker/Status.aspx" target="_blank" class="btn btn-ghost btn-sm" style="justify-content:flex-start">
              ${icon('link')} Consular Case Status Tracker ↗
            </a>
          </div>
        </div>

        <div class="status-card" style="margin-top:16px">
          <div class="panel-title">Send Status Update to Client</div>
          <p style="font-size:13px;color:var(--text-3);margin-bottom:12px">
            Compose a status update email to inform your client of the latest case developments.
          </p>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn btn-ghost btn-sm" onclick="State.emailDraft='status-update'; State.activeTab='emails'; switchTab('emails','${c.id}')">
              ${icon('email')} Status Update Email
            </button>
            ${c.stage === 'rfe' ? `
            <button class="btn btn-ghost btn-sm" onclick="State.emailDraft='rfe-received'; State.activeTab='emails'; switchTab('emails','${c.id}')">
              ${icon('email')} RFE Notice Email
            </button>` : ''}
            ${c.stage === 'approved' ? `
            <button class="btn btn-gold btn-sm" onclick="State.emailDraft='approval'; State.activeTab='emails'; switchTab('emails','${c.id}')">
              ${icon('email')} Approval Congratulations
            </button>` : ''}
          </div>
        </div>
      </div>
    </div>`;
}

// ---- Actions ----
function navigate(view, caseId) {
  State.view = view;
  if (caseId) State.selectedCaseId = caseId;
  if (view !== 'case-detail') State.activeTab = 'overview';
  render();
}

function updateCaseField(caseId, field, value) {
  const c = getCase(caseId);
  if (!c) return;
  c[field] = value;
  c.updatedAt = new Date().toISOString();
  Storage.save();
}

function updatePetitionField(caseId, field, value) {
  const c = getCase(caseId);
  if (!c) return;
  if (!c.petition) c.petition = {};
  c.petition[field] = value;
  c.updatedAt = new Date().toISOString();
  Storage.save();
}

function updateDocStatus(caseId, docId, status) {
  const c = getCase(caseId);
  if (!c) return;
  const doc = c.documents?.find(d => d.id === docId);
  if (doc) {
    doc.status = status;
    c.updatedAt = new Date().toISOString();
    Storage.save();
    toast(`Document marked as ${status}`);
  }
}

function removeDocument(caseId, docId) {
  const c = getCase(caseId);
  if (!c) return;
  c.documents = (c.documents || []).filter(d => d.id !== docId);
  c.updatedAt = new Date().toISOString();
  Storage.save();
  rerenderTab(caseId);
}

function removeExhibit(caseId, exhibitId) {
  const c = getCase(caseId);
  if (!c) return;
  c.exhibits = (c.exhibits || []).filter(e => e.id !== exhibitId);
  c.updatedAt = new Date().toISOString();
  Storage.save();
  rerenderTab(caseId);
}

function initDocuments(caseId) {
  const c = getCase(caseId);
  if (!c) return;
  c.documents = buildDefaultDocs(c.visaType);
  c.updatedAt = new Date().toISOString();
  Storage.save();
  toast(`${c.visaType} document checklist initialized`);
  rerenderTab(caseId);
}

function confirmConsultation(caseId) {
  const c = getCase(caseId);
  if (!c) return;
  if (!c.consultationDate || !c.consultationTime) {
    toast('Please select a date and time first', 'warn');
    return;
  }
  c.consultationConfirmed = true;
  if (c.stage === 'lead' || c.stage === 'onboarding') c.stage = 'consultation';
  c.updatedAt = new Date().toISOString();
  Storage.save();
  toast('Consultation confirmed!');
  rerenderTab(caseId);
}

function advanceStage(caseId) {
  const c = getCase(caseId);
  if (!c) return;
  const idx = STAGE_ORDER.indexOf(c.stage);
  if (idx < STAGE_ORDER.length - 1) {
    const nextStage = STAGE_ORDER[idx + 1];
    c.stage = nextStage;
    c.updatedAt = new Date().toISOString();
    Storage.save();
    const label = STAGES.find(s => s.value === nextStage)?.label;
    toast(`Stage advanced to: ${label}`);
    render();
  }
}

function rerenderTab(caseId) {
  const c = getCase(caseId);
  if (!c) return;
  const docPct = c.documents?.length
    ? Math.round(c.documents.filter(d => ['approved','reviewed'].includes(d.status)).length / c.documents.length * 100)
    : 0;
  const tabContent = document.getElementById('tab-content');
  if (tabContent) tabContent.innerHTML = renderTab(State.activeTab, c, docPct);
}

function escHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function escAttr(str) {
  return String(str || '').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// ---- Modals ----
function showModal(html) {
  const root = document.getElementById('modal-root');
  root.innerHTML = `<div class="modal-overlay" onclick="if(event.target===this)closeModal()">${html}</div>`;
}

function closeModal() {
  document.getElementById('modal-root').innerHTML = '';
}

function showAddCase() {
  showModal(`
    <div class="modal">
      <div class="modal-header">
        <h3>New Case</h3>
        <button class="modal-close" onclick="closeModal()">×</button>
      </div>
      <div class="modal-body">
        <div class="field-row">
          <div class="field"><label>First Name *</label><input id="nc-first" placeholder="Alex" /></div>
          <div class="field"><label>Last Name *</label><input id="nc-last" placeholder="Chen" /></div>
        </div>
        <div class="field"><label>Email</label><input id="nc-email" type="email" placeholder="alex@company.com" /></div>
        <div class="field"><label>Phone</label><input id="nc-phone" placeholder="+1 (555) 000-0000" /></div>
        <div class="field-row">
          <div class="field">
            <label>Visa Type</label>
            <select id="nc-visa">
              ${VISA_TYPES.map(v => `<option value="${v}">${v}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label>Status</label>
            <select id="nc-stage">
              ${CASE_STATUSES.map(s => `<option value="${escAttr(s.value)}">${escHtml(s.label)}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="field-row">
          <div class="field"><label>Nationality / Geo</label><input id="nc-nat" placeholder="e.g. Georgian" /></div>
          <div class="field"><label>Location</label><input id="nc-loc" placeholder="e.g. New York, NY" /></div>
        </div>
        <div class="field-row">
          <div class="field"><label>Company / Organization</label><input id="nc-company" placeholder="e.g. TechCorp Inc." /></div>
          <div class="field">
            <label>Filing Type</label>
            <select id="nc-filing">
              ${FILING_TYPES.map(f => `<option value="${f}">${f}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="field-row">
          <div class="field"><label>Target Filing Date (TFD)</label><input id="nc-tfd" type="date" /></div>
          <div class="field"><label>Status / Visa Expiration</label><input id="nc-exp" type="date" /></div>
        </div>
        <div class="field-row">
          <div class="field"><label>Assigned Attorney</label><input id="nc-attorney" placeholder="Username or name" /></div>
          <div class="field"><label>Assigned Case Manager</label><input id="nc-cm" placeholder="Username or name" /></div>
        </div>
        <div class="field"><label>Notes</label><textarea id="nc-notes" rows="3" placeholder="Initial notes, referral source, case summary…"></textarea></div>
        <div class="checkbox-field" style="margin-bottom:16px">
          <input type="checkbox" id="nc-initdocs" checked />
          <label for="nc-initdocs">Initialize document checklist from visa type template</label>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
        <button class="btn btn-gold" onclick="saveNewCase()">Create Case</button>
      </div>
    </div>`);
}

function saveNewCase() {
  const firstName = document.getElementById('nc-first')?.value.trim();
  const lastName = document.getElementById('nc-last')?.value.trim();
  if (!firstName) { toast('First name is required', 'warn'); return; }

  const visaType = document.getElementById('nc-visa')?.value || 'O-1A';
  const statusCode = document.getElementById('nc-stage')?.value || 'Lead';
  const initDocs = document.getElementById('nc-initdocs')?.checked;

  const c = newCase({
    firstName,
    lastName: lastName || '',
    email: document.getElementById('nc-email')?.value.trim() || '',
    phone: document.getElementById('nc-phone')?.value.trim() || '',
    visaType,
    stage: statusCode,
    statusCode,
    filingType: document.getElementById('nc-filing')?.value || 'AOS',
    targetFilingDate: document.getElementById('nc-tfd')?.value || '',
    expirationDate: document.getElementById('nc-exp')?.value || '',
    assignedAttorney: document.getElementById('nc-attorney')?.value.trim() || Auth.username || '',
    assignedCM: document.getElementById('nc-cm')?.value.trim() || '',
    nationality: document.getElementById('nc-nat')?.value.trim() || '',
    location: document.getElementById('nc-loc')?.value.trim() || '',
    company: document.getElementById('nc-company')?.value.trim() || '',
    notes: document.getElementById('nc-notes')?.value.trim() || '',
    documents: initDocs ? buildDefaultDocs(visaType) : [],
  });

  State.cases.push(c);
  Storage.save();
  if (typeof TimeTracker !== 'undefined') TimeTracker.log(c.id, 'case_created', 'Case created');
  closeModal();
  toast(`Case created: ${firstName} ${lastName}`);
  navigate('case-detail', c.id);
}

function showEditCase(caseId) {
  const c = getCase(caseId);
  if (!c) return;

  showModal(`
    <div class="modal modal-lg">
      <div class="modal-header">
        <h3>Edit Case — ${c.firstName} ${c.lastName}</h3>
        <button class="modal-close" onclick="closeModal()">×</button>
      </div>
      <div class="modal-body">
        <div class="field-row">
          <div class="field"><label>First Name</label><input id="ec-first" value="${escAttr(c.firstName)}" /></div>
          <div class="field"><label>Last Name</label><input id="ec-last" value="${escAttr(c.lastName)}" /></div>
        </div>
        <div class="field"><label>Email</label><input id="ec-email" type="email" value="${escAttr(c.email)}" /></div>
        <div class="field"><label>Phone</label><input id="ec-phone" value="${escAttr(c.phone || '')}" /></div>
        <div class="field-row">
          <div class="field">
            <label>Visa Type</label>
            <select id="ec-visa">
              ${VISA_TYPES.map(v => `<option value="${v}" ${c.visaType===v?'selected':''}>${v}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label>Status</label>
            <select id="ec-stage">
              ${CASE_STATUSES.map(s => `<option value="${escAttr(s.value)}" ${(c.statusCode||c.stage)===s.value?'selected':''}>${escHtml(s.label)}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="field-row">
          <div class="field"><label>Nationality</label><input id="ec-nat" value="${escAttr(c.nationality || '')}" /></div>
          <div class="field"><label>Location</label><input id="ec-loc" value="${escAttr(c.location || '')}" /></div>
        </div>
        <div class="field"><label>Company</label><input id="ec-company" value="${escAttr(c.company || '')}" /></div>
        <div class="field-row">
          <div class="field"><label>USCIS Receipt #</label><input id="ec-receipt" value="${escAttr(c.uscisReceiptNumber || '')}" style="font-family:monospace" /></div>
          <div class="field"><label>Retainer Amount ($)</label><input id="ec-retainer" type="number" value="${escAttr(c.retainerAmount || '')}" /></div>
        </div>
        <div class="field-row">
          <div class="checkbox-field" style="margin-top:8px">
            <input type="checkbox" id="ec-rpaid" ${c.retainerPaid?'checked':''} />
            <label for="ec-rpaid">Retainer Paid</label>
          </div>
          <div class="checkbox-field" style="margin-top:8px">
            <input type="checkbox" id="ec-fpaid" ${c.filingFeesPaid?'checked':''} />
            <label for="ec-fpaid">Filing Fees Paid</label>
          </div>
        </div>
        <div class="field-row">
          <div class="field"><label>Target Filing Date (TFD)</label><input id="ec-tfd" type="date" value="${escAttr(c.targetFilingDate || '')}" /></div>
          <div class="field"><label>Status/Visa Expiration</label><input id="ec-exp" type="date" value="${escAttr(c.expirationDate || '')}" /></div>
        </div>
        <div class="field-row">
          <div class="field"><label>RFE Due Date</label><input id="ec-rfe" type="date" value="${escAttr(c.rfeDueDate || '')}" /></div>
          <div class="field">
            <label>Filing Type</label>
            <select id="ec-filing">
              ${FILING_TYPES.map(f => `<option value="${f}" ${(c.filingType||'AOS')===f?'selected':''}>${f}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="field-row">
          <div class="field"><label>Assigned Attorney</label><input id="ec-attorney" value="${escAttr(c.assignedAttorney || '')}" placeholder="Username" /></div>
          <div class="field"><label>Assigned Case Manager</label><input id="ec-cm" value="${escAttr(c.assignedCM || '')}" placeholder="Username" /></div>
        </div>
        <div class="field-row">
          <div class="field"><label>CM/CONC Note</label><input id="ec-cmconc" value="${escAttr(c.cmConc || '')}" placeholder="e.g. CM only" /></div>
          <div class="checkbox-field" style="margin-top:24px">
            <input type="checkbox" id="ec-pif" ${c.pif?'checked':''} />
            <label for="ec-pif">PIF (Paid In Full)</label>
          </div>
        </div>
        <div style="margin-top:16px;padding-top:16px;border-top:1px solid var(--border)">
          <div style="font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:var(--text-3);margin-bottom:12px">USCIS Adjudication</div>
          <div class="field-row">
            <div class="field">
              <label>Officer Number</label>
              <input id="ec-officer-num" value="${escAttr(c.uscisOfficerNumber || '')}" placeholder="e.g. 1234567 (auto-normalized)" style="font-family:monospace" />
            </div>
            <div class="field">
              <label>Officer Identified Date</label>
              <input id="ec-officer-date" type="date" value="${escAttr(c.officerAssignedDate || '')}" />
            </div>
          </div>
          <div class="field-row">
            <div class="field">
              <label>RFE Response Filed Date</label>
              <input id="ec-rfe-response-date" type="date" value="${escAttr(c.rfeResponseFiledDate || '')}" />
            </div>
            <div class="field">
              <label>Decision Date</label>
              <input id="ec-decision-date" type="date" value="${escAttr(c.decisionDate || '')}" />
            </div>
          </div>
          <div class="field" style="max-width:260px">
            <label>Decision Type (after RFE response)</label>
            <select id="ec-decision-type">
              ${OFFICER_DECISION_TYPES.map(d => `<option value="${escAttr(d)}" ${(c.decisionType||'')===d?'selected':''}>${d || '— Not set —'}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="field"><label>Notes</label><textarea id="ec-notes" rows="3">${escHtml(c.notes || '')}</textarea></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-danger btn-sm" onclick="confirmDeleteCase('${c.id}')">Delete Case</button>
        <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
        <button class="btn btn-gold" onclick="saveEditCase('${c.id}')">Save Changes</button>
      </div>
    </div>`);
}

function saveEditCase(caseId) {
  const c = getCase(caseId);
  if (!c) return;

  c.firstName = document.getElementById('ec-first')?.value.trim() || c.firstName;
  c.lastName = document.getElementById('ec-last')?.value.trim() || c.lastName;
  c.email = document.getElementById('ec-email')?.value.trim() || '';
  c.phone = document.getElementById('ec-phone')?.value.trim() || '';
  c.visaType = document.getElementById('ec-visa')?.value || c.visaType;
  const newStatus = document.getElementById('ec-stage')?.value || c.stage;
  c.stage = newStatus;
  c.statusCode = newStatus;
  c.nationality = document.getElementById('ec-nat')?.value.trim() || '';
  c.location = document.getElementById('ec-loc')?.value.trim() || '';
  c.company = document.getElementById('ec-company')?.value.trim() || '';
  c.uscisReceiptNumber = (document.getElementById('ec-receipt')?.value.trim() || '').toUpperCase();
  c.retainerAmount = document.getElementById('ec-retainer')?.value || '';
  c.retainerPaid = document.getElementById('ec-rpaid')?.checked || false;
  c.filingFeesPaid = document.getElementById('ec-fpaid')?.checked || false;
  c.targetFilingDate = document.getElementById('ec-tfd')?.value || '';
  c.expirationDate = document.getElementById('ec-exp')?.value || '';
  c.rfeDueDate = document.getElementById('ec-rfe')?.value || '';
  c.filingType = document.getElementById('ec-filing')?.value || 'AOS';
  c.assignedAttorney = document.getElementById('ec-attorney')?.value.trim() || '';
  c.assignedCM = document.getElementById('ec-cm')?.value.trim() || '';
  c.cmConc = document.getElementById('ec-cmconc')?.value.trim() || '';
  c.pif = document.getElementById('ec-pif')?.checked || false;
  c.uscisOfficerNumber = normalizeOfficerNumber(document.getElementById('ec-officer-num')?.value || '');
  c.officerAssignedDate = document.getElementById('ec-officer-date')?.value || '';
  c.decisionType = document.getElementById('ec-decision-type')?.value || '';
  c.decisionDate = document.getElementById('ec-decision-date')?.value || '';
  c.rfeResponseFiledDate = document.getElementById('ec-rfe-response-date')?.value || '';
  c.notes = document.getElementById('ec-notes')?.value.trim() || '';
  c.updatedAt = new Date().toISOString();

  Storage.save();
  if (typeof TimeTracker !== 'undefined') TimeTracker.log(caseId, 'status_updated', `Status updated to ${newStatus}`);
  closeModal();
  toast('Case updated');
  render();
}

function confirmDeleteCase(caseId) {
  closeModal();
  showModal(`
    <div class="modal" style="max-width:420px">
      <div class="modal-header">
        <h3>Delete Case</h3>
        <button class="modal-close" onclick="closeModal()">×</button>
      </div>
      <div class="modal-body">
        <p style="color:var(--text-2)">Are you sure you want to permanently delete this case? This action cannot be undone.</p>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
        <button class="btn btn-danger" onclick="deleteCase('${caseId}')">Delete Permanently</button>
      </div>
    </div>`);
}

function deleteCase(caseId) {
  State.cases = State.cases.filter(c => c.id !== caseId);
  Storage.save();
  closeModal();
  toast('Case deleted');
  navigate('cases');
}

function showAddDocument(caseId) {
  showModal(`
    <div class="modal" style="max-width:480px">
      <div class="modal-header">
        <h3>Add Document</h3>
        <button class="modal-close" onclick="closeModal()">×</button>
      </div>
      <div class="modal-body">
        <div class="field"><label>Document Name *</label><input id="nd-name" placeholder="e.g. Recommendation Letter from Dr. Smith" /></div>
        <div class="field"><label>Category</label>
          <input id="nd-cat" placeholder="e.g. Support Letters" list="cat-list" />
          <datalist id="cat-list">
            <option>Personal Documents</option>
            <option>Criterion Evidence</option>
            <option>Support Letters</option>
            <option>Financial Documents</option>
            <option>Employer / Petitioner</option>
            <option>Other</option>
          </datalist>
        </div>
        <div class="field">
          <label>Status</label>
          <select id="nd-status">
            <option value="pending">Pending</option>
            <option value="uploaded">Uploaded</option>
            <option value="reviewed">Reviewed</option>
            <option value="approved">Approved</option>
            <option value="missing">Missing</option>
          </select>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
        <button class="btn btn-gold" onclick="saveAddDocument('${caseId}')">Add Document</button>
      </div>
    </div>`);
}

function saveAddDocument(caseId) {
  const name = document.getElementById('nd-name')?.value.trim();
  if (!name) { toast('Document name is required', 'warn'); return; }
  const c = getCase(caseId);
  if (!c) return;
  if (!c.documents) c.documents = [];
  c.documents.push({
    id: uuid(),
    name,
    category: document.getElementById('nd-cat')?.value.trim() || 'Other',
    status: document.getElementById('nd-status')?.value || 'pending',
    notes: '',
  });
  c.updatedAt = new Date().toISOString();
  Storage.save();
  closeModal();
  toast('Document added');
  rerenderTab(caseId);
}

function showAddExhibit(caseId) {
  showModal(`
    <div class="modal" style="max-width:480px">
      <div class="modal-header">
        <h3>Add Exhibit</h3>
        <button class="modal-close" onclick="closeModal()">×</button>
      </div>
      <div class="modal-body">
        <div class="field"><label>Exhibit Name *</label><input id="ne-name" placeholder="e.g. Google News article re: [Client Name]" /></div>
        <div class="field">
          <label>Status</label>
          <select id="ne-status">
            <option value="pending">Pending</option>
            <option value="uploaded">Uploaded</option>
            <option value="reviewed">Reviewed</option>
            <option value="approved">Ready to File</option>
          </select>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
        <button class="btn btn-gold" onclick="saveAddExhibit('${caseId}')">Add Exhibit</button>
      </div>
    </div>`);
}

function saveAddExhibit(caseId) {
  const name = document.getElementById('ne-name')?.value.trim();
  if (!name) { toast('Exhibit name is required', 'warn'); return; }
  const c = getCase(caseId);
  if (!c) return;
  if (!c.exhibits) c.exhibits = [];
  c.exhibits.push({
    id: uuid(),
    name,
    status: document.getElementById('ne-status')?.value || 'pending',
  });
  c.updatedAt = new Date().toISOString();
  Storage.save();
  closeModal();
  toast('Exhibit added');
  rerenderTab(caseId);
}

function showAddStatusUpdate(caseId) {
  showModal(`
    <div class="modal" style="max-width:480px">
      <div class="modal-header">
        <h3>Add Status Update</h3>
        <button class="modal-close" onclick="closeModal()">×</button>
      </div>
      <div class="modal-body">
        <div class="field"><label>Date</label><input id="su-date" type="date" value="${today()}" /></div>
        <div class="field"><label>Status / Description *</label><textarea id="su-text" rows="3" placeholder="e.g. Case transferred to NBC. Initial review completed. No RFE at this time."></textarea></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
        <button class="btn btn-gold" onclick="saveStatusUpdate('${caseId}')">Save Update</button>
      </div>
    </div>`);
}

function saveStatusUpdate(caseId) {
  const status = document.getElementById('su-text')?.value.trim();
  if (!status) { toast('Status description is required', 'warn'); return; }
  const c = getCase(caseId);
  if (!c) return;
  if (!c.statusHistory) c.statusHistory = [];
  c.statusHistory.push({
    id: uuid(),
    date: document.getElementById('su-date')?.value || today(),
    status,
  });
  c.updatedAt = new Date().toISOString();
  Storage.save();
  closeModal();
  toast('Status update saved');
  rerenderTab(caseId);
}

// ---- Import Cases ----
function showImportCases() {
  showModal(`
    <div class="modal modal-lg">
      <div class="modal-header">
        <h3>Import Cases from Excel</h3>
        <button class="modal-close" onclick="closeModal()">×</button>
      </div>
      <div class="modal-body">
        <p style="font-size:13px;color:var(--text-3);margin-bottom:4px">
          In Excel: Select All (Ctrl+A) → Copy (Ctrl+C) → Paste below.<br>
          Columns: # · Last Name · First Name · Case Type · Legal Fee · Filing Fees · Payment · Filing Date · RA · Receipt · Expiration · Priority Date · Officer
        </p>
        <div style="background:rgba(201,168,76,0.08);border:1px solid rgba(201,168,76,0.2);border-radius:6px;padding:10px 12px;margin-bottom:12px;font-size:12px;color:var(--gold)">
          ⚠ Data is imported directly into encrypted storage. It will not appear in source code.
        </div>
        <div class="field">
          <label>Paste Excel Data (Tab-Separated)</label>
          <textarea id="import-data" rows="10" placeholder="Paste rows here — skip or include the header row, it will be auto-detected…" style="font-family:monospace;font-size:11px;line-height:1.4"></textarea>
        </div>
        <div id="import-preview" style="font-size:12px;color:var(--text-3);margin-top:4px"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
        <button class="btn btn-ghost" onclick="_previewImport()">Preview Count</button>
        <button class="btn btn-ghost" onclick="_executeImport(false)">Add to Existing</button>
        <button class="btn btn-gold" onclick="_executeImport(true)">Replace All & Import</button>
      </div>
    </div>`);
}

function _previewImport() {
  const rows = _parseImportRows(document.getElementById('import-data')?.value||'');
  document.getElementById('import-preview').textContent =
    rows.length ? `✓ ${rows.length} cases parsed and ready.` : '⚠ No valid rows detected.';
}

function _parseImportRows(text) {
  // Supports your spreadsheet layout:
  // [0]Row# [1]Last Name [2]First Name [3]Case [4]Filing Date [5]RA [6]Receipt [7]Expiration [8]Priority Date [9]Officer
  return text.trim().split('\n')
    .map(l => l.split('\t').map(c => c.trim()))
    .filter(cols => {
      if (cols.length < 3) return false;
      // Skip header rows
      if (/last.?name|^#$|^row/i.test(cols[0]||'') || /last.?name|^name$/i.test(cols[1]||'')) return false;
      // Both last and first name must have letters
      if (!/[A-Za-z]/.test(cols[1]||'') || !/[A-Za-z]/.test(cols[2]||'')) return false;
      return true;
    })
    .map(cols => {
      const caseType   = cols[3]||'';
      const filingDate = cols[4]||'';
      const raDate     = cols[5]||'';
      const receipt    = cols[6]||'';
      const expiration = cols[7]||'';
      const priorityDate = cols[8]||'';
      const officer    = cols[9]||'';
      const raDateParsed = _xDate(raDate);
      return newCase({
        lastName:           cols[1]||'',
        firstName:          cols[2]||'',
        visaType:           _visaFromCase(caseType),
        stage:              _stageFromData(filingDate, receipt, expiration),
        retainerDate:       raDateParsed,
        retainerPaid:       !!raDateParsed,
        filingDate:         _xDate(filingDate),
        approvalDate:       _xApprDate(filingDate, receipt),
        uscisReceiptNumber: _xReceipt(receipt),
        priorityDate:       _xDate(priorityDate),
        notes: [
          caseType    ? `Case Type: ${caseType}` : '',
          raDate      ? `RA Date: ${raDate}` : '',
          expiration  ? `Status/Expiration: ${expiration}` : '',
          receipt     ? `Receipt/Notes: ${receipt}` : '',
          officer     ? `Officer: ${officer}` : '',
        ].filter(Boolean).join('\n'),
      });
    });
}

async function _executeImport(replace) {
  const rows = _parseImportRows(document.getElementById('import-data')?.value||'');
  if (!rows.length) { toast('No valid rows found', 'warn'); return; }
  if (replace) State.cases = rows;
  else State.cases = [...State.cases, ...rows];
  await Storage.save();
  closeModal();
  toast(`${rows.length} cases imported successfully`);
  render();
}

// ---- Settings / Integrations ----
function renderSettings() {
  const integrations = [
    {
      id: 'outlook', name: 'Microsoft Outlook', icon: '✉',
      desc: 'Send emails directly from case manager, log sent mail, sync inbox.',
      status: sessionStorage.getItem('km_outlook_token') ? 'connected' : 'disconnected',
      setup: 'Register an app at portal.azure.com → App registrations → Add redirect URI: ' + location.href.split('?')[0],
      configKey: 'km_outlook_client_id', configLabel: 'Azure App Client ID',
      connectFn: '_connectOutlook()',
    },
    {
      id: 'dropbox', name: 'Dropbox', icon: '📦',
      desc: 'Auto-create client folders, generate share links, browse uploaded documents.',
      status: sessionStorage.getItem('km_dropbox_token') ? 'connected' : 'disconnected',
      setup: 'Create an app at dropbox.com/developers → Add OAuth2 redirect URI: ' + location.href.split('?')[0],
      configKey: 'km_dropbox_app_key', configLabel: 'Dropbox App Key',
      connectFn: '_connectDropbox()',
    },
    {
      id: 'zoom', name: 'Zoom', icon: '📹',
      desc: 'Auto-create Zoom meetings for consultations, insert link in confirmation emails.',
      status: sessionStorage.getItem('km_zoom_token') ? 'connected' : 'disconnected',
      setup: 'Create an app at marketplace.zoom.us → OAuth → Add redirect URI: ' + location.href.split('?')[0],
      configKey: 'km_zoom_client_id', configLabel: 'Zoom Client ID',
      connectFn: '_connectZoom()',
    },
  ];

  return `
    <div class="topbar">
      <div class="topbar-title">Settings & Integrations</div>
    </div>
    <div class="content">
      <div class="panel-title mb-16">Integrations</div>
      <p style="font-size:13px;color:var(--text-3);margin-bottom:24px">
        Connect external services to send emails via Outlook, manage documents in Dropbox, and create Zoom meetings automatically.
        Each integration requires a one-time app registration on the respective platform.
      </p>

      ${integrations.map(intg => {
        const connected = intg.status === 'connected';
        const savedKey = localStorage.getItem(intg.configKey) || '';
        return `
        <div class="panel" style="margin-bottom:16px">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px">
            <div style="flex:1">
              <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
                <span style="font-size:22px">${intg.icon}</span>
                <strong style="font-size:15px;color:var(--text)">${intg.name}</strong>
                <span class="badge ${connected ? 'badge-approved' : 'badge-lead'}">${connected ? 'Connected' : 'Not Connected'}</span>
              </div>
              <p style="font-size:13px;color:var(--text-3);margin-bottom:12px">${intg.desc}</p>
              ${!connected ? `
              <details style="margin-bottom:12px">
                <summary style="font-size:12px;color:var(--gold);cursor:pointer">Setup Instructions</summary>
                <p style="font-size:12px;color:var(--text-3);margin-top:8px;padding:10px;background:var(--surface-2);border-radius:6px">${intg.setup}</p>
              </details>
              <div style="display:flex;gap:8px;align-items:center">
                <input id="cfg-${intg.id}" placeholder="${intg.configLabel}" value="${escAttr(savedKey)}"
                  style="flex:1;padding:8px 12px;background:var(--surface-2);border:1px solid var(--border-2);border-radius:6px;color:var(--text);font-size:13px"
                  onblur="localStorage.setItem('${intg.configKey}',this.value)" />
                <button class="btn btn-gold btn-sm" onclick="${intg.connectFn}">Connect</button>
              </div>` : `
              <button class="btn btn-ghost btn-sm" onclick="sessionStorage.removeItem('km_${intg.id}_token'); render()">Disconnect</button>`}
            </div>
          </div>
        </div>`;
      }).join('')}

      <div class="panel" style="margin-top:24px">
        <div class="panel-title">Representation Agreement Template</div>
        <p style="font-size:13px;color:var(--text-3);margin-bottom:12px">
          Create a template for your representation agreement. Use placeholders: {{firstName}}, {{lastName}}, {{visaType}}, {{date}}, {{retainerAmount}}, {{email}}.
        </p>
        <textarea id="ra-template" rows="14" placeholder="Paste your representation agreement template here…"
          style="width:100%;box-sizing:border-box"
          onblur="localStorage.setItem('km_ra_template',this.value)">${escHtml(localStorage.getItem('km_ra_template')||'')}</textarea>
        <div style="margin-top:8px;display:flex;gap:8px">
          <button class="btn btn-ghost btn-sm" onclick="localStorage.setItem('km_ra_template',document.getElementById('ra-template').value); toast('Template saved')">Save Template</button>
        </div>
      </div>

      <div class="panel" style="margin-top:16px">
        <div class="panel-title">Petition Templates</div>
        <p style="font-size:13px;color:var(--text-3);margin-bottom:12px">
          Paste your attorney letter, table of contents, and exhibit templates. Use {{firstName}}, {{lastName}}, {{visaType}}, {{receiptNumber}} as placeholders.
        </p>
        ${['Attorney Cover Letter', 'Table of Contents', 'Exhibit Index'].map((name, i) => `
        <div style="margin-bottom:16px">
          <label style="font-size:12px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:var(--text-3);display:block;margin-bottom:6px">${name}</label>
          <textarea rows="6" placeholder="Paste ${name} template…"
            onblur="localStorage.setItem('km_petition_tpl_${i}',this.value)"
            style="width:100%;box-sizing:border-box">${escHtml(localStorage.getItem(`km_petition_tpl_${i}`)||'')}</textarea>
        </div>`).join('')}
        <button class="btn btn-ghost btn-sm" onclick="[0,1,2].forEach(i=>{const el=document.querySelectorAll('#settings-content textarea')[i+1]; if(el) localStorage.setItem('km_petition_tpl_'+i,el.value)}); toast('Petition templates saved')">Save All Templates</button>
      </div>

      <div class="panel" style="margin-top:16px">
        <div class="panel-title">Encrypted Backup — Transfer Between Devices</div>
        <p style="font-size:13px;color:var(--text-3);margin-bottom:16px;line-height:1.6">
          Create a fully encrypted backup of <strong style="color:var(--text)">all your data</strong> — cases, zoom meetings, emails, invoices, documents, team chat.
          The backup file is encrypted with your login password and can only be opened by someone who knows it.
          Save it to Google Drive, email it to yourself, or copy it to any device.
        </p>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
          <div style="padding:16px;border:1px solid var(--border-2);border-radius:8px;background:var(--surface-2)">
            <div style="font-weight:600;color:var(--text);margin-bottom:6px">☁ Backup to File</div>
            <div style="font-size:12px;color:var(--text-3);margin-bottom:12px">Download an encrypted .kmbak file containing all your data</div>
            <button class="btn btn-gold" style="width:100%;justify-content:center" onclick="_backupToFile()">Download Encrypted Backup</button>
          </div>
          <div style="padding:16px;border:1px solid var(--border-2);border-radius:8px;background:var(--surface-2)">
            <div style="font-weight:600;color:var(--text);margin-bottom:6px">⬇ Restore from File</div>
            <div style="font-size:12px;color:var(--text-3);margin-bottom:12px">Upload a .kmbak file to restore all data on this device</div>
            <button class="btn btn-ghost" style="width:100%;justify-content:center" onclick="document.getElementById('restore-file-input').click()">Upload Backup File</button>
            <input type="file" id="restore-file-input" accept=".kmbak,.json" style="display:none" onchange="_restoreFromFile(this)" />
          </div>
        </div>
        <div style="padding:12px;background:var(--gold-dim);border:1px solid rgba(212,175,55,0.2);border-radius:6px;font-size:12px;color:var(--text-2)">
          🔒 <strong>Security:</strong> Backup files are AES-256-GCM encrypted. Without your password they are unreadable.
          Store backups in Google Drive, Dropbox, or email — they are safe to keep in cloud storage.
        </div>
      </div>

      <div class="panel" style="margin-top:16px">
        <div class="panel-title">Data Management</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-ghost btn-sm" onclick="showImportCases()">Import Cases from Excel</button>
          <button class="btn btn-ghost btn-sm" onclick="_exportCases()">Export Cases (JSON)</button>
          <button class="btn btn-danger btn-sm" onclick="_confirmClearAll()">Clear All Cases</button>
        </div>
      </div>

      ${typeof RBAC !== 'undefined' ? RBAC.renderRoleSettings() : ''}
      ${typeof TimeTracker !== 'undefined' ? `<div style="margin-top:16px">${TimeTracker.renderSettings()}</div>` : ''}
      ${typeof SupabaseSync !== 'undefined' ? `<div id="settings-content" style="margin-top:16px">${renderSupabaseSettings ? renderSupabaseSettings() : ''}</div>` : ''}
    </div>`;
}

function _connectOutlook() {
  const clientId = document.getElementById('cfg-outlook')?.value || localStorage.getItem('km_outlook_client_id');
  if (!clientId) { toast('Enter your Azure App Client ID first', 'warn'); return; }
  localStorage.setItem('km_outlook_client_id', clientId);
  const verifier = _pkceVerifier();
  sessionStorage.setItem('km_pkce_verifier', verifier);
  sessionStorage.setItem('km_oauth_pending', 'outlook');
  _pkceChallenge(verifier).then(challenge => {
    const params = new URLSearchParams({
      client_id: clientId, response_type: 'code', redirect_uri: location.href.split('?')[0],
      scope: 'openid email Mail.Send Mail.ReadWrite offline_access', code_challenge: challenge,
      code_challenge_method: 'S256', state: 'outlook',
    });
    location.href = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params}`;
  });
}

function _connectDropbox() {
  const appKey = document.getElementById('cfg-dropbox')?.value || localStorage.getItem('km_dropbox_app_key');
  if (!appKey) { toast('Enter your Dropbox App Key first', 'warn'); return; }
  localStorage.setItem('km_dropbox_app_key', appKey);
  const verifier = _pkceVerifier();
  sessionStorage.setItem('km_pkce_verifier', verifier);
  sessionStorage.setItem('km_oauth_pending', 'dropbox');
  _pkceChallenge(verifier).then(challenge => {
    const params = new URLSearchParams({
      client_id: appKey, response_type: 'code', redirect_uri: location.href.split('?')[0],
      token_access_type: 'offline', code_challenge: challenge, code_challenge_method: 'S256',
    });
    location.href = `https://www.dropbox.com/oauth2/authorize?${params}`;
  });
}

function _connectZoom() {
  const clientId = document.getElementById('cfg-zoom')?.value || localStorage.getItem('km_zoom_client_id');
  if (!clientId) { toast('Enter your Zoom Client ID first', 'warn'); return; }
  localStorage.setItem('km_zoom_client_id', clientId);
  const verifier = _pkceVerifier();
  sessionStorage.setItem('km_pkce_verifier', verifier);
  sessionStorage.setItem('km_oauth_pending', 'zoom');
  _pkceChallenge(verifier).then(challenge => {
    const params = new URLSearchParams({
      response_type: 'code', client_id: clientId, redirect_uri: location.href.split('?')[0],
      code_challenge: challenge, code_challenge_method: 'S256',
    });
    location.href = `https://zoom.us/oauth/authorize?${params}`;
  });
}

function _pkceVerifier() {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return btoa(String.fromCharCode(...arr)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
}
async function _pkceChallenge(verifier) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
}

// Handle OAuth callback (token exchange happens server-side for code flow;
// for implicit/fragment flow tokens appear in hash)
function _checkOAuthCallback() {
  const params = new URLSearchParams(location.search);
  const hash = new URLSearchParams(location.hash.slice(1));
  const service = params.get('state') || sessionStorage.getItem('km_oauth_pending');
  const code = params.get('code');
  const token = hash.get('access_token');
  if (token && service) {
    sessionStorage.setItem(`km_${service}_token`, token);
    sessionStorage.removeItem('km_oauth_pending');
    history.replaceState({}, '', location.pathname);
    toast(`${service.charAt(0).toUpperCase()+service.slice(1)} connected!`);
    return true;
  }
  if (code && service) {
    // Code flow requires token exchange — show instructions
    toast(`OAuth code received. Token exchange requires a backend redirect URI handler.`, 'warn');
    history.replaceState({}, '', location.pathname);
    return true;
  }
  return false;
}

// Create representation agreement for a case
function showRepAgreement(caseId) {
  const c = getCase(caseId);
  if (!c) return;
  let tmpl = localStorage.getItem('km_ra_template') || '';
  if (!tmpl) {
    toast('No template saved. Go to Settings to add your agreement template.', 'warn');
    navigate('settings');
    return;
  }
  const filled = tmpl
    .replace(/\{\{firstName\}\}/g, c.firstName)
    .replace(/\{\{lastName\}\}/g, c.lastName)
    .replace(/\{\{fullName\}\}/g, `${c.firstName} ${c.lastName}`)
    .replace(/\{\{visaType\}\}/g, c.visaType)
    .replace(/\{\{date\}\}/g, fmtDate(new Date().toISOString()))
    .replace(/\{\{retainerAmount\}\}/g, c.retainerAmount ? `$${c.retainerAmount}` : '[AMOUNT]')
    .replace(/\{\{email\}\}/g, c.email || '[EMAIL]');

  showModal(`
    <div class="modal modal-lg">
      <div class="modal-header">
        <h3>Representation Agreement — ${c.firstName} ${c.lastName}</h3>
        <button class="modal-close" onclick="closeModal()">×</button>
      </div>
      <div class="modal-body">
        <textarea id="ra-doc" rows="18" style="font-family:Georgia,serif;font-size:13px;line-height:1.8">${escHtml(filled)}</textarea>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
        <button class="btn btn-ghost" onclick="navigator.clipboard.writeText(document.getElementById('ra-doc').value).then(()=>toast('Agreement copied'))">Copy Text</button>
        <button class="btn btn-ghost" onclick="_emailRepAgreement('${caseId}')">Send via Email</button>
        <button class="btn btn-gold" onclick="_markRAComplete('${caseId}')">Mark as Sent</button>
      </div>
    </div>`);
}

function _emailRepAgreement(caseId) {
  const c = getCase(caseId);
  if (!c) return;
  const body = document.getElementById('ra-doc')?.value || '';
  const subject = `Representation Agreement — Kamkhadze PA × ${c.firstName} ${c.lastName}`;
  window.open(`mailto:${c.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`, '_blank');
  _markRAComplete(caseId);
}

function _markRAComplete(caseId) {
  const c = getCase(caseId);
  if (!c) return;
  if (!c.emailLog) c.emailLog = [];
  c.emailLog.push({ subject: 'Representation Agreement sent', date: new Date().toISOString() });
  c.updatedAt = new Date().toISOString();
  Storage.save();
  closeModal();
  toast('Representation agreement marked as sent');
}

function _exportCases() {
  const blob = new Blob([JSON.stringify(State.cases, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `kamkhadze-cases-${today()}.json`; a.click();
  URL.revokeObjectURL(url);
}

async function _backupToFile() {
  const btn = event?.target;
  if (btn) { btn.disabled = true; btn.textContent = 'Encrypting…'; }
  try {
    const allData = {
      version: 2,
      exportedAt: new Date().toISOString(),
      cases:           localStorage.getItem('km_cases_enc_v1') || '',
      zoom:            localStorage.getItem('km_zoom_meetings') || '[]',
      emailSent:       localStorage.getItem('km_email_sent') || '[]',
      emailDrafts:     localStorage.getItem('km_email_drafts') || '[]',
      emailTemplates:  localStorage.getItem('km_email_templates') || '[]',
      invoices:        localStorage.getItem('km_invoices') || '[]',
      questionnaires:  localStorage.getItem('km_questionnaires') || '[]',
      teamChat:        localStorage.getItem('km_team_chat') || '[]',
      raTmpl:          localStorage.getItem('km_ra_template') || '',
      petitionTpl0:    localStorage.getItem('km_petition_tpl_0') || '',
      petitionTpl1:    localStorage.getItem('km_petition_tpl_1') || '',
      petitionTpl2:    localStorage.getItem('km_petition_tpl_2') || '',
    };
    // Encrypt the entire bundle
    const plaintext = JSON.stringify(allData);
    const encrypted = await Auth.encrypt(plaintext);
    const fileContent = JSON.stringify({ kmbak: 1, data: encrypted });
    const blob = new Blob([fileContent], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const dateStr = new Date().toISOString().slice(0,10);
    a.href = url;
    a.download = `kamkhadze-backup-${dateStr}.kmbak`;
    a.click();
    URL.revokeObjectURL(url);
    toast('Encrypted backup downloaded!');
  } catch(e) {
    toast('Backup failed: ' + e.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Download Encrypted Backup'; }
  }
}

async function _restoreFromFile(input) {
  const file = input.files?.[0];
  if (!file) return;
  input.value = '';
  if (!confirm(`Restore from "${file.name}"? This will overwrite ALL data on this device.`)) return;

  try {
    const text = await file.text();
    const parsed = JSON.parse(text);

    let allData;
    if (parsed.kmbak === 1) {
      // Encrypted backup — decrypt first
      const plain = await Auth.decrypt(parsed.data);
      allData = JSON.parse(plain);
    } else if (parsed.version === 2) {
      // Unencrypted legacy format
      allData = parsed;
    } else {
      toast('Unrecognised backup file format', 'error');
      return;
    }

    // Restore all slots
    if (allData.cases)          localStorage.setItem('km_cases_enc_v1',   allData.cases);
    if (allData.zoom)           localStorage.setItem('km_zoom_meetings',   allData.zoom);
    if (allData.emailSent)      localStorage.setItem('km_email_sent',      allData.emailSent);
    if (allData.emailDrafts)    localStorage.setItem('km_email_drafts',    allData.emailDrafts);
    if (allData.emailTemplates) localStorage.setItem('km_email_templates', allData.emailTemplates);
    if (allData.invoices)       localStorage.setItem('km_invoices',        allData.invoices);
    if (allData.questionnaires) localStorage.setItem('km_questionnaires',  allData.questionnaires);
    if (allData.teamChat)       localStorage.setItem('km_team_chat',       allData.teamChat);
    if (allData.raTmpl)         localStorage.setItem('km_ra_template',     allData.raTmpl);
    if (allData.petitionTpl0)   localStorage.setItem('km_petition_tpl_0',  allData.petitionTpl0);
    if (allData.petitionTpl1)   localStorage.setItem('km_petition_tpl_1',  allData.petitionTpl1);
    if (allData.petitionTpl2)   localStorage.setItem('km_petition_tpl_2',  allData.petitionTpl2);

    // Reload decrypted cases into State
    await Storage.load();
    try {
      const zm = localStorage.getItem('km_zoom_meetings');
      if (zm) State.zoom.meetings = JSON.parse(zm);
    } catch(e) {}
    try {
      const es = localStorage.getItem('km_email_sent');
      if (es) State.email.sent = JSON.parse(es);
    } catch(e) {}

    toast('All data restored successfully!');
    render();
  } catch(e) {
    if (e.message?.includes('decrypt')) {
      toast('Wrong password — this backup was created with a different password', 'error');
    } else {
      toast('Restore failed: ' + e.message, 'error');
    }
  }
}

function _confirmClearAll() {
  if (confirm('Delete ALL cases permanently? This cannot be undone.')) {
    State.cases = [];
    Storage.save();
    toast('All cases cleared');
    render();
  }
}

// Email sending (can be patched by case-manager-v2.js)
function emailSend() {
  const to = State.email.composeData.to;
  const subject = State.email.composeData.subject;
  const body = State.email.composeData.body;
  if (!to || !subject) {
    toast('Please fill in recipient and subject', 'warn');
    return;
  }
  window.open(`mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`, '_blank');
  State.email.composeData = { to: '', subject: '', body: '' };
  toast('Email opened in your mail client');
  render();
}

// ---- Stub functions patched by case-manager-v2.js ----
function rerenderZoom() { render(); }
function rerenderEmail() { render(); }
function rerenderDropbox() { render(); }
function zoomCreateMeeting() {}
function zoomToggleScheduleForm() {
  State.zoom.showScheduleForm = !State.zoom.showScheduleForm;
  render();
}
function zoomSelectClientFromSearch(caseId) {
  State.zoom.scheduleClient = State.cases.find(c => c.id === caseId) || null;
  render();
}
function zoomSaveMeetings() {
  try { localStorage.setItem('km_zoom_meetings', JSON.stringify(State.zoom.meetings)); } catch(e) {}
}
function zoomSendInvitation(meeting) {
  if (!meeting.clientEmail) { toast('No client email on file', 'warn'); return; }
  const subj = encodeURIComponent(`Zoom Meeting: ${meeting.topic || 'Consultation'}`);
  const body = encodeURIComponent(`Your meeting is scheduled for ${meeting.date} at ${meeting.time}.\n\n${meeting.zoomLink ? 'Join: ' + meeting.zoomLink : 'A link will be sent shortly.'}`);
  window.open(`mailto:${meeting.clientEmail}?subject=${subj}&body=${body}`, '_blank');
  toast('Invitation email opened');
}
function zoomSendReminder(meetingId) {
  const m = State.zoom.meetings.find(x => x.id === meetingId);
  if (!m) return;
  zoomSendInvitation(m);
}
function zoomDeleteMeeting(meetingId) {
  if (!confirm('Delete this meeting?')) return;
  State.zoom.meetings = State.zoom.meetings.filter(m => m.id !== meetingId);
  zoomSaveMeetings();
  render();
  toast('Meeting deleted');
}
function zoomCopyLink(meetingId) {
  const m = State.zoom.meetings.find(x => x.id === meetingId);
  if (!m || !m.zoomLink) { toast('No Zoom link available', 'warn'); return; }
  navigator.clipboard.writeText(m.zoomLink).then(() => toast('Link copied!')).catch(() => toast('Could not copy', 'warn'));
}
function zoomAddNotes(meetingId) {
  const m = State.zoom.meetings.find(x => x.id === meetingId);
  if (!m) return;
  const notes = prompt('Add meeting notes:', m.notes || '');
  if (notes === null) return;
  m.notes = notes;
  zoomSaveMeetings();
  render();
}
function zoomViewNotes(meetingId) { zoomAddNotes(meetingId); }
function zoomTzSearch(val) {
  State.zoom.tzSearch = val;
  const list = document.getElementById('zoom-tz-list');
  if (!list) return;
  const q = val.toLowerCase();
  const filtered = ALL_TIMEZONES ? ALL_TIMEZONES.filter(t => t.label.toLowerCase().includes(q)) : [];
  list.innerHTML = filtered.map(t =>
    `<div onmousedown="zoomSelectTz('${t.tz}')" style="padding:8px 14px;cursor:pointer;font-size:13px;color:var(--text-2);"
      onmouseover="this.style.background='var(--surface-2)'" onmouseout="this.style.background=''">${escHtml(t.label)}</div>`
  ).join('') || `<div style="padding:12px;color:var(--text-3);font-size:13px">No results</div>`;
  document.getElementById('zoom-tz-dropdown').style.display = filtered.length ? 'block' : 'none';
}
function zoomTzFocus() {
  const dd = document.getElementById('zoom-tz-dropdown');
  if (dd) dd.style.display = 'block';
}
function zoomTzBlur() {
  setTimeout(() => {
    const dd = document.getElementById('zoom-tz-dropdown');
    if (dd) dd.style.display = 'none';
  }, 200);
}
function zoomSelectTz(tz) {
  State.zoom.timezone = tz;
  State.zoom.tzSearch = '';
  const inp = document.getElementById('zoom-tz-input');
  const found = typeof ALL_TIMEZONES !== 'undefined' ? ALL_TIMEZONES.find(t => t.tz === tz) : null;
  if (inp) inp.value = found ? found.label : tz;
  const dd = document.getElementById('zoom-tz-dropdown');
  if (dd) dd.style.display = 'none';
  const sel = document.getElementById('zoom-tz-selected');
  if (sel) sel.innerHTML = found ? `<span style="font-size:12px;color:var(--green)">✓ ${escHtml(found.label)}</span>` : '';
}
function dropboxUpload() { document.getElementById('dropbox-file-input')?.click(); }
function dropboxSearchInput(val) { State.dropbox.search = val; render(); }
function dropboxOpenFile(id) { State.dropbox.activeFileId = id; render(); }

// ---- Email view ----
function renderEmailView() {
  const tab = State.email.tab || 'inbox';
  const inbox = JSON.parse(localStorage.getItem('km_email_inbox') || '[]');
  const sent = State.email.sent || [];
  const drafts = JSON.parse(localStorage.getItem('km_email_drafts') || '[]');
  const templates = JSON.parse(localStorage.getItem('km_email_templates') || JSON.stringify([
    { id: 'welcome', name: 'Welcome to Case', subject: 'Welcome to [FIRM]', body: 'Dear [CLIENT],\n\nWe are pleased to represent you...' },
    { id: 'rfe', name: 'RFE Response', subject: 'RFE Response Submitted', body: 'Dear [CLIENT],\n\nWe have submitted your RFE response to USCIS...' },
    { id: 'approval', name: 'Approval Notification', subject: 'Your Case Approved!', body: 'Dear [CLIENT],\n\nGreat news! Your case has been approved...' },
    { id: 'status', name: 'Status Update', subject: 'Case Status Update', body: 'Dear [CLIENT],\n\nHere is an update on your case...' },
  ]));

  const composing = State.email.composing || false;
  const to = (State.email.composeData && State.email.composeData.to) || '';
  const subject = (State.email.composeData && State.email.composeData.subject) || '';
  const body = (State.email.composeData && State.email.composeData.body) || '';

  const getList = () => {
    switch(tab) {
      case 'inbox': return inbox;
      case 'sent': return sent;
      case 'drafts': return drafts;
      case 'templates': return templates;
      default: return [];
    }
  };
  const list = getList();

  return `
    <div class="topbar">
      <div class="topbar-title">Email</div>
      <div class="topbar-actions">
        <button class="btn btn-gold" onclick="State.email.composing=!State.email.composing;State.email.tab='inbox';render()">
          ${icon('email')} ${composing ? 'Close' : 'Compose'}
        </button>
      </div>
    </div>
    <div class="content">
      ${composing ? `
      <div class="panel" style="margin-bottom:24px;border-color:rgba(92,199,181,0.25)">
        <div class="panel-title" style="margin-bottom:16px">${icon('email')} Compose Email</div>
        <div class="field">
          <label>To *</label>
          <input type="email" placeholder="email@example.com" id="email-to" value="${escAttr(to)}" />
        </div>
        <div class="field">
          <label>Subject *</label>
          <input type="text" placeholder="Subject…" id="email-subj" value="${escAttr(subject)}" />
        </div>
        <div class="field">
          <label>Message</label>
          <textarea rows="8" id="email-body" placeholder="Your message…" style="font-family:var(--font-body)">${escHtml(body)}</textarea>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-gold" onclick="_emailSend()">Send</button>
          <button class="btn btn-ghost" onclick="_emailSaveDraft()">Save Draft</button>
          <button class="btn btn-ghost" onclick="State.email.composing=false;render()">Cancel</button>
        </div>
      </div>` : ''}

      <div style="display:flex;gap:8px;margin-bottom:16px;border-bottom:1px solid var(--border-2);padding-bottom:12px">
        ${['inbox', 'sent', 'drafts', 'templates'].map(t => `
          <button class="btn ${tab===t ? 'btn-gold' : 'btn-ghost'}" onclick="State.email.tab='${t}';render()">
            ${t.charAt(0).toUpperCase()+t.slice(1)}
          </button>`).join('')}
      </div>

      <div class="panel">
        <div class="panel-title">${tab.charAt(0).toUpperCase()+tab.slice(1)}</div>
        ${list.length ? list.map((e,i) => `
          <div style="padding:12px 0;border-bottom:${i===list.length-1?'none':'1px solid var(--border-2)'};font-size:12.5px">
            <div style="display:flex;justify-content:space-between;gap:8px">
              <div style="flex:1">
                <strong style="color:var(--text)">${escHtml(e.subject)}</strong><br>
                <span style="color:var(--text-3)">${tab==='templates' ? escHtml(e.name) : 'To: '+escHtml(e.to||'—')} · ${escHtml(e.date||'')}</span><br>
                <span style="color:var(--text-2)">${escHtml((e.body||'').slice(0,80))}</span>
              </div>
              ${tab==='templates' ? `<button class="btn btn-ghost btn-sm" onclick="_emailUseTemplate('${e.id}')">Use</button>` : ''}
              ${tab==='drafts' ? `<button class="btn btn-ghost btn-sm" onclick="_emailEditDraft('${i}')">Edit</button>` : ''}
            </div>
          </div>`).join('') : '<p style="color:var(--text-3)">Empty</p>'}
      </div>
    </div>`;
}

function _emailUseTemplate(tplId) {
  const templates = JSON.parse(localStorage.getItem('km_email_templates') || '[]');
  const tpl = templates.find(t => t.id === tplId);
  if (!tpl) return;
  State.email.composeData.subject = tpl.subject;
  State.email.composeData.body = tpl.body;
  State.email.composing = true;
  State.email.tab = 'inbox';
  render();
  setTimeout(() => document.getElementById('email-to')?.focus(), 50);
}

function _emailEditDraft(idx) {
  const drafts = JSON.parse(localStorage.getItem('km_email_drafts') || '[]');
  const draft = drafts[idx];
  if (!draft) return;
  State.email.composeData = { to: draft.to, subject: draft.subject, body: draft.body };
  State.email.composing = true;
  State.email.tab = 'inbox';
  render();
}

function _emailSend() {
  const to = document.getElementById('email-to')?.value.trim();
  const subject = document.getElementById('email-subj')?.value.trim();
  const body = document.getElementById('email-body')?.value.trim();

  if (!to) { toast('Recipient email required', 'warn'); return; }
  if (!subject) { toast('Subject required', 'warn'); return; }

  const e = { id: uuid(), to, subject, body, date: new Date().toLocaleDateString() };
  State.email.sent.unshift(e);
  localStorage.setItem('km_email_sent', JSON.stringify(State.email.sent));

  window.open(`mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`);
  State.email.composing = false;
  State.email.composeData = { to: '', subject: '', body: '' };
  State.email.tab = 'sent';
  toast('Email sent!');
  render();
}

function _emailSaveDraft() {
  const to = document.getElementById('email-to')?.value.trim();
  const subject = document.getElementById('email-subj')?.value.trim();
  const body = document.getElementById('email-body')?.value.trim();

  if (!to && !subject && !body) { toast('Nothing to save', 'warn'); return; }

  let drafts = JSON.parse(localStorage.getItem('km_email_drafts') || '[]');
  drafts.unshift({ id: uuid(), to, subject, body, date: new Date().toLocaleDateString() });
  localStorage.setItem('km_email_drafts', JSON.stringify(drafts));

  State.email.composing = false;
  State.email.composeData = { to: '', subject: '', body: '' };
  State.email.tab = 'drafts';
  toast('Draft saved!');
  render();
}

// ---- Invoice view ----
function renderInvoices() {
  if (!State.invoices) State.invoices = JSON.parse(localStorage.getItem('km_invoices') || '[]');
  const invoices = State.invoices;
  return `
    <div class="topbar">
      <div class="topbar-title">Invoices</div>
      <div class="topbar-actions">
        <button class="btn btn-gold" onclick="showCreateInvoice()">${icon('add')} New Invoice</button>
      </div>
    </div>
    <div class="content">
      <div class="panel">
        <div class="panel-title">${icon('docs')} All Invoices</div>
        ${invoices.length ? `
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <thead>
            <tr style="border-bottom:1px solid var(--border-2);color:var(--text-3)">
              <th style="text-align:left;padding:8px 0;font-weight:500">Invoice #</th>
              <th style="text-align:left;padding:8px;font-weight:500">Client</th>
              <th style="text-align:left;padding:8px;font-weight:500">Service</th>
              <th style="text-align:right;padding:8px;font-weight:500">Amount</th>
              <th style="text-align:left;padding:8px;font-weight:500">Date</th>
              <th style="text-align:left;padding:8px;font-weight:500">Status</th>
              <th style="padding:8px;font-weight:500"></th>
            </tr>
          </thead>
          <tbody>
            ${invoices.map(inv => `
            <tr style="border-bottom:1px solid var(--border-2)">
              <td style="padding:10px 0;color:var(--gold);font-weight:600">#${escHtml(inv.number||'—')}</td>
              <td style="padding:10px 8px;color:var(--text)">${escHtml(inv.clientName||'—')}</td>
              <td style="padding:10px 8px;color:var(--text-2)">${escHtml(inv.service||'—')}</td>
              <td style="padding:10px 8px;text-align:right;font-weight:500">$${escHtml(String(inv.amount||'0'))}</td>
              <td style="padding:10px 8px;color:var(--text-3)">${escHtml(inv.date||'—')}</td>
              <td style="padding:10px 8px">
                <span style="padding:2px 10px;border-radius:10px;font-size:11px;${inv.paid
                  ? 'background:var(--green-dim);color:var(--green)'
                  : 'background:var(--gold-dim);color:var(--gold)'}">${inv.paid ? 'Paid' : 'Unpaid'}</span>
              </td>
              <td style="padding:10px 8px;display:flex;gap:6px">
                <button class="btn btn-ghost btn-sm" onclick="printInvoice('${inv.id}')">Print</button>
                <button class="btn btn-ghost btn-sm" onclick="markInvoicePaid('${inv.id}')" ${inv.paid?'disabled':''}>Mark Paid</button>
                <button class="btn btn-ghost btn-sm" style="color:var(--red)" onclick="deleteInvoice('${inv.id}')">×</button>
              </td>
            </tr>`).join('')}
          </tbody>
        </table>` : `
        <div style="text-align:center;padding:48px;color:var(--text-3)">
          <div style="font-size:32px;margin-bottom:12px">🧾</div>
          <p>No invoices yet. Create your first invoice to get started.</p>
          <button class="btn btn-gold" style="margin-top:16px" onclick="showCreateInvoice()">${icon('add')} New Invoice</button>
        </div>`}
      </div>
    </div>`;
}

function showCreateInvoice(caseId) {
  const c = caseId ? getCase(caseId) : null;
  const nextNum = ((State.invoices||[]).length + 1).toString().padStart(4, '0');
  const today = new Date().toISOString().split('T')[0];
  const modal = document.getElementById('modal-root');
  modal.innerHTML = `
    <div class="modal-backdrop" onclick="closeModal()">
      <div class="modal" onclick="event.stopPropagation()" style="max-width:520px">
        <div class="modal-header">
          <div class="modal-title">New Invoice</div>
          <button class="modal-close" onclick="closeModal()">✕</button>
        </div>
        <div style="padding:24px;display:flex;flex-direction:column;gap:14px">
          <div class="field"><label>Invoice Number</label><input type="text" id="inv-num" value="INV-${nextNum}" /></div>
          <div class="field"><label>Client Name</label>
            <input type="text" id="inv-client" value="${escAttr(c ? c.firstName+' '+c.lastName : '')}" list="inv-clients-list" />
            <datalist id="inv-clients-list">${State.cases.map(x=>`<option value="${escAttr(x.firstName+' '+x.lastName)}">`).join('')}</datalist>
          </div>
          <div class="field"><label>Service Description</label><input type="text" id="inv-service" placeholder="e.g. O-1A Petition Preparation" value="${escAttr(c ? (c.visaType||'')+' Legal Services' : '')}" /></div>
          <div class="field"><label>Amount (USD)</label><input type="number" id="inv-amount" placeholder="0.00" min="0" step="0.01" /></div>
          <div class="field"><label>Date</label><input type="date" id="inv-date" value="${today}" /></div>
          <div class="field"><label>Notes</label><textarea id="inv-notes" rows="3" placeholder="Optional notes…"></textarea></div>
          <div style="display:flex;gap:8px;margin-top:4px">
            <button class="btn btn-gold" style="flex:1;justify-content:center" onclick="saveInvoice()">Create Invoice</button>
            <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
          </div>
        </div>
      </div>
    </div>`;
}

function saveInvoice() {
  if (!State.invoices) State.invoices = [];
  const inv = {
    id: uuid(),
    number: document.getElementById('inv-num')?.value || '',
    clientName: document.getElementById('inv-client')?.value || '',
    service: document.getElementById('inv-service')?.value || '',
    amount: parseFloat(document.getElementById('inv-amount')?.value || '0'),
    date: document.getElementById('inv-date')?.value || '',
    notes: document.getElementById('inv-notes')?.value || '',
    paid: false,
    createdAt: new Date().toISOString(),
  };
  State.invoices.push(inv);
  localStorage.setItem('km_invoices', JSON.stringify(State.invoices));
  closeModal();
  toast('Invoice created');
  render();
}

function markInvoicePaid(id) {
  if (!State.invoices) return;
  const inv = State.invoices.find(i => i.id === id);
  if (inv) { inv.paid = true; localStorage.setItem('km_invoices', JSON.stringify(State.invoices)); render(); toast('Marked as paid'); }
}

function deleteInvoice(id) {
  if (!confirm('Delete this invoice?')) return;
  State.invoices = (State.invoices||[]).filter(i => i.id !== id);
  localStorage.setItem('km_invoices', JSON.stringify(State.invoices));
  render();
  toast('Invoice deleted');
}

function printInvoice(id) {
  const inv = (State.invoices||[]).find(i => i.id === id);
  if (!inv) return;
  const w = window.open('', '_blank');
  w.document.write(`<!DOCTYPE html><html><head><title>Invoice ${escHtml(inv.number)}</title>
  <style>body{font-family:Georgia,serif;max-width:700px;margin:40px auto;color:#111}
  h1{font-size:28px;margin-bottom:4px}.meta{color:#666;font-size:14px;margin-bottom:32px}
  .line{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #eee}
  .total{font-size:20px;font-weight:bold;margin-top:16px}
  .status{display:inline-block;padding:4px 14px;border-radius:20px;font-size:13px;
    background:${inv.paid?'#d1fae5':'#fef3c7'};color:${inv.paid?'#065f46':'#92400e'}}</style>
  </head><body>
  <h1>INVOICE</h1>
  <div class="meta">Kamkhadze PA · Immigration Law</div>
  <div style="display:flex;justify-content:space-between;margin-bottom:32px">
    <div><strong>Invoice #:</strong> ${escHtml(inv.number)}<br>
    <strong>Date:</strong> ${escHtml(inv.date)}<br>
    <strong>Status:</strong> <span class="status">${inv.paid?'PAID':'UNPAID'}</span></div>
    <div style="text-align:right"><strong>Bill To:</strong><br>${escHtml(inv.clientName)}</div>
  </div>
  <div class="line"><span>${escHtml(inv.service)}</span><span>$${escHtml(String(inv.amount))}</span></div>
  <div class="total" style="text-align:right">Total: $${escHtml(String(inv.amount))}</div>
  ${inv.notes?`<p style="margin-top:24px;color:#666;font-size:13px">${escHtml(inv.notes)}</p>`:''}
  <script>window.print();<\/script>
  </body></html>`);
  w.document.close();
}

// ---- Questionnaire view ----
function renderQuestionnaires() {
  const qs = JSON.parse(localStorage.getItem('km_questionnaires') || '[]');
  const TEMPLATES = [
    { id: 'o1a', label: 'O-1A Questionnaire', desc: 'Extraordinary ability in science, business, education, or athletics' },
    { id: 'eb1a', label: 'EB-1A Questionnaire', desc: 'Alien of extraordinary ability green card' },
    { id: 'eb2niw', label: 'EB-2 NIW Questionnaire', desc: 'National Interest Waiver' },
    { id: 'e2', label: 'E-2 Investor Questionnaire', desc: 'Treaty investor visa' },
    { id: 'h1b', label: 'H-1B Questionnaire', desc: 'Specialty occupation worker' },
    { id: 'general', label: 'Initial Consultation Form', desc: 'General intake for new clients' },
  ];
  return `
    <div class="topbar">
      <div class="topbar-title">Client Questionnaires</div>
      <div class="topbar-actions">
        <button class="btn btn-gold" onclick="showSendQuestionnaire()">${icon('email')} Send to Client</button>
      </div>
    </div>
    <div class="content">
      <div class="two-col" style="gap:20px;align-items:start">
        <div>
          <div class="panel">
            <div class="panel-title">${icon('docs')} Questionnaire Templates</div>
            ${TEMPLATES.map(t => `
            <div style="padding:12px 0;border-bottom:1px solid var(--border-2)">
              <div style="display:flex;justify-content:space-between;align-items:center">
                <div>
                  <div style="font-size:13.5px;font-weight:500;color:var(--text)">${escHtml(t.label)}</div>
                  <div style="font-size:12px;color:var(--text-3);margin-top:2px">${escHtml(t.desc)}</div>
                </div>
                <div style="display:flex;gap:6px">
                  <button class="btn btn-ghost btn-sm" onclick="previewQuestionnaire('${t.id}')">Preview</button>
                  <button class="btn btn-gold btn-sm" onclick="sendQuestionnaire('${t.id}')">Send</button>
                </div>
              </div>
            </div>`).join('')}
          </div>
        </div>
        <div>
          <div class="panel">
            <div class="panel-title">${icon('email')} Sent Questionnaires</div>
            ${qs.length ? qs.map(q => `
              <div style="padding:10px 0;border-bottom:1px solid var(--border-2)">
                <div style="font-size:13px;font-weight:500;color:var(--text)">${escHtml(q.clientName)}</div>
                <div style="font-size:12px;color:var(--text-3)">${escHtml(q.template)} · Sent ${escHtml(q.sentDate)}</div>
                <span style="font-size:11px;padding:2px 8px;border-radius:8px;${q.returned
                  ? 'background:var(--green-dim);color:var(--green)'
                  : 'background:var(--gold-dim);color:var(--gold)'}">${q.returned ? '✓ Returned' : 'Awaiting'}</span>
              </div>`).join('') : `<p style="color:var(--text-3);font-size:13px">No questionnaires sent yet.</p>`}
          </div>
        </div>
      </div>
    </div>`;
}

function previewQuestionnaire(templateId) {
  const labels = { o1a:'O-1A', eb1a:'EB-1A', eb2niw:'EB-2 NIW', e2:'E-2', h1b:'H-1B', general:'Initial Consultation' };
  const qs = {
    general: ['Full legal name','Date of birth','Country of birth','Country of citizenship','Current visa status','Email address','Phone number','Current employer','How did you hear about us?','Describe your immigration goal'],
    o1a: ['Full legal name','Current position and employer','Field of extraordinary ability','List of major awards/prizes received','Publications in major media','Evidence of high salary','Membership in distinguished associations','Critical role at distinguished organizations','Original contributions of major significance','Judging the work of others in your field'],
    eb1a: ['Full legal name','Field of extraordinary ability','National/international awards received','Published material about your work','Contributions of major significance to your field','Authorship of scholarly articles','Employment in critical or essential capacity','Evidence of high salary relative to peers'],
    eb2niw: ['Full legal name','Educational background (degrees, institutions)','Current occupation','How does your work benefit the United States?','What is your proposed endeavor?','Evidence of substantial merit and national importance','Are you well positioned to advance the proposed endeavor?'],
    e2: ['Full legal name','Country of treaty (citizenship)','Business you plan to invest in','Investment amount (USD)','Source of investment funds','Business plan summary','How many employees will the business create?','Your role in the business'],
    h1b: ['Full legal name','Job title and description','Employer name and address','Salary offered','Degree and field of study','University name','Current visa status','Prior H-1B history'],
  };
  const questions = qs[templateId] || qs.general;
  const w = window.open('', '_blank');
  w.document.write(`<!DOCTYPE html><html><head><title>${labels[templateId]||templateId} Questionnaire</title>
  <style>body{font-family:Georgia,serif;max-width:680px;margin:40px auto;color:#111}
  h1{font-size:24px}h2{font-size:15px;color:#555;font-weight:normal;margin-top:0}
  .q{margin-bottom:20px}label{display:block;font-weight:600;margin-bottom:6px;font-size:14px}
  input,textarea{width:100%;padding:8px;border:1px solid #ccc;border-radius:4px;font-size:14px;box-sizing:border-box}
  textarea{min-height:80px}.footer{margin-top:40px;font-size:12px;color:#999}</style>
  </head><body>
  <h1>Kamkhadze PA — ${escHtml(labels[templateId]||templateId)} Questionnaire</h1>
  <h2>Please complete all sections. Your information is kept strictly confidential.</h2>
  <hr style="margin-bottom:24px">
  ${questions.map((q,i) => `<div class="q"><label>${i+1}. ${escHtml(q)}</label><textarea rows="2"></textarea></div>`).join('')}
  <div class="footer">Kamkhadze PA · Immigration Law · www.esq.mba</div>
  </body></html>`);
  w.document.close();
}

function sendQuestionnaire(templateId) {
  const labels = { o1a:'O-1A', eb1a:'EB-1A', eb2niw:'EB-2 NIW', e2:'E-2', h1b:'H-1B', general:'Initial Consultation' };
  const clientName = prompt('Client name (for records):');
  if (!clientName) return;
  const clientEmail = prompt('Client email address:');
  if (!clientEmail) return;
  const subj = encodeURIComponent(`Kamkhadze PA — ${labels[templateId]||templateId} Questionnaire`);
  const body = encodeURIComponent(`Dear ${clientName},\n\nPlease complete the attached questionnaire for your ${labels[templateId]||templateId} case.\n\nThank you,\nKamkhadze PA`);
  window.open(`mailto:${clientEmail}?subject=${subj}&body=${body}`, '_blank');
  const qs = JSON.parse(localStorage.getItem('km_questionnaires') || '[]');
  qs.unshift({ id: uuid(), clientName, clientEmail, template: labels[templateId]||templateId, sentDate: new Date().toLocaleDateString(), returned: false });
  localStorage.setItem('km_questionnaires', JSON.stringify(qs));
  toast('Questionnaire email opened');
  render();
}

function showSendQuestionnaire() { sendQuestionnaire('general'); }

// ---- USCIS Forms Generator view ----
function renderUscisFormsGenerator() {
  const FORMS = [
    { code: 'I-129', title: 'Petition for Nonimmigrant Worker', use: 'H-1B, O-1, L-1, P-1, TN' },
    { code: 'I-140', title: 'Immigrant Petition for Alien Workers', use: 'EB-1A, EB-1B, EB-2 NIW, EB-3' },
    { code: 'I-485', title: 'Application to Register Permanent Residence', use: 'Adjustment of Status (Green Card)' },
    { code: 'I-131', title: 'Application for Travel Document', use: 'Advance Parole, Reentry Permit' },
    { code: 'I-765', title: 'Application for Employment Authorization', use: 'EAD (Work Permit)' },
    { code: 'I-539', title: 'Application to Extend/Change Nonimmigrant Status', use: 'Visa extensions, status changes' },
    { code: 'I-864', title: 'Affidavit of Support', use: 'Family-based immigration' },
    { code: 'I-130', title: 'Petition for Alien Relative', use: 'Family-based immigration' },
    { code: 'I-526', title: 'Immigrant Petition by Investor', use: 'EB-5 Investor Visa' },
    { code: 'I-918', title: 'Petition for U Nonimmigrant Status', use: 'Crime victims' },
    { code: 'I-360', title: 'Petition for Amerasian, Widow(er), or Special Immigrant', use: 'VAWA, Religious workers' },
    { code: 'N-400', title: 'Application for Naturalization', use: 'U.S. Citizenship' },
  ];
  return `
    <div class="topbar">
      <div class="topbar-title">USCIS Forms</div>
    </div>
    <div class="content">
      <div class="panel" style="margin-bottom:20px">
        <div class="panel-title">${icon('status')} Form Selector by Case Type</div>
        <div class="field" style="max-width:340px">
          <label>Select case type to see recommended forms</label>
          <select onchange="document.getElementById('uscis-rec').innerHTML=_getFormsForVisa(this.value)">
            <option value="">— Select visa type —</option>
            ${['O-1A','EB-1A','EB-2 NIW','H-1B','L-1A','E-2','TN','P-1','EB-5','Family-based','Naturalization'].map(v =>
              `<option value="${escAttr(v)}">${escHtml(v)}</option>`).join('')}
          </select>
        </div>
        <div id="uscis-rec"></div>
      </div>
      <div class="panel">
        <div class="panel-title">${icon('docs')} All USCIS Forms</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px;margin-top:8px">
          ${FORMS.map(f => `
          <div style="border:1px solid var(--border-2);border-radius:8px;padding:14px;background:var(--surface-2)">
            <div style="display:flex;justify-content:space-between;align-items:flex-start">
              <div>
                <div style="font-size:15px;font-weight:600;color:var(--gold)">${escHtml(f.code)}</div>
                <div style="font-size:12.5px;color:var(--text);margin-top:4px;line-height:1.4">${escHtml(f.title)}</div>
                <div style="font-size:11px;color:var(--text-3);margin-top:4px">${escHtml(f.use)}</div>
              </div>
            </div>
            <div style="display:flex;gap:8px;margin-top:12px">
              <a href="https://www.uscis.gov/forms/${f.code.toLowerCase()}" target="_blank" class="btn btn-ghost btn-sm">USCIS.gov ↗</a>
              <button class="btn btn-ghost btn-sm" onclick="uscisFormChecklist('${f.code}')">Checklist</button>
            </div>
          </div>`).join('')}
        </div>
      </div>
    </div>`;
}

function _getFormsForVisa(visa) {
  const map = {
    'O-1A':        ['I-129 (primary petition)', 'I-539 (dependents)', 'I-765 (EAD if applicable)'],
    'EB-1A':       ['I-140 (primary petition)', 'I-485 (if priority date current)', 'I-765 (EAD)', 'I-131 (Advance Parole)'],
    'EB-2 NIW':    ['I-140 (primary petition)', 'I-485 (if priority date current)', 'I-765 (EAD)', 'I-131 (Advance Parole)'],
    'H-1B':        ['I-129 (primary petition)', 'I-539 (H-4 dependents)', 'I-765 (H-4 EAD)'],
    'L-1A':        ['I-129 (primary petition)', 'I-539 (L-2 dependents)'],
    'E-2':         ['DS-160 (consular) or I-539 (change of status)', 'I-765 (EAD for spouse)'],
    'TN':          ['I-129 (if filing with USCIS)', 'DS-160 (if at border/consulate)'],
    'P-1':         ['I-129 (primary petition)', 'I-539 (P-4 dependents)'],
    'EB-5':        ['I-526 (investor petition)', 'I-485 or DS-260 (immigrant visa)', 'I-765 (EAD)'],
    'Family-based':['I-130 (petition)', 'I-864 (affidavit of support)', 'I-485 or DS-260', 'I-131 (Advance Parole)', 'I-765 (EAD)'],
    'Naturalization':['N-400 (application for citizenship)'],
  };
  const forms = map[visa] || [];
  if (!forms.length) return '';
  return `<div style="margin-top:14px;padding:14px;background:var(--surface-2);border-radius:8px;border:1px solid var(--border-2)">
    <div style="font-size:12px;font-weight:600;color:var(--gold);margin-bottom:8px">Recommended for ${escHtml(visa)}:</div>
    ${forms.map(f => `<div style="font-size:13px;color:var(--text-2);padding:3px 0">• ${escHtml(f)}</div>`).join('')}
  </div>`;
}

function uscisFormChecklist(code) {
  const checklists = {
    'I-129': ['Cover letter', 'Form I-129 signed', 'Filing fee ($460+)', 'Support letter from employer', 'LCA (H-1B only)', 'Evidence of qualifying credentials', 'Copies of prior approvals (if extension)'],
    'I-140': ['Form I-140 signed', 'Filing fee ($700)', 'Evidence of extraordinary ability (EB-1A: 3+ criteria)', 'Degree/transcripts (EB-2)', 'NIW advisory opinion letter (EB-2 NIW)', 'Tax returns / ability to pay (employer-based)'],
    'I-485': ['Form I-485', 'Filing fee ($1440 including biometrics)', 'Form I-864 Affidavit of Support', 'Medical exam Form I-693', 'Birth certificate', 'Passport copies', 'Form I-131 (Advance Parole) if traveling', 'Form I-765 (EAD)'],
    'I-765': ['Form I-765', 'Filing fee ($520 or included with I-485)', '2 passport photos', 'Copy of ID', 'Evidence of eligible category'],
  };
  const items = checklists[code] || ['See USCIS instructions at uscis.gov/forms/' + code.toLowerCase()];
  alert(`${code} Checklist:\n\n${items.map((x,i) => `${i+1}. ${x}`).join('\n')}`);
}

// ---- Team Chat view ----
function renderTeamChat() {
  const currentChannel = State.teamChat?.currentChannel || 'general';
  let allMsgs = JSON.parse(localStorage.getItem('km_team_chat') || '[]');
  const msgs = allMsgs.filter(m => (m.channel || 'general') === currentChannel);
  const channels = JSON.parse(localStorage.getItem('km_chat_channels') || JSON.stringify([
    { id: 'general', name: 'General', description: 'General discussion' },
    { id: 'cases', name: 'Cases', description: 'Case updates & status' },
    { id: 'announcements', name: 'Announcements', description: 'Team announcements' },
    { id: 'random', name: 'Random', description: 'Off-topic chat' },
  ]));
  const members = JSON.parse(localStorage.getItem('km_chat_members') || JSON.stringify([
    { id: '1', name: 'You (Attorney)', status: 'online', role: 'Admin' },
    { id: '2', name: 'Team Member 1', status: 'online', role: 'Member' },
    { id: '3', name: 'Team Member 2', status: 'offline', role: 'Member' },
    { id: '4', name: 'Team Member 3', status: 'online', role: 'Member' },
  ]));

  if (!State.teamChat) State.teamChat = { currentChannel: 'general' };

  return `
    <div class="topbar">
      <div class="topbar-title">Team Chat</div>
    </div>
    <div class="content" style="display:flex;gap:16px;height:calc(100vh - 200px)">
      <div style="width:180px;border-right:1px solid var(--border-2);overflow-y:auto">
        <div style="font-weight:600;color:var(--text-3);font-size:11px;padding:8px;text-transform:uppercase">Channels</div>
        ${channels.map(ch => `
          <button class="nav-item" onclick="State.teamChat.currentChannel='${ch.id}';render()"
            style="width:calc(100% - 16px);margin:4px 8px;background:${currentChannel===ch.id?'var(--gold-dim)':'transparent'};justify-content:flex-start;text-align:left">
            # ${escHtml(ch.name)}
          </button>`).join('')}
        <div style="border-top:1px solid var(--border-2);margin-top:12px;padding-top:12px;font-weight:600;color:var(--text-3);font-size:11px;padding-left:8px;text-transform:uppercase">Members (${members.length})</div>
        ${members.map(m => `
          <div style="padding:8px;display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text-2)">
            <span style="width:8px;height:8px;border-radius:50%;background:${m.status==='online'?'var(--green)':'var(--text-3)'}"></span>
            ${escHtml(m.name.replace('You (Attorney)','You'))}
          </div>`).join('')}
      </div>
      <div style="flex:1;display:flex;flex-direction:column">
        <div style="margin-bottom:12px">
          <div style="font-size:16px;font-weight:600;color:var(--text)"># ${escHtml(channels.find(c=>c.id===currentChannel)?.name||'—')}</div>
          <div style="font-size:12px;color:var(--text-3)">${escHtml(channels.find(c=>c.id===currentChannel)?.description||'')}</div>
        </div>
        <div style="flex:1;border:1px solid var(--border-2);border-radius:8px;overflow-y:auto;padding:12px;margin-bottom:12px">
          ${msgs.length ? msgs.map(m => `
            <div style="margin-bottom:12px">
              <div style="display:flex;gap:8px;align-items:baseline">
                <div style="font-weight:600;font-size:12px;color:var(--gold)">${escHtml(m.from)}</div>
                <div style="font-size:10px;color:var(--text-3)">${escHtml(m.time)}</div>
              </div>
              <div style="color:var(--text);margin-top:2px">${escHtml(m.text)}</div>
            </div>`).join('') : '<p style="color:var(--text-3);text-align:center">No messages yet. Start the conversation!</p>'}
        </div>
        <div style="display:flex;gap:8px">
          <input type="text" id="team-chat-input" placeholder="Send a message…"
            onkeydown="if(event.key==='Enter') _teamChatSend()"
            style="flex:1;background:var(--surface);border:1px solid var(--border-2);border-radius:6px;padding:8px 12px;font-size:13px;color:var(--text)" />
          <button class="btn btn-gold btn-sm" onclick="_teamChatSend()">Send</button>
        </div>
      </div>
    </div>`;
}

function _teamChatSend() {
  const input = document.getElementById('team-chat-input');
  if (!input) return;
  const msg = input.value.trim();
  if (!msg) { toast('Message cannot be empty', 'warn'); return; }

  let msgs = JSON.parse(localStorage.getItem('km_team_chat') || '[]');
  const channel = State.teamChat?.currentChannel || 'general';
  msgs.push({
    id: uuid(),
    from: 'You',
    text: msg,
    channel: channel,
    time: new Date().toLocaleTimeString('en-US', {hour:'2-digit',minute:'2-digit'}),
  });
  localStorage.setItem('km_team_chat', JSON.stringify(msgs));
  input.value = '';
  toast('Message sent!');
  render();
}

// ---- Main render ----
function renderMain() {
  // v2 views (handled by case-manager-v2.js)
  if (typeof renderDropboxSection !== 'undefined' && State.view === 'dropbox') {
    return renderDropboxSection();
  }
  if (typeof renderZoomMeetings !== 'undefined' && State.view === 'zoom') {
    return renderZoomMeetings();
  }

  switch (State.view) {
    case 'dashboard':        return renderDashboard();
    case 'cases':            return renderCasesList();
    case 'case-detail':      return renderCaseDetail(State.selectedCaseId);
    case 'settings':         return renderSettings();
    case 'email':            return renderEmailView();
    case 'team-chat':        return renderTeamChat();
    case 'invoices':         return renderInvoices();
    case 'questionnaires':   return renderQuestionnaires();
    case 'uscis-forms':      return renderUscisFormsGenerator();
    case 'deadline-alerts':  return renderDeadlineAlerts();
    case 'time-tracking':    return typeof TimeTracker !== 'undefined' ? `<div class="topbar"><div class="topbar-title">Time Tracking</div></div><div class="content">${TimeTracker.renderTimeReport({})}</div>` : renderDashboard();
    case 'officer-report':
      return typeof OfficerReport !== 'undefined' ? OfficerReport.renderPage() : renderDashboard();
    case 'reports':
      if (typeof Reports !== 'undefined') return Reports.renderReportsHub();
      return renderDashboard();
    default:                 return renderDashboard();
  }
}

function render() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="app-layout">
      ${renderSidebar()}
      <main class="main" id="main-content">
        ${renderMain()}
      </main>
    </div>`;
}

// Check for OAuth callback before boot
_checkOAuthCallback();

// ---- Boot (waits for Auth.ready, then loads encrypted data) ----
Auth.ready.then(async () => {
  await Storage.load();

  // One-time status migration — maps legacy values to the canonical 9-value set
  migrateStatuses();

  // Restore persisted zoom meetings
  try {
    const zm = localStorage.getItem('km_zoom_meetings');
    if (zm) State.zoom.meetings = JSON.parse(zm);
  } catch(e) {}

  render();
});
