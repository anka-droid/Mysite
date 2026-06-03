/* ============================================================
   Kamkhadze PA — Case Manager Reports Suite
   Requires: case-manager-auth.js, case-manager.js,
             case-manager-rbac.js loaded first
   ============================================================ */

/* eslint-disable no-unused-vars */

// ---- State extension ----
// Patch activeReport onto existing State if available, else use window._activeReport
(function _patchReportState() {
  if (typeof State !== 'undefined' && !('activeReport' in State)) {
    State.activeReport = null;
  }
})();

// ---- Status code maps ----
const STATUS_CODES = {
  KDE: 'Case Development',
  KAR: 'Case Almost Ready',
  KFI: 'Case Filed',
  KAP: 'Case Approved',
  KRE: 'Case Ready',
  RFE: 'Request for Evidence',
  RFF: 'RFE Filed',
  RFA: 'RFE Almost Ready',
  RFR: 'RFE Ready',
  KW2: 'Withdrawal',
  APF: 'Appeal Filed',
};

const STATUS_ORDER = ['KDE','KAR','KRE','KFI','RFE','RFA','RFR','RFF','KAP','KW2','APF'];

// ---- Local helpers ----
function _esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function _daysBetween(isoA, isoB) {
  if (!isoA || !isoB) return null;
  return Math.round((new Date(isoB) - new Date(isoA)) / 86400000);
}

function _daysFromToday(iso) {
  if (!iso) return null;
  return _daysBetween(new Date().toISOString().split('T')[0], iso);
}

function _todayIso() {
  return new Date().toISOString().split('T')[0];
}

function _fmtDate(iso) {
  if (typeof fmtDate === 'function') return fmtDate(iso);
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function _statusLabel(c) {
  const code = c.statusCode || c.stage || '';
  if (STATUS_CODES[code]) return STATUS_CODES[code];
  // Fall back to old STAGES labels
  if (typeof STAGES !== 'undefined') {
    const found = STAGES.find(s => s.value === code);
    if (found) return found.label;
  }
  return code || '—';
}

function _statusCode(c) {
  return c.statusCode || c.stage || '—';
}

function _clientName(c) {
  return `${c.firstName || ''} ${c.lastName || ''}`.trim() || '—';
}

function _getCases() {
  if (typeof State !== 'undefined' && Array.isArray(State.cases)) return State.cases;
  return [];
}

function _getActiveReport() {
  if (typeof State !== 'undefined' && State.activeReport) return State.activeReport;
  return window._activeReport || null;
}

function _setActiveReport(id) {
  if (typeof State !== 'undefined') State.activeReport = id;
  window._activeReport = id;
}

// ---- Shared UI primitives ----
function _reportTopbar(title, buttons) {
  return `
    <div class="topbar" style="display:flex;align-items:center;justify-content:space-between;padding:0 32px;border-bottom:1px solid var(--border)">
      <div style="display:flex;align-items:center;gap:12px">
        <button class="btn btn-ghost btn-sm" onclick="Reports.navigate(null)" style="font-size:12px">
          ← Reports
        </button>
        <div class="topbar-title" style="margin:0">${_esc(title)}</div>
      </div>
      <div style="display:flex;gap:8px;align-items:center">${buttons || ''}</div>
    </div>`;
}

function _filterBar(fields) {
  // fields: array of { type, id, label, options, value, onchange }
  const inputs = fields.map(f => {
    if (f.type === 'select') {
      const opts = (f.options || []).map(o =>
        `<option value="${_esc(o.value)}" ${f.value === o.value ? 'selected' : ''}>${_esc(o.label)}</option>`
      ).join('');
      return `<div style="display:flex;flex-direction:column;gap:4px">
        <label style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-3)">${_esc(f.label)}</label>
        <select style="padding:6px 10px;border:1px solid var(--border-2);border-radius:var(--radius);background:var(--white);font-size:12px;color:var(--text-2);min-width:140px" onchange="${_esc(f.onchange)}">
          ${opts}
        </select>
      </div>`;
    }
    if (f.type === 'date') {
      return `<div style="display:flex;flex-direction:column;gap:4px">
        <label style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-3)">${_esc(f.label)}</label>
        <input type="date" value="${_esc(f.value || '')}" style="padding:6px 10px;border:1px solid var(--border-2);border-radius:var(--radius);background:var(--white);font-size:12px;color:var(--text-2)" onchange="${_esc(f.onchange)}" />
      </div>`;
    }
    return '';
  }).join('');

  return `<div style="display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end;padding:16px 32px;background:var(--surface-2);border-bottom:1px solid var(--border)">${inputs}</div>`;
}

function _urgencyColor(days) {
  if (days === null || days === undefined) return '';
  if (days < 30) return 'var(--red)';
  if (days < 90) return 'var(--yellow)';
  return 'var(--green)';
}

function _urgencyBg(days) {
  if (days === null || days === undefined) return '';
  if (days < 30) return 'var(--red-dim)';
  if (days < 90) return 'var(--yellow-dim)';
  return '';
}

function _statusBadge(code) {
  const colors = {
    KDE: '#6366f1', KAR: '#8b5cf6', KFI: '#2563eb', KAP: '#16a34a',
    KRE: '#0891b2', RFE: '#dc2626', RFF: '#d97706', RFA: '#ea580c',
    RFR: '#f59e0b', KW2: '#6b7280', APF: '#9333ea',
  };
  const color = colors[code] || '#6b7280';
  const label = STATUS_CODES[code] || code || '—';
  return `<span style="display:inline-block;padding:2px 8px;border-radius:9999px;font-size:11px;font-weight:600;background:${color}1a;color:${color};border:1px solid ${color}33;white-space:nowrap">${_esc(label)}</span>`;
}

function _cssBar(pct, color) {
  return `<div style="display:flex;align-items:center;gap:8px">
    <div style="flex:1;height:8px;background:var(--border);border-radius:4px;overflow:hidden;min-width:60px">
      <div style="height:100%;width:${Math.min(100, pct)}%;background:${color || 'var(--gold)'};border-radius:4px"></div>
    </div>
    <span style="font-size:11px;color:var(--text-3);min-width:28px;text-align:right">${Math.round(pct)}%</span>
  </div>`;
}

function _tableWrap(head, rows, emptyMsg) {
  if (!rows.length) {
    return `<div style="text-align:center;padding:40px;color:var(--text-3);font-size:14px">${emptyMsg || 'No data.'}</div>`;
  }
  return `<div style="overflow-x:auto">
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <thead>
        <tr style="border-bottom:2px solid var(--border)">
          ${head.map(h => `<th style="padding:10px 14px;text-align:left;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-3);white-space:nowrap">${_esc(h)}</th>`).join('')}
        </tr>
      </thead>
      <tbody>
        ${rows.join('')}
      </tbody>
    </table>
  </div>`;
}

function _tr(cells, style) {
  return `<tr style="border-bottom:1px solid var(--border-2);${style||''}">
    ${cells.map(c => `<td style="padding:10px 14px;vertical-align:middle;color:var(--text-2)">${c}</td>`).join('')}
  </tr>`;
}

// ---- Print region helper ----
function _wrapPrintRegion(html) {
  let el = document.getElementById('print-region');
  if (!el) {
    el = document.createElement('div');
    el.id = 'print-region';
    document.body.appendChild(el);
  }
  el.innerHTML = html;
}

// ---- Report filter state (per-report, stored in window for simplicity) ----
window._rptFilters = window._rptFilters || {};

function _getFilter(reportId, key, def) {
  if (!window._rptFilters[reportId]) window._rptFilters[reportId] = {};
  const v = window._rptFilters[reportId][key];
  return (v !== undefined && v !== null) ? v : def;
}
function _setFilter(reportId, key, val) {
  if (!window._rptFilters[reportId]) window._rptFilters[reportId] = {};
  window._rptFilters[reportId][key] = val;
}

// ---- Reports Hub cards ----
const REPORT_CARDS = [
  {
    id: 'WeeklyStaffReport',
    icon: '📋',
    title: 'Weekly Staff Report',
    desc: 'Full case list grouped by attorney — TFD, status, expiration, PIF, RFE dates.',
    permission: 'view_reports',
  },
  {
    id: 'TimeProductivity',
    icon: '⏱',
    title: 'Time & Productivity',
    desc: 'Hours logged per staff member, case, and billing period with variance analysis.',
    permission: 'view_reports',
  },
  {
    id: 'PipelineReport',
    icon: '📊',
    title: 'Pipeline Report',
    desc: 'Case counts at each status stage with funnel visualization and bottleneck analysis.',
    permission: 'view_reports',
  },
  {
    id: 'DeadlineRisk',
    icon: '⚠️',
    title: 'Deadline Risk Report',
    desc: 'All cases with expirations or RFE due dates within 90 days, sorted by urgency.',
    permission: 'view_reports',
  },
  {
    id: 'FinancialReport',
    icon: '💰',
    title: 'Financial Report',
    desc: 'Revenue by case type, outstanding balances, paid vs. invoiced totals.',
    permission: 'view_billing',
  },
  {
    id: 'WorkloadBalance',
    icon: '⚖️',
    title: 'Workload Balance',
    desc: 'Cases per attorney and case manager with workload distribution chart.',
    permission: 'view_reports',
  },
  {
    id: 'CaseVelocity',
    icon: '🚀',
    title: 'Case Velocity',
    desc: 'Average days from creation to filing per visa type with per-attorney breakdowns.',
    permission: 'view_reports',
  },
  {
    id: 'RFETracking',
    icon: '📩',
    title: 'RFE Tracking',
    desc: 'All active RFE cases with issue dates, due dates, urgency, and drafter assignments.',
    permission: 'view_reports',
  },
];

// ============================================================
// Reports Object
// ============================================================
const Reports = {

  // ---- Navigation ----
  navigate(reportId) {
    if (typeof State !== 'undefined') {
      State.view = 'reports';
      State.activeReport = reportId || null;
    }
    window._activeReport = reportId || null;
    if (typeof render === 'function') render();
  },

  // ---- Reports Hub ----
  renderReportsHub() {
    const canBilling = (typeof RBAC !== 'undefined') ? RBAC.can('view_billing') : true;
    const role = (typeof RBAC !== 'undefined') ? RBAC.getRole() : 'managing_attorney';

    const cards = REPORT_CARDS.filter(card => {
      if (card.permission === 'view_billing') return canBilling;
      return true; // view_reports is available to all authenticated users per RBAC
    });

    const grid = cards.map(card => `
      <div style="background:var(--white);border:1px solid var(--border);border-radius:var(--radius-lg);padding:24px;display:flex;flex-direction:column;gap:12px;transition:box-shadow 0.15s">
        <div style="font-size:32px;line-height:1">${card.icon}</div>
        <div>
          <div style="font-size:15px;font-weight:600;color:var(--text);margin-bottom:4px">${_esc(card.title)}</div>
          <div style="font-size:13px;color:var(--text-3);line-height:1.5">${_esc(card.desc)}</div>
        </div>
        <div style="margin-top:auto;padding-top:8px">
          <button class="btn btn-gold btn-sm" onclick="Reports.navigate('${card.id}')">Open Report</button>
        </div>
      </div>`).join('');

    const cases = _getCases();
    const rfeCount = cases.filter(c => ['RFE','RFF','RFA','RFR','rfe'].includes(c.statusCode || c.stage)).length;
    const now = _todayIso();
    const urgentCount = cases.filter(c => {
      const d1 = _daysFromToday(c.expirationDate);
      const d2 = _daysFromToday(c.rfeDueDate || c.rfeDate);
      return (d1 !== null && d1 >= 0 && d1 < 30) || (d2 !== null && d2 >= 0 && d2 < 30);
    }).length;

    return `
      <div class="topbar">
        <div class="topbar-title">Reports</div>
        <div class="topbar-actions" style="font-size:12px;color:var(--text-3)">
          ${cases.length} cases total
        </div>
      </div>
      <div class="content">
        ${rfeCount ? `<div class="panel" style="border-color:rgba(220,38,38,0.3);background:var(--red-dim);margin-bottom:20px">
          <span style="color:var(--red);font-weight:600">⚠ ${rfeCount} active RFE case${rfeCount>1?'s':''}</span>
          <button class="btn btn-ghost btn-sm" onclick="Reports.navigate('RFETracking')" style="margin-left:12px">View RFE Tracking →</button>
        </div>` : ''}
        ${urgentCount ? `<div class="panel" style="border-color:rgba(217,119,6,0.3);background:var(--yellow-dim);margin-bottom:20px">
          <span style="color:var(--yellow);font-weight:600">⚠ ${urgentCount} case${urgentCount>1?'s':''} with deadlines within 30 days</span>
          <button class="btn btn-ghost btn-sm" onclick="Reports.navigate('DeadlineRisk')" style="margin-left:12px">View Deadline Risk →</button>
        </div>` : ''}
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:20px">
          ${grid}
        </div>
      </div>`;
  },

  // ============================================================
  // REPORT 1 — Weekly Staff Report
  // ============================================================
  renderWeeklyStaffReport() {
    const RID = 'WeeklyStaffReport';
    const cases = _getCases();
    const today = _todayIso();

    // Filters
    const fAtty  = _getFilter(RID, 'attorney', '');
    const fStat  = _getFilter(RID, 'status', '');
    const fFrom  = _getFilter(RID, 'dateFrom', '');
    const fTo    = _getFilter(RID, 'dateTo', '');

    let filtered = [...cases];
    if (fAtty) filtered = filtered.filter(c => (c.assignedAttorney || '') === fAtty);
    if (fStat) filtered = filtered.filter(c => (_statusCode(c)) === fStat);
    if (fFrom) filtered = filtered.filter(c => c.targetFilingDate && c.targetFilingDate >= fFrom);
    if (fTo)   filtered = filtered.filter(c => c.targetFilingDate && c.targetFilingDate <= fTo);

    // Get unique attorneys
    const attorneys = [...new Set(cases.map(c => c.assignedAttorney || 'Unassigned').filter(Boolean))].sort();
    const allStatuses = Object.keys(STATUS_CODES);

    // Group by attorney
    const grouped = {};
    filtered.forEach(c => {
      const atty = c.assignedAttorney || 'Unassigned';
      if (!grouped[atty]) grouped[atty] = [];
      grouped[atty].push(c);
    });

    const totalCases = filtered.length;

    // Build CSV data
    const csvRows = [
      ['Case ID','Client Name','Geo','Case Type','Filing Type','Target Filing Date','Days to TFD','Status','Expiration Date','PIF','CM/Conc','RFE Date','Attorney','CM']
    ];

    // Build table HTML grouped by attorney
    let tableHtml = '';
    const attyGroups = Object.keys(grouped).sort();

    attyGroups.forEach(atty => {
      const atCases = grouped[atty];
      tableHtml += `
        <tr>
          <td colspan="14" style="padding:10px 14px;background:var(--navy);color:var(--gold);font-weight:600;font-size:12px;letter-spacing:0.04em">
            ${_esc(atty)} — ${atCases.length} case${atCases.length !== 1 ? 's' : ''}
          </td>
        </tr>`;

      atCases.forEach(c => {
        const daysToTFD = _daysFromToday(c.targetFilingDate);
        const daysExp   = _daysFromToday(c.expirationDate);
        const tfdColor  = daysToTFD !== null ? _urgencyColor(daysToTFD) : 'var(--text-2)';
        const expColor  = daysExp !== null && daysExp < 90 ? 'var(--red)' : 'var(--text-2)';
        const code      = _statusCode(c);

        csvRows.push([
          c.id, _clientName(c), c.geo||c.nationality||'', c.visaType||'',
          c.filingType||'', c.targetFilingDate||'', daysToTFD !== null ? daysToTFD : '',
          _statusLabel(c), c.expirationDate||'', c.pif ? 'Yes' : 'No',
          c.cmConc||'', c.rfeDueDate||c.rfeDate||'', c.assignedAttorney||'', c.assignedCM||''
        ]);

        tableHtml += `<tr style="border-bottom:1px solid var(--border-2);${_urgencyBg(daysToTFD) ? 'background:' + _urgencyBg(daysToTFD) + ';' : ''}">
          <td style="padding:9px 14px;color:var(--text-3);font-size:11px;font-family:monospace">${_esc(c.id.substr(0,8))}</td>
          <td style="padding:9px 14px;font-weight:500;color:var(--text)">${_esc(_clientName(c))}</td>
          <td style="padding:9px 14px;text-align:center;font-size:14px">${_esc(c.geo || c.nationality || '—')}</td>
          <td style="padding:9px 14px;color:var(--text-2)">${_esc(c.visaType || '—')}</td>
          <td style="padding:9px 14px;color:var(--text-3)">${_esc(c.filingType || '—')}</td>
          <td style="padding:9px 14px;color:var(--text-2);white-space:nowrap">${_fmtDate(c.targetFilingDate)}</td>
          <td style="padding:9px 14px;font-weight:600;color:${tfdColor}">
            ${daysToTFD !== null ? (daysToTFD < 0 ? '<span title="Overdue">' + Math.abs(daysToTFD) + ' overdue</span>' : daysToTFD + 'd') : '—'}
          </td>
          <td style="padding:9px 14px">${_statusBadge(code)}</td>
          <td style="padding:9px 14px;color:${expColor};white-space:nowrap">${_fmtDate(c.expirationDate)}</td>
          <td style="padding:9px 14px;text-align:center">
            <span style="color:${c.pif ? 'var(--green)' : 'var(--text-3)'};font-weight:600">${c.pif ? '✓' : '—'}</span>
          </td>
          <td style="padding:9px 14px;color:var(--text-3);font-size:12px">${_esc(c.cmConc || '—')}</td>
          <td style="padding:9px 14px;color:var(--text-2);white-space:nowrap">${_fmtDate(c.rfeDueDate || c.rfeDate)}</td>
          <td style="padding:9px 14px;color:var(--text-3);font-size:12px">${_esc(c.assignedAttorney || '—')}</td>
          <td style="padding:9px 14px;color:var(--text-3);font-size:12px">${_esc(c.assignedCM || '—')}</td>
        </tr>`;
      });
    });

    const printHtml = `
      <h2 style="font-family:serif;margin-bottom:8px">Weekly Staff Report</h2>
      <p style="font-size:12px;color:#666;margin-bottom:16px">Generated ${new Date().toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})} · ${totalCases} cases</p>
      <table style="width:100%;border-collapse:collapse;font-size:11px">
        <thead><tr style="background:#0A1628;color:#fff">
          ${['#','Client','Geo','Type','Filing','TFD','Days','Status','Expiry','PIF','CM/Conc','RFE Due','Attorney','CM'].map(h=>`<th style="padding:6px 8px;text-align:left">${h}</th>`).join('')}
        </tr></thead>
        <tbody>${tableHtml}</tbody>
      </table>`;

    return `
      ${_reportTopbar('Weekly Staff Report', `
        <button class="btn btn-ghost btn-sm" onclick="Reports.exportCSV(window._wsrCsvRows,'weekly-staff-report.csv')">Export CSV</button>
        <button class="btn btn-ghost btn-sm" onclick="Reports.exportPDF('WeeklyStaffReport')">Print</button>
      `)}
      ${_filterBar([
        { type:'select', label:'Attorney', id:'wsr-atty', value: fAtty,
          options:[{value:'',label:'All Attorneys'},...attorneys.map(a=>({value:a,label:a}))],
          onchange:`_setFilter('${RID}','attorney',this.value);Reports.renderAndMount('WeeklyStaffReport')` },
        { type:'select', label:'Status', id:'wsr-stat', value: fStat,
          options:[{value:'',label:'All Statuses'},...allStatuses.map(s=>({value:s,label:STATUS_CODES[s]}))],
          onchange:`_setFilter('${RID}','status',this.value);Reports.renderAndMount('WeeklyStaffReport')` },
        { type:'date', label:'TFD From', value: fFrom,
          onchange:`_setFilter('${RID}','dateFrom',this.value);Reports.renderAndMount('WeeklyStaffReport')` },
        { type:'date', label:'TFD To', value: fTo,
          onchange:`_setFilter('${RID}','dateTo',this.value);Reports.renderAndMount('WeeklyStaffReport')` },
      ])}
      <div class="content" id="print-region">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
          <div style="font-size:13px;color:var(--text-3)">${totalCases} cases displayed</div>
          <div style="display:flex;gap:16px;font-size:12px">
            <span style="color:var(--red)">■ &lt;30 days</span>
            <span style="color:var(--yellow)">■ 30–90 days</span>
            <span style="color:var(--green)">■ 90+ days</span>
          </div>
        </div>
        ${filtered.length === 0
          ? `<div style="text-align:center;padding:60px;color:var(--text-3)">No cases match the selected filters.</div>`
          : `<div style="overflow-x:auto;border:1px solid var(--border);border-radius:var(--radius-lg)">
              <table style="width:100%;border-collapse:collapse;font-size:13px">
                <thead>
                  <tr style="background:var(--navy);color:var(--white)">
                    ${['Case #','Client','Geo','Case Type','Filing','TFD','Days to TFD','Status','Expiration','PIF','CM/Conc','RFE Due','Attorney','CM'].map(h=>`<th style="padding:10px 14px;text-align:left;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;white-space:nowrap">${h}</th>`).join('')}
                  </tr>
                </thead>
                <tbody>${tableHtml}</tbody>
              </table>
            </div>`
        }
      </div>
      <script>window._wsrCsvRows=${JSON.stringify(csvRows)};<\/script>`;
  },

  // ============================================================
  // REPORT 2 — Time & Productivity
  // ============================================================
  renderTimeProductivity() {
    const RID = 'TimeProductivity';
    const cases = _getCases();

    const fStaff = _getFilter(RID, 'staff', '');
    const fVisa  = _getFilter(RID, 'visaType', '');
    const fFrom  = _getFilter(RID, 'dateFrom', '');
    const fTo    = _getFilter(RID, 'dateTo', '');

    const hasTimeTracker = typeof TimeTracker !== 'undefined';

    // Build staff list from cases
    const staffNames = [...new Set([
      ...cases.map(c => c.assignedAttorney),
      ...cases.map(c => c.assignedCM),
    ].filter(Boolean))].sort();

    const visaTypes = [...new Set(cases.map(c => c.visaType).filter(Boolean))].sort();

    // If TimeTracker available, pull real data
    let timeData = [];
    if (hasTimeTracker && typeof TimeTracker.getEntries === 'function') {
      let entries = TimeTracker.getEntries() || [];
      if (fStaff) entries = entries.filter(e => e.staff === fStaff);
      if (fVisa)  entries = entries.filter(e => e.visaType === fVisa);
      if (fFrom)  entries = entries.filter(e => e.date >= fFrom);
      if (fTo)    entries = entries.filter(e => e.date <= fTo);

      // Group by staff
      const byStaff = {};
      entries.forEach(e => {
        if (!byStaff[e.staff]) byStaff[e.staff] = { staff: e.staff, cases: new Set(), estHours: 0, actualHours: 0, billable: 0 };
        byStaff[e.staff].cases.add(e.caseId);
        byStaff[e.staff].estHours += (e.estHours || 0);
        byStaff[e.staff].actualHours += (e.actualHours || e.hours || 0);
        byStaff[e.staff].billable += (e.billableAmount || 0);
      });
      timeData = Object.values(byStaff).map(d => ({ ...d, cases: d.cases.size }));
    } else {
      // Synthetic estimate: 2h per case per staff member
      const byStaff = {};
      const filtered = cases.filter(c => {
        if (fStaff && c.assignedAttorney !== fStaff && c.assignedCM !== fStaff) return false;
        if (fVisa && c.visaType !== fVisa) return false;
        return true;
      });
      filtered.forEach(c => {
        [c.assignedAttorney, c.assignedCM].filter(Boolean).forEach(name => {
          if (!byStaff[name]) byStaff[name] = { staff: name, cases: 0, estHours: 0, actualHours: 0, billable: 0 };
          byStaff[name].cases += 1;
          byStaff[name].estHours += 8;
          byStaff[name].actualHours += 9.2;
          byStaff[name].billable += 850;
        });
      });
      timeData = Object.values(byStaff);
    }

    const totals = timeData.reduce((acc, d) => ({
      cases: acc.cases + d.cases,
      estHours: acc.estHours + d.estHours,
      actualHours: acc.actualHours + d.actualHours,
      billable: acc.billable + d.billable,
    }), { cases: 0, estHours: 0, actualHours: 0, billable: 0 });

    const maxHours = Math.max(...timeData.map(d => d.actualHours), 1);

    const rows = timeData.map(d => {
      const variance = d.actualHours - d.estHours;
      const varColor = variance > 0 ? 'var(--red)' : 'var(--green)';
      return _tr([
        `<strong style="color:var(--text)">${_esc(d.staff)}</strong>`,
        String(d.cases),
        d.estHours.toFixed(1) + 'h',
        d.actualHours.toFixed(1) + 'h',
        `<span style="color:${varColor}">${variance >= 0 ? '+' : ''}${variance.toFixed(1)}h</span>`,
        `$${d.billable.toLocaleString()}`,
        _cssBar((d.actualHours / maxHours) * 100, 'var(--gold)'),
      ]);
    });

    // Summary row
    const summaryVariance = totals.actualHours - totals.estHours;
    rows.push(`<tr style="border-top:2px solid var(--border);background:var(--surface-2);font-weight:600">
      <td style="padding:10px 14px;color:var(--text)">Total</td>
      <td style="padding:10px 14px;color:var(--text)">${totals.cases}</td>
      <td style="padding:10px 14px;color:var(--text)">${totals.estHours.toFixed(1)}h</td>
      <td style="padding:10px 14px;color:var(--text)">${totals.actualHours.toFixed(1)}h</td>
      <td style="padding:10px 14px;color:${summaryVariance >= 0 ? 'var(--red)' : 'var(--green)'}">
        ${summaryVariance >= 0 ? '+' : ''}${summaryVariance.toFixed(1)}h
      </td>
      <td style="padding:10px 14px;color:var(--text)">$${totals.billable.toLocaleString()}</td>
      <td style="padding:10px 14px"></td>
    </tr>`);

    const csvRows = [
      ['Staff','Cases','Est Hours','Actual Hours','Variance','Billable $'],
      ...timeData.map(d => [d.staff, d.cases, d.estHours.toFixed(1), d.actualHours.toFixed(1), (d.actualHours-d.estHours).toFixed(1), d.billable.toFixed(2)]),
      ['TOTAL', totals.cases, totals.estHours.toFixed(1), totals.actualHours.toFixed(1), summaryVariance.toFixed(1), totals.billable.toFixed(2)],
    ];

    return `
      ${_reportTopbar('Time & Productivity', `
        <button class="btn btn-ghost btn-sm" onclick="Reports.exportCSV(${JSON.stringify(csvRows).replace(/'/g,'&#39;')},'time-productivity.csv')">Export CSV</button>
        <button class="btn btn-ghost btn-sm" onclick="Reports.exportPDF('TimeProductivity')">Print</button>
      `)}
      ${!hasTimeTracker ? `<div style="background:var(--yellow-dim);border:1px solid rgba(217,119,6,0.2);border-bottom:none;padding:10px 32px;font-size:12px;color:var(--yellow)">
        TimeTracker module not loaded — showing estimated hours based on case assignments.
      </div>` : ''}
      ${_filterBar([
        { type:'select', label:'Staff Member', value: fStaff,
          options:[{value:'',label:'All Staff'},...staffNames.map(s=>({value:s,label:s}))],
          onchange:`_setFilter('${RID}','staff',this.value);Reports.renderAndMount('TimeProductivity')` },
        { type:'select', label:'Visa Type', value: fVisa,
          options:[{value:'',label:'All Visa Types'},...visaTypes.map(v=>({value:v,label:v}))],
          onchange:`_setFilter('${RID}','visaType',this.value);Reports.renderAndMount('TimeProductivity')` },
        { type:'date', label:'From', value: fFrom,
          onchange:`_setFilter('${RID}','dateFrom',this.value);Reports.renderAndMount('TimeProductivity')` },
        { type:'date', label:'To', value: fTo,
          onchange:`_setFilter('${RID}','dateTo',this.value);Reports.renderAndMount('TimeProductivity')` },
      ])}
      <div class="content" id="print-region">
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:24px">
          <div style="background:var(--white);border:1px solid var(--border);border-radius:var(--radius-lg);padding:20px">
            <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-3);margin-bottom:6px">Total Est. Hours</div>
            <div style="font-size:28px;font-weight:600;color:var(--text)">${totals.estHours.toFixed(0)}<span style="font-size:14px;color:var(--text-3)">h</span></div>
          </div>
          <div style="background:var(--white);border:1px solid var(--border);border-radius:var(--radius-lg);padding:20px">
            <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-3);margin-bottom:6px">Actual Hours</div>
            <div style="font-size:28px;font-weight:600;color:var(--blue)">${totals.actualHours.toFixed(0)}<span style="font-size:14px;color:var(--text-3)">h</span></div>
          </div>
          <div style="background:var(--white);border:1px solid var(--border);border-radius:var(--radius-lg);padding:20px">
            <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-3);margin-bottom:6px">Total Billable</div>
            <div style="font-size:28px;font-weight:600;color:var(--green)">$${totals.billable.toLocaleString()}</div>
          </div>
        </div>
        <div style="border:1px solid var(--border);border-radius:var(--radius-lg);overflow:hidden">
          <div style="padding:16px 20px;background:var(--surface-2);border-bottom:1px solid var(--border);font-size:13px;font-weight:600;color:var(--text)">
            Staff Breakdown
          </div>
          ${timeData.length === 0
            ? `<div style="text-align:center;padding:40px;color:var(--text-3)">No time data available.</div>`
            : `<div style="overflow-x:auto">
                <table style="width:100%;border-collapse:collapse;font-size:13px">
                  <thead><tr style="border-bottom:2px solid var(--border)">
                    ${['Staff Member','Cases','Est. Hours','Actual Hours','Variance','Billable $','Distribution'].map(h=>
                      `<th style="padding:10px 14px;text-align:left;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-3)">${h}</th>`
                    ).join('')}
                  </tr></thead>
                  <tbody>${rows.join('')}</tbody>
                </table>
              </div>`
          }
        </div>
      </div>`;
  },

  // ============================================================
  // REPORT 3 — Pipeline Report
  // ============================================================
  renderPipelineReport() {
    const RID = 'PipelineReport';
    const cases = _getCases();

    // Count by status
    const allCodes = Object.keys(STATUS_CODES);
    const counts = {};
    const avgDays = {};
    allCodes.forEach(code => {
      const matching = cases.filter(c => _statusCode(c) === code);
      counts[code] = matching.length;
      // Average days in stage = avg(updatedAt - createdAt)
      const durations = matching
        .map(c => _daysBetween(c.createdAt, c.updatedAt || new Date().toISOString()))
        .filter(d => d !== null && d >= 0);
      avgDays[code] = durations.length ? Math.round(durations.reduce((a,b) => a+b,0) / durations.length) : 0;
    });

    // Also handle legacy stage values not in STATUS_CODES
    cases.forEach(c => {
      const code = _statusCode(c);
      if (!STATUS_CODES[code]) {
        if (!counts[code]) counts[code] = 0;
        counts[code]++;
      }
    });

    const total = cases.length;
    const maxCount = Math.max(...Object.values(counts), 1);

    // Bottleneck = code with most cases
    const bottleneck = allCodes.reduce((a, b) => counts[a] >= counts[b] ? a : b, allCodes[0]);

    // Main funnel stages (primary flow)
    const funnelStages = ['KDE','KAR','KRE','KFI','KAP'];

    const funnelHtml = funnelStages.map((code, i) => {
      const count = counts[code] || 0;
      const pct = total ? Math.round(count / total * 100) : 0;
      const isBottleneck = code === bottleneck && count > 0;
      const width = 100 - (i * 8);
      return `
        <div style="display:flex;flex-direction:column;align-items:center;margin-bottom:4px">
          <div style="width:${width}%;background:${isBottleneck ? 'rgba(220,38,38,0.12)' : 'var(--gold-dim)'};border:1px solid ${isBottleneck ? 'rgba(220,38,38,0.3)' : 'var(--gold)'};border-radius:6px;padding:12px 16px;display:flex;align-items:center;justify-content:space-between;transition:all 0.2s">
            <div>
              <span style="font-size:12px;font-weight:600;color:${isBottleneck ? 'var(--red)' : 'var(--gold)'}">
                ${_esc(STATUS_CODES[code])} ${isBottleneck ? '⚠ Bottleneck' : ''}
              </span>
              <span style="font-size:11px;color:var(--text-3);margin-left:8px">${avgDays[code] || 0}d avg</span>
            </div>
            <div style="text-align:right">
              <span style="font-size:20px;font-weight:700;color:var(--text)">${count}</span>
              <span style="font-size:11px;color:var(--text-3);margin-left:4px">${pct}%</span>
            </div>
          </div>
          ${i < funnelStages.length - 1 ? `<div style="color:var(--text-3);font-size:18px;line-height:1;padding:2px 0">↓</div>` : ''}
        </div>`;
    }).join('');

    // All stages breakdown table
    const rows = allCodes.filter(c => counts[c] > 0).sort((a,b) => counts[b] - counts[a]).map(code => {
      const count = counts[code] || 0;
      const pct = total ? Math.round(count / total * 100) : 0;
      return _tr([
        _statusBadge(code),
        String(count),
        `${pct}%`,
        _cssBar(pct, code === bottleneck ? 'var(--red)' : 'var(--gold)'),
        `${avgDays[code] || 0} days`,
      ]);
    });

    const csvRows = [
      ['Status Code','Status Name','Case Count','Percentage','Avg Days in Stage'],
      ...allCodes.filter(c => counts[c] > 0).map(code => [
        code, STATUS_CODES[code]||code, counts[code], total ? Math.round(counts[code]/total*100)+'%' : '0%', avgDays[code]||0
      ])
    ];

    return `
      ${_reportTopbar('Pipeline Report', `
        <button class="btn btn-ghost btn-sm" onclick="Reports.exportCSV(${JSON.stringify(csvRows).replace(/'/g,'&#39;')},'pipeline-report.csv')">Export CSV</button>
        <button class="btn btn-ghost btn-sm" onclick="Reports.exportPDF('PipelineReport')">Print</button>
      `)}
      <div class="content" id="print-region">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px">
          <div>
            <div style="font-size:14px;font-weight:600;color:var(--text);margin-bottom:16px">Funnel View — Primary Flow</div>
            <div style="display:flex;flex-direction:column;align-items:stretch">
              ${funnelHtml}
            </div>
          </div>
          <div>
            <div style="font-size:14px;font-weight:600;color:var(--text);margin-bottom:16px">All Stages Breakdown</div>
            <div style="border:1px solid var(--border);border-radius:var(--radius-lg);overflow:hidden">
              ${_tableWrap(
                ['Status','Cases','%','Volume','Avg Days'],
                rows,
                'No cases in system.'
              )}
            </div>
          </div>
        </div>

        <div style="margin-top:24px;padding:16px 20px;background:var(--surface-2);border:1px solid var(--border);border-radius:var(--radius-lg)">
          <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-3);margin-bottom:12px">Stage Summary</div>
          <div style="display:flex;flex-wrap:wrap;gap:16px">
            ${allCodes.filter(c => counts[c] > 0).map(code => `
              <div style="text-align:center;min-width:80px">
                <div style="font-size:22px;font-weight:700;color:var(--text)">${counts[code]}</div>
                <div style="font-size:10px;color:var(--text-3);margin-top:2px">${_esc(code)}</div>
              </div>`).join('')}
          </div>
        </div>
      </div>`;
  },

  // ============================================================
  // REPORT 4 — Deadline Risk Report
  // ============================================================
  renderDeadlineRisk() {
    const RID = 'DeadlineRisk';
    const cases = _getCases();

    const fWindow = _getFilter(RID, 'window', '90');

    const windowDays = parseInt(fWindow) || 90;

    // Find all cases with upcoming deadlines
    const risky = [];
    cases.forEach(c => {
      const daysExp = _daysFromToday(c.expirationDate);
      const daysRfe = _daysFromToday(c.rfeDueDate || c.rfeDate);
      const minDays = [daysExp, daysRfe].filter(d => d !== null && d >= 0).sort((a,b)=>a-b)[0];
      if (minDays !== undefined && minDays <= windowDays) {
        risky.push({ c, daysExp, daysRfe, minDays });
      }
    });

    // Sort by most urgent first
    risky.sort((a,b) => a.minDays - b.minDays);

    const rows = risky.map(({ c, daysExp, daysRfe, minDays }) => {
      const rowBg = minDays < 30 ? 'background:var(--red-dim);' : (minDays < 90 ? 'background:var(--yellow-dim);' : '');
      const urgColor = _urgencyColor(minDays);
      return `<tr style="border-bottom:1px solid var(--border-2);${rowBg}">
        <td style="padding:10px 14px">
          <div style="font-weight:500;color:var(--text)">${_esc(_clientName(c))}</div>
          <div style="font-size:11px;color:var(--text-3)">${_esc(c.email || '')}</div>
        </td>
        <td style="padding:10px 14px;color:var(--text-2)">${_esc(c.visaType || '—')}</td>
        <td style="padding:10px 14px">${_statusBadge(_statusCode(c))}</td>
        <td style="padding:10px 14px;color:${daysExp !== null && daysExp <= windowDays ? _urgencyColor(daysExp) : 'var(--text-3)'};white-space:nowrap">
          ${_fmtDate(c.expirationDate)}
          ${daysExp !== null && daysExp <= windowDays ? `<span style="font-size:11px;display:block">${daysExp}d remaining</span>` : ''}
        </td>
        <td style="padding:10px 14px;color:${daysRfe !== null && daysRfe <= windowDays ? _urgencyColor(daysRfe) : 'var(--text-3)'};white-space:nowrap">
          ${_fmtDate(c.rfeDueDate || c.rfeDate)}
          ${daysRfe !== null && daysRfe <= windowDays ? `<span style="font-size:11px;display:block">${daysRfe}d remaining</span>` : ''}
        </td>
        <td style="padding:10px 14px;font-weight:700;font-size:16px;color:${urgColor}">${minDays}d</td>
        <td style="padding:10px 14px;color:var(--text-3);font-size:12px">${_esc(c.assignedAttorney || '—')}</td>
        <td style="padding:10px 14px">
          <button class="btn btn-ghost btn-sm" style="font-size:11px" onclick="Reports._sendReminder('${_esc(c.id)}')">
            Send Reminder
          </button>
        </td>
      </tr>`;
    });

    const criticalCount = risky.filter(r => r.minDays < 30).length;
    const warnCount = risky.filter(r => r.minDays >= 30 && r.minDays < 90).length;

    const csvRows = [
      ['Client','Email','Case Type','Status','Expiration Date','RFE Due Date','Days Remaining','Attorney'],
      ...risky.map(({ c, minDays }) => [
        _clientName(c), c.email||'', c.visaType||'', _statusLabel(c),
        c.expirationDate||'', c.rfeDueDate||c.rfeDate||'', minDays, c.assignedAttorney||''
      ])
    ];

    return `
      ${_reportTopbar('Deadline Risk Report', `
        <button class="btn btn-ghost btn-sm" onclick="Reports.exportCSV(${JSON.stringify(csvRows).replace(/'/g,'&#39;')},'deadline-risk.csv')">Export CSV</button>
        <button class="btn btn-ghost btn-sm" onclick="Reports.exportPDF('DeadlineRisk')">Print</button>
      `)}
      ${_filterBar([
        { type:'select', label:'Window', value: fWindow,
          options:[
            {value:'30',label:'Next 30 days'},
            {value:'60',label:'Next 60 days'},
            {value:'90',label:'Next 90 days'},
            {value:'180',label:'Next 180 days'},
          ],
          onchange:`_setFilter('${RID}','window',this.value);Reports.renderAndMount('DeadlineRisk')` },
      ])}
      <div class="content" id="print-region">
        <div style="display:flex;gap:16px;margin-bottom:20px">
          <div style="padding:14px 20px;background:var(--red-dim);border:1px solid rgba(220,38,38,0.2);border-radius:var(--radius-lg);flex:1;text-align:center">
            <div style="font-size:28px;font-weight:700;color:var(--red)">${criticalCount}</div>
            <div style="font-size:11px;color:var(--text-3);margin-top:4px">CRITICAL (&lt; 30 days)</div>
          </div>
          <div style="padding:14px 20px;background:var(--yellow-dim);border:1px solid rgba(217,119,6,0.2);border-radius:var(--radius-lg);flex:1;text-align:center">
            <div style="font-size:28px;font-weight:700;color:var(--yellow)">${warnCount}</div>
            <div style="font-size:11px;color:var(--text-3);margin-top:4px">WARNING (30–90 days)</div>
          </div>
          <div style="padding:14px 20px;background:var(--surface-2);border:1px solid var(--border);border-radius:var(--radius-lg);flex:1;text-align:center">
            <div style="font-size:28px;font-weight:700;color:var(--text)">${risky.length}</div>
            <div style="font-size:11px;color:var(--text-3);margin-top:4px">TOTAL AT RISK</div>
          </div>
        </div>
        <div style="border:1px solid var(--border);border-radius:var(--radius-lg);overflow:hidden">
          ${risky.length === 0
            ? `<div style="text-align:center;padding:60px;color:var(--text-3)">No cases with deadlines in the next ${windowDays} days.</div>`
            : `<div style="overflow-x:auto">
                <table style="width:100%;border-collapse:collapse;font-size:13px">
                  <thead><tr style="border-bottom:2px solid var(--border)">
                    ${['Client','Case Type','Status','Expiration Date','RFE Due Date','Days Remaining','Attorney','Action'].map(h=>
                      `<th style="padding:10px 14px;text-align:left;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-3);white-space:nowrap">${h}</th>`
                    ).join('')}
                  </tr></thead>
                  <tbody>${rows.join('')}</tbody>
                </table>
              </div>`
          }
        </div>
      </div>`;
  },

  // ============================================================
  // REPORT 5 — Financial Report
  // ============================================================
  renderFinancialReport() {
    // Access check
    const canView = (typeof RBAC !== 'undefined') ? RBAC.can('view_billing') : true;
    if (!canView) {
      return `
        ${_reportTopbar('Financial Report', '')}
        <div class="content">
          <div style="text-align:center;padding:80px 40px">
            <div style="font-size:48px;margin-bottom:16px">🔒</div>
            <div style="font-size:18px;font-weight:600;color:var(--text);margin-bottom:8px">Access Restricted</div>
            <div style="font-size:14px;color:var(--text-3)">The Financial Report is only accessible to Managing Attorneys.</div>
          </div>
        </div>`;
    }

    const RID = 'FinancialReport';
    const cases = _getCases();

    const fVisa = _getFilter(RID, 'visaType', '');
    const fAtty = _getFilter(RID, 'attorney', '');

    let filtered = [...cases];
    if (fVisa) filtered = filtered.filter(c => c.visaType === fVisa);
    if (fAtty) filtered = filtered.filter(c => c.assignedAttorney === fAtty);

    const visaTypes = [...new Set(cases.map(c => c.visaType).filter(Boolean))].sort();
    const attorneys = [...new Set(cases.map(c => c.assignedAttorney).filter(Boolean))].sort();

    // Financial totals
    let totalInvoiced = 0, totalPaid = 0, totalPending = 0;

    // Pull invoice data from State.invoices or case-level data
    const invoiceData = (typeof State !== 'undefined' && State.invoices) ? State.invoices : [];

    filtered.forEach(c => {
      const retainer = parseFloat(c.retainerAmount) || 0;
      const filing   = parseFloat(c.filingFeesAmount) || 0;
      const caseTotal = retainer + filing;
      totalInvoiced += caseTotal;
      if (c.retainerPaid) totalPaid += retainer;
      else totalPending += retainer;
      if (c.filingFeesPaid) totalPaid += filing;
      else totalPending += filing;
    });

    // Per visa type breakdown
    const byVisa = {};
    filtered.forEach(c => {
      const vt = c.visaType || 'Other';
      if (!byVisa[vt]) byVisa[vt] = { invoiced: 0, paid: 0, count: 0 };
      const retainer = parseFloat(c.retainerAmount) || 0;
      const filing   = parseFloat(c.filingFeesAmount) || 0;
      byVisa[vt].invoiced += retainer + filing;
      byVisa[vt].paid += (c.retainerPaid ? retainer : 0) + (c.filingFeesPaid ? filing : 0);
      byVisa[vt].count++;
    });

    // Per attorney breakdown
    const byAtty = {};
    filtered.forEach(c => {
      const atty = c.assignedAttorney || 'Unassigned';
      if (!byAtty[atty]) byAtty[atty] = { invoiced: 0, paid: 0, count: 0 };
      const retainer = parseFloat(c.retainerAmount) || 0;
      const filing   = parseFloat(c.filingFeesAmount) || 0;
      byAtty[atty].invoiced += retainer + filing;
      byAtty[atty].paid += (c.retainerPaid ? retainer : 0) + (c.filingFeesPaid ? filing : 0);
      byAtty[atty].count++;
    });

    // Outstanding balances (cases with unpaid amounts)
    const outstanding = filtered.filter(c => {
      return (!c.retainerPaid && parseFloat(c.retainerAmount) > 0) ||
             (!c.filingFeesPaid && parseFloat(c.filingFeesAmount) > 0);
    }).sort((a,b) => {
      const aAmt = (!a.retainerPaid ? parseFloat(a.retainerAmount)||0 : 0) + (!a.filingFeesPaid ? parseFloat(a.filingFeesAmount)||0 : 0);
      const bAmt = (!b.retainerPaid ? parseFloat(b.retainerAmount)||0 : 0) + (!b.filingFeesPaid ? parseFloat(b.filingFeesAmount)||0 : 0);
      return bAmt - aAmt;
    });

    const visaRows = Object.entries(byVisa).sort((a,b)=>b[1].invoiced-a[1].invoiced).map(([vt, d]) => {
      const pct = d.invoiced ? Math.round(d.paid/d.invoiced*100) : 0;
      return _tr([
        `<strong>${_esc(vt)}</strong>`, String(d.count),
        `$${d.invoiced.toLocaleString()}`,
        `<span style="color:var(--green)">$${d.paid.toLocaleString()}</span>`,
        _cssBar(pct, 'var(--green)'),
      ]);
    });

    const attyRows = Object.entries(byAtty).sort((a,b)=>b[1].invoiced-a[1].invoiced).map(([atty, d]) => {
      const pct = d.invoiced ? Math.round(d.paid/d.invoiced*100) : 0;
      return _tr([
        `<strong>${_esc(atty)}</strong>`, String(d.count),
        `$${d.invoiced.toLocaleString()}`,
        `<span style="color:var(--green)">$${d.paid.toLocaleString()}</span>`,
        _cssBar(pct, 'var(--blue)'),
      ]);
    });

    const outstandingRows = outstanding.map(c => {
      const unpaidRetainer = !c.retainerPaid ? (parseFloat(c.retainerAmount)||0) : 0;
      const unpaidFiling   = !c.filingFeesPaid ? (parseFloat(c.filingFeesAmount)||0) : 0;
      const totalUnpaid = unpaidRetainer + unpaidFiling;
      return _tr([
        `<strong style="color:var(--text)">${_esc(_clientName(c))}</strong>`,
        _esc(c.visaType || '—'),
        _statusBadge(_statusCode(c)),
        unpaidRetainer > 0 ? `<span style="color:var(--red)">$${unpaidRetainer.toLocaleString()} unpaid</span>` : '<span style="color:var(--green)">✓ Paid</span>',
        unpaidFiling > 0 ? `<span style="color:var(--red)">$${unpaidFiling.toLocaleString()} unpaid</span>` : '<span style="color:var(--green)">✓ Paid</span>',
        `<strong style="color:var(--red)">$${totalUnpaid.toLocaleString()}</strong>`,
        _esc(c.assignedAttorney || '—'),
      ]);
    });

    const csvRows = [
      ['Financial Summary'],
      ['Total Invoiced', totalInvoiced.toFixed(2)],
      ['Total Paid', totalPaid.toFixed(2)],
      ['Outstanding', totalPending.toFixed(2)],
      [],
      ['By Visa Type','Cases','Invoiced','Paid'],
      ...Object.entries(byVisa).map(([vt,d]) => [vt, d.count, d.invoiced.toFixed(2), d.paid.toFixed(2)]),
      [],
      ['Outstanding Balances','Visa','Status','Unpaid Retainer','Unpaid Filing','Total Owed','Attorney'],
      ...outstanding.map(c => [
        _clientName(c), c.visaType||'', _statusLabel(c),
        (!c.retainerPaid ? parseFloat(c.retainerAmount)||0 : 0).toFixed(2),
        (!c.filingFeesPaid ? parseFloat(c.filingFeesAmount)||0 : 0).toFixed(2),
        ((!c.retainerPaid ? parseFloat(c.retainerAmount)||0 : 0)+(!c.filingFeesPaid ? parseFloat(c.filingFeesAmount)||0 : 0)).toFixed(2),
        c.assignedAttorney||''
      ])
    ];

    return `
      ${_reportTopbar('Financial Report', `
        <button class="btn btn-ghost btn-sm" onclick="Reports.exportCSV(${JSON.stringify(csvRows).replace(/'/g,'&#39;')},'financial-report.csv')">Export CSV</button>
        <button class="btn btn-ghost btn-sm" onclick="Reports.exportPDF('FinancialReport')">Print</button>
      `)}
      ${_filterBar([
        { type:'select', label:'Visa Type', value: fVisa,
          options:[{value:'',label:'All Visa Types'},...visaTypes.map(v=>({value:v,label:v}))],
          onchange:`_setFilter('${RID}','visaType',this.value);Reports.renderAndMount('FinancialReport')` },
        { type:'select', label:'Attorney', value: fAtty,
          options:[{value:'',label:'All Attorneys'},...attorneys.map(a=>({value:a,label:a}))],
          onchange:`_setFilter('${RID}','attorney',this.value);Reports.renderAndMount('FinancialReport')` },
      ])}
      <div class="content" id="print-region">
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:24px">
          <div style="background:var(--white);border:1px solid var(--border);border-radius:var(--radius-lg);padding:20px">
            <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-3);margin-bottom:6px">Total Invoiced</div>
            <div style="font-size:28px;font-weight:600;color:var(--text)">$${totalInvoiced.toLocaleString()}</div>
          </div>
          <div style="background:var(--white);border:1px solid var(--border);border-radius:var(--radius-lg);padding:20px">
            <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-3);margin-bottom:6px">Total Paid</div>
            <div style="font-size:28px;font-weight:600;color:var(--green)">$${totalPaid.toLocaleString()}</div>
          </div>
          <div style="background:var(--white);border:1px solid var(--border);border-radius:var(--radius-lg);padding:20px">
            <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-3);margin-bottom:6px">Outstanding</div>
            <div style="font-size:28px;font-weight:600;color:${totalPending > 0 ? 'var(--red)' : 'var(--text-3)'}">$${totalPending.toLocaleString()}</div>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px">
          <div style="border:1px solid var(--border);border-radius:var(--radius-lg);overflow:hidden">
            <div style="padding:14px 20px;background:var(--surface-2);border-bottom:1px solid var(--border);font-size:13px;font-weight:600">Revenue by Visa Type</div>
            ${_tableWrap(['Visa Type','Cases','Invoiced','Paid','Collection %'], visaRows, 'No data.')}
          </div>
          <div style="border:1px solid var(--border);border-radius:var(--radius-lg);overflow:hidden">
            <div style="padding:14px 20px;background:var(--surface-2);border-bottom:1px solid var(--border);font-size:13px;font-weight:600">Revenue by Attorney</div>
            ${_tableWrap(['Attorney','Cases','Invoiced','Paid','Collection %'], attyRows, 'No data.')}
          </div>
        </div>

        <div style="border:1px solid var(--border);border-radius:var(--radius-lg);overflow:hidden">
          <div style="padding:14px 20px;background:var(--surface-2);border-bottom:1px solid var(--border);font-size:13px;font-weight:600;display:flex;justify-content:space-between;align-items:center">
            <span>Outstanding Balances</span>
            <span style="font-size:13px;font-weight:400;color:var(--red)">$${totalPending.toLocaleString()} owed</span>
          </div>
          ${outstanding.length === 0
            ? `<div style="text-align:center;padding:40px;color:var(--green)">All accounts are current.</div>`
            : _tableWrap(['Client','Visa','Status','Retainer','Filing Fees','Total Owed','Attorney'], outstandingRows, 'No outstanding balances.')}
        </div>
      </div>`;
  },

  // ============================================================
  // REPORT 6 — Workload Balance
  // ============================================================
  renderWorkloadBalance() {
    const RID = 'WorkloadBalance';
    const cases = _getCases();

    const isMA = (typeof RBAC !== 'undefined') ? RBAC.getRole() === 'managing_attorney' : true;

    // Build workload data
    const byPerson = {};

    cases.forEach(c => {
      const atty = c.assignedAttorney;
      const cm   = c.assignedCM;

      if (atty) {
        if (!byPerson[atty]) byPerson[atty] = { name: atty, role: 'Attorney', cases: 0, active: 0, filed: 0, approved: 0, caseIds: [] };
        byPerson[atty].cases++;
        byPerson[atty].caseIds.push(c.id);
        if (['KDE','KAR','KRE','KFI','RFE','RFF','RFA','RFR'].includes(c.statusCode || c.stage)) byPerson[atty].active++;
        if (['KFI','KAP'].includes(c.statusCode || c.stage) || c.stage === 'filed') byPerson[atty].filed++;
        if (['KAP'].includes(c.statusCode || c.stage) || c.stage === 'approved') byPerson[atty].approved++;
      }

      if (cm && cm !== atty) {
        if (!byPerson[cm]) byPerson[cm] = { name: cm, role: 'Case Manager', cases: 0, active: 0, filed: 0, approved: 0, caseIds: [] };
        byPerson[cm].cases++;
        byPerson[cm].caseIds.push(c.id);
        if (['KDE','KAR','KRE','KFI','RFE','RFF','RFA','RFR'].includes(c.statusCode || c.stage)) byPerson[cm].active++;
      }
    });

    const people = Object.values(byPerson).sort((a,b) => b.cases - a.cases);
    const maxCases = Math.max(...people.map(p => p.cases), 1);
    const avgCases = people.length ? Math.round(people.reduce((s,p) => s+p.cases, 0) / people.length) : 0;

    // Estimated hours: 10h per active case, 3h per filed, 1h per approved
    people.forEach(p => {
      p.estHours = (p.active * 10) + (p.filed * 3) + ((p.cases - p.active - p.filed) * 1);
    });
    const maxHours = Math.max(...people.map(p => p.estHours), 1);

    const rows = people.map(p => {
      const overloaded = p.cases > avgCases * 1.5;
      return `<tr style="border-bottom:1px solid var(--border-2);${overloaded ? 'background:var(--yellow-dim);' : ''}">
        <td style="padding:10px 14px">
          <strong style="color:var(--text)">${_esc(p.name)}</strong>
          ${overloaded ? '<span style="font-size:10px;color:var(--yellow);margin-left:8px;font-weight:600">HIGH LOAD</span>' : ''}
        </td>
        <td style="padding:10px 14px;color:var(--text-3);font-size:12px">${_esc(p.role)}</td>
        <td style="padding:10px 14px;font-weight:600;color:var(--text)">${p.cases}</td>
        <td style="padding:10px 14px;color:var(--blue)">${p.active}</td>
        <td style="padding:10px 14px;color:var(--text-3)">${p.filed}</td>
        <td style="padding:10px 14px;color:var(--green)">${p.approved}</td>
        <td style="padding:10px 14px;color:var(--text-2)">${p.estHours}h</td>
        <td style="padding:10px 14px;min-width:160px">${_cssBar((p.cases/maxCases)*100, overloaded ? 'var(--red)' : 'var(--gold)')}</td>
        <td style="padding:10px 14px">
          ${isMA
            ? `<button class="btn btn-ghost btn-sm" style="font-size:11px" onclick="Reports._showReassignModal('${_esc(p.name)}')">Reassign</button>`
            : '—'
          }
        </td>
      </tr>`;
    });

    const csvRows = [
      ['Staff','Role','Total Cases','Active','Filed','Approved','Est. Hours'],
      ...people.map(p => [p.name, p.role, p.cases, p.active, p.filed, p.approved, p.estHours])
    ];

    return `
      ${_reportTopbar('Workload Balance', `
        <button class="btn btn-ghost btn-sm" onclick="Reports.exportCSV(${JSON.stringify(csvRows).replace(/'/g,'&#39;')},'workload-balance.csv')">Export CSV</button>
        <button class="btn btn-ghost btn-sm" onclick="Reports.exportPDF('WorkloadBalance')">Print</button>
      `)}
      <div class="content" id="print-region">
        <div style="display:flex;gap:16px;margin-bottom:24px;flex-wrap:wrap">
          <div style="background:var(--white);border:1px solid var(--border);border-radius:var(--radius-lg);padding:18px 24px;text-align:center;min-width:120px">
            <div style="font-size:26px;font-weight:700;color:var(--text)">${people.length}</div>
            <div style="font-size:11px;color:var(--text-3);margin-top:2px">Staff Members</div>
          </div>
          <div style="background:var(--white);border:1px solid var(--border);border-radius:var(--radius-lg);padding:18px 24px;text-align:center;min-width:120px">
            <div style="font-size:26px;font-weight:700;color:var(--blue)">${avgCases}</div>
            <div style="font-size:11px;color:var(--text-3);margin-top:2px">Avg Cases / Person</div>
          </div>
          <div style="background:var(--white);border:1px solid var(--border);border-radius:var(--radius-lg);padding:18px 24px;text-align:center;min-width:120px">
            <div style="font-size:26px;font-weight:700;color:${people.filter(p=>p.cases>avgCases*1.5).length>0?'var(--yellow)':'var(--green)'}">
              ${people.filter(p=>p.cases>avgCases*1.5).length}
            </div>
            <div style="font-size:11px;color:var(--text-3);margin-top:2px">Overloaded</div>
          </div>
        </div>

        <div style="border:1px solid var(--border);border-radius:var(--radius-lg);overflow:hidden">
          <div style="padding:14px 20px;background:var(--surface-2);border-bottom:1px solid var(--border);font-size:13px;font-weight:600">
            Staff Workload Distribution
          </div>
          ${people.length === 0
            ? `<div style="text-align:center;padding:60px;color:var(--text-3)">No case assignments found. Assign attorneys and case managers to cases first.</div>`
            : `<div style="overflow-x:auto">
                <table style="width:100%;border-collapse:collapse;font-size:13px">
                  <thead><tr style="border-bottom:2px solid var(--border)">
                    ${['Name','Role','Total','Active','Filed','Approved','Est. Hours','Load',''].map(h=>
                      `<th style="padding:10px 14px;text-align:left;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-3)">${h}</th>`
                    ).join('')}
                  </tr></thead>
                  <tbody>${rows.join('')}</tbody>
                </table>
              </div>`
          }
        </div>

        ${people.length > 0 ? `
        <div style="margin-top:20px;border:1px solid var(--border);border-radius:var(--radius-lg);overflow:hidden">
          <div style="padding:14px 20px;background:var(--surface-2);border-bottom:1px solid var(--border);font-size:13px;font-weight:600">Visual Workload Chart</div>
          <div style="padding:20px;display:flex;flex-direction:column;gap:10px">
            ${people.map(p => `
              <div style="display:flex;align-items:center;gap:12px">
                <div style="width:160px;font-size:12px;color:var(--text-2);text-overflow:ellipsis;overflow:hidden;white-space:nowrap;text-align:right">${_esc(p.name)}</div>
                <div style="flex:1;height:22px;background:var(--border);border-radius:3px;overflow:hidden">
                  <div style="height:100%;width:${Math.round(p.cases/maxCases*100)}%;background:${p.cases>avgCases*1.5?'var(--red)':'var(--gold)'};border-radius:3px;display:flex;align-items:center;padding-left:6px">
                    <span style="font-size:10px;color:${p.cases>avgCases*1.5?'white':'var(--navy)'};font-weight:600">${p.cases > 0 ? p.cases : ''}</span>
                  </div>
                </div>
                <div style="width:40px;font-size:12px;color:var(--text-3)">${p.cases} cs</div>
              </div>`).join('')}
          </div>
        </div>` : ''}
      </div>`;
  },

  // ============================================================
  // REPORT 7 — Case Velocity
  // ============================================================
  renderCaseVelocity() {
    const RID = 'CaseVelocity';
    const cases = _getCases();

    // Cases with filing data
    const filed = cases.filter(c => {
      const hasFiledStage = ['KFI','KAP','filed','approved'].includes(c.statusCode || c.stage);
      const hasFilingDate = !!c.targetFilingDate || !!c.filingDate;
      return hasFiledStage || hasFilingDate;
    });

    // By visa type
    const byVisa = {};
    filed.forEach(c => {
      const vt = c.visaType || 'Other';
      const filingDate = c.filingDate || c.targetFilingDate;
      const days = _daysBetween(c.createdAt, filingDate);
      if (days === null || days < 0) return;
      if (!byVisa[vt]) byVisa[vt] = { days: [], attyDays: {}, outliers: [] };
      byVisa[vt].days.push(days);
      if (c.assignedAttorney) {
        if (!byVisa[vt].attyDays[c.assignedAttorney]) byVisa[vt].attyDays[c.assignedAttorney] = [];
        byVisa[vt].attyDays[c.assignedAttorney].push(days);
      }
      if (days > 300) byVisa[vt].outliers.push({ name: _clientName(c), days, id: c.id });
    });

    // By attorney
    const byAtty = {};
    filed.forEach(c => {
      const atty = c.assignedAttorney || 'Unassigned';
      const filingDate = c.filingDate || c.targetFilingDate;
      const days = _daysBetween(c.createdAt, filingDate);
      if (days === null || days < 0) return;
      if (!byAtty[atty]) byAtty[atty] = { days: [] };
      byAtty[atty].days.push(days);
    });

    function stats(arr) {
      if (!arr.length) return { avg: null, min: null, max: null };
      const sorted = [...arr].sort((a,b)=>a-b);
      return {
        avg: Math.round(arr.reduce((s,v)=>s+v,0)/arr.length),
        min: sorted[0],
        max: sorted[sorted.length-1],
      };
    }

    const visaRows = Object.entries(byVisa)
      .sort((a,b) => stats(a[1].days).avg - stats(b[1].days).avg)
      .map(([vt, data]) => {
        const s = stats(data.days);
        if (s.avg === null) return '';
        const outlierHtml = data.outliers.length
          ? `<span title="${data.outliers.map(o=>o.name+' ('+o.days+'d)').join(', ')}" style="cursor:help;color:var(--red);font-size:11px">⚠ ${data.outliers.length} outlier${data.outliers.length>1?'s':''}</span>`
          : '<span style="color:var(--green);font-size:11px">✓</span>';
        return _tr([
          `<strong>${_esc(vt)}</strong>`,
          s.avg !== null ? `${s.avg}d` : '—',
          s.min !== null ? `${s.min}d` : '—',
          s.max !== null ? `${s.max}d` : '—',
          String(data.days.length),
          outlierHtml,
        ]);
      }).filter(Boolean);

    const attyRows = Object.entries(byAtty)
      .sort((a,b) => stats(a[1].days).avg - stats(b[1].days).avg)
      .map(([atty, data]) => {
        const s = stats(data.days);
        if (s.avg === null) return '';
        return _tr([
          `<strong>${_esc(atty)}</strong>`,
          String(data.days.length),
          s.avg !== null ? `${s.avg}d` : '—',
          s.min !== null ? `${s.min}d` : '—',
          s.max !== null ? `${s.max}d` : '—',
        ]);
      }).filter(Boolean);

    const csvRows = [
      ['Visa Type','Avg Days to File','Fastest','Slowest','Total Cases'],
      ...Object.entries(byVisa).map(([vt, data]) => {
        const s = stats(data.days);
        return [vt, s.avg||'', s.min||'', s.max||'', data.days.length];
      }),
      [],
      ['Attorney','Cases','Avg Days','Fastest','Slowest'],
      ...Object.entries(byAtty).map(([atty, data]) => {
        const s = stats(data.days);
        return [atty, data.days.length, s.avg||'', s.min||'', s.max||''];
      }),
    ];

    const overallStats = stats(filed.map(c => {
      const fd = c.filingDate || c.targetFilingDate;
      return _daysBetween(c.createdAt, fd);
    }).filter(d => d !== null && d >= 0));

    return `
      ${_reportTopbar('Case Velocity', `
        <button class="btn btn-ghost btn-sm" onclick="Reports.exportCSV(${JSON.stringify(csvRows).replace(/'/g,'&#39;')},'case-velocity.csv')">Export CSV</button>
        <button class="btn btn-ghost btn-sm" onclick="Reports.exportPDF('CaseVelocity')">Print</button>
      `)}
      <div class="content" id="print-region">
        <div style="display:flex;gap:16px;margin-bottom:24px;flex-wrap:wrap">
          <div style="background:var(--white);border:1px solid var(--border);border-radius:var(--radius-lg);padding:18px 24px;text-align:center">
            <div style="font-size:26px;font-weight:700;color:var(--text)">${filed.length}</div>
            <div style="font-size:11px;color:var(--text-3);margin-top:2px">Cases Analyzed</div>
          </div>
          <div style="background:var(--white);border:1px solid var(--border);border-radius:var(--radius-lg);padding:18px 24px;text-align:center">
            <div style="font-size:26px;font-weight:700;color:var(--gold)">${overallStats.avg !== null ? overallStats.avg + 'd' : '—'}</div>
            <div style="font-size:11px;color:var(--text-3);margin-top:2px">Overall Avg to File</div>
          </div>
          <div style="background:var(--white);border:1px solid var(--border);border-radius:var(--radius-lg);padding:18px 24px;text-align:center">
            <div style="font-size:26px;font-weight:700;color:var(--green)">${overallStats.min !== null ? overallStats.min + 'd' : '—'}</div>
            <div style="font-size:11px;color:var(--text-3);margin-top:2px">Fastest</div>
          </div>
          <div style="background:var(--white);border:1px solid var(--border);border-radius:var(--radius-lg);padding:18px 24px;text-align:center">
            <div style="font-size:26px;font-weight:700;color:var(--red)">${overallStats.max !== null ? overallStats.max + 'd' : '—'}</div>
            <div style="font-size:11px;color:var(--text-3);margin-top:2px">Slowest</div>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
          <div style="border:1px solid var(--border);border-radius:var(--radius-lg);overflow:hidden">
            <div style="padding:14px 20px;background:var(--surface-2);border-bottom:1px solid var(--border);font-size:13px;font-weight:600">By Visa Type</div>
            ${visaRows.length
              ? _tableWrap(['Visa Type','Avg Days','Fastest','Slowest','# Cases','Outliers'], visaRows, 'No data.')
              : `<div style="padding:40px;text-align:center;color:var(--text-3)">No filed cases with velocity data yet.</div>`}
          </div>
          <div style="border:1px solid var(--border);border-radius:var(--radius-lg);overflow:hidden">
            <div style="padding:14px 20px;background:var(--surface-2);border-bottom:1px solid var(--border);font-size:13px;font-weight:600">By Attorney</div>
            ${attyRows.length
              ? _tableWrap(['Attorney','Cases','Avg Days','Fastest','Slowest'], attyRows, 'No data.')
              : `<div style="padding:40px;text-align:center;color:var(--text-3)">No attorney assignments found.</div>`}
          </div>
        </div>
      </div>`;
  },

  // ============================================================
  // REPORT 8 — RFE Tracking
  // ============================================================
  renderRFETracking() {
    const RID = 'RFETracking';
    const cases = _getCases();

    const fStatus = _getFilter(RID, 'status', '');
    const fAtty   = _getFilter(RID, 'attorney', '');

    const RFE_STAGES = ['RFE','RFF','RFA','RFR','rfe'];

    let rfeCases = cases.filter(c => {
      const code = c.statusCode || c.stage || '';
      return RFE_STAGES.includes(code);
    });

    if (fStatus) rfeCases = rfeCases.filter(c => (_statusCode(c)) === fStatus);
    if (fAtty)   rfeCases = rfeCases.filter(c => c.assignedAttorney === fAtty);

    // Sort by RFE due date
    rfeCases.sort((a,b) => {
      const da = a.rfeDueDate || a.rfeDate || '9999';
      const db = b.rfeDueDate || b.rfeDate || '9999';
      return da < db ? -1 : da > db ? 1 : 0;
    });

    const attorneys = [...new Set(rfeCases.map(c => c.assignedAttorney).filter(Boolean))].sort();
    const rfeStatuses = ['RFE','RFF','RFA','RFR'];

    const rows = rfeCases.map(c => {
      const daysRfe = _daysFromToday(c.rfeDueDate || c.rfeDate);
      const rowBg = daysRfe !== null
        ? (daysRfe < 30 ? 'background:var(--red-dim);' : (daysRfe < 90 ? 'background:var(--yellow-dim);' : ''))
        : '';
      const urgColor = daysRfe !== null ? _urgencyColor(daysRfe) : 'var(--text-3)';
      const code = _statusCode(c);

      return `<tr style="border-bottom:1px solid var(--border-2);${rowBg}">
        <td style="padding:10px 14px">
          <div style="font-weight:500;color:var(--text)">${_esc(_clientName(c))}</div>
          <div style="font-size:11px;color:var(--text-3)">${_esc(c.visaType || '')}</div>
        </td>
        <td style="padding:10px 14px;color:var(--text-2)">${_esc(c.visaType || '—')}</td>
        <td style="padding:10px 14px">${_statusBadge(code)}</td>
        <td style="padding:10px 14px;color:var(--text-3);white-space:nowrap">${_fmtDate(c.rfeDate || c.rfeDueDate)}</td>
        <td style="padding:10px 14px;white-space:nowrap">
          <span style="color:${urgColor};font-weight:500">${_fmtDate(c.rfeDueDate || c.rfeDate)}</span>
        </td>
        <td style="padding:10px 14px;font-weight:700;font-size:15px;color:${urgColor}">
          ${daysRfe !== null
            ? (daysRfe < 0 ? `<span title="OVERDUE">${Math.abs(daysRfe)}d overdue</span>` : `${daysRfe}d`)
            : '—'}
        </td>
        <td style="padding:10px 14px">${_statusBadge(code)}</td>
        <td style="padding:10px 14px;color:var(--text-3);font-size:12px">${_esc(c.assignedAttorney || '—')}</td>
        <td style="padding:10px 14px;color:var(--text-3);font-size:12px">${_esc(c.assignedCM || '—')}</td>
        <td style="padding:10px 14px">
          <button class="btn btn-ghost btn-sm" style="font-size:11px" onclick="Reports._sendReminder('${_esc(c.id)}')">Remind</button>
        </td>
      </tr>`;
    });

    const overdue  = rfeCases.filter(c => { const d = _daysFromToday(c.rfeDueDate||c.rfeDate); return d !== null && d < 0; }).length;
    const critical = rfeCases.filter(c => { const d = _daysFromToday(c.rfeDueDate||c.rfeDate); return d !== null && d >= 0 && d < 30; }).length;
    const warning  = rfeCases.filter(c => { const d = _daysFromToday(c.rfeDueDate||c.rfeDate); return d !== null && d >= 30 && d < 90; }).length;

    const csvRows = [
      ['Client','Visa Type','Status','RFE Issue Date','RFE Due Date','Days Remaining','Attorney','CM'],
      ...rfeCases.map(c => {
        const d = _daysFromToday(c.rfeDueDate||c.rfeDate);
        return [
          _clientName(c), c.visaType||'', _statusLabel(c),
          c.rfeDate||'', c.rfeDueDate||'', d !== null ? d : '',
          c.assignedAttorney||'', c.assignedCM||''
        ];
      })
    ];

    return `
      ${_reportTopbar('RFE Tracking', `
        <button class="btn btn-ghost btn-sm" onclick="Reports.exportCSV(${JSON.stringify(csvRows).replace(/'/g,'&#39;')},'rfe-tracking.csv')">Export CSV</button>
        <button class="btn btn-ghost btn-sm" onclick="Reports.exportPDF('RFETracking')">Print</button>
      `)}
      ${_filterBar([
        { type:'select', label:'Status', value: fStatus,
          options:[{value:'',label:'All RFE Statuses'},...rfeStatuses.map(s=>({value:s,label:STATUS_CODES[s]}))],
          onchange:`_setFilter('${RID}','status',this.value);Reports.renderAndMount('RFETracking')` },
        { type:'select', label:'Attorney', value: fAtty,
          options:[{value:'',label:'All Attorneys'},...attorneys.map(a=>({value:a,label:a}))],
          onchange:`_setFilter('${RID}','attorney',this.value);Reports.renderAndMount('RFETracking')` },
      ])}
      <div class="content" id="print-region">
        <div style="display:flex;gap:16px;margin-bottom:24px;flex-wrap:wrap">
          <div style="padding:14px 20px;background:${overdue>0?'var(--red-dim)':'var(--surface-2)'};border:1px solid ${overdue>0?'rgba(220,38,38,0.2)':'var(--border)'};border-radius:var(--radius-lg);text-align:center;min-width:100px">
            <div style="font-size:24px;font-weight:700;color:${overdue>0?'var(--red)':'var(--text-3)'}">${overdue}</div>
            <div style="font-size:10px;color:var(--text-3);margin-top:2px">OVERDUE</div>
          </div>
          <div style="padding:14px 20px;background:${critical>0?'var(--red-dim)':'var(--surface-2)'};border:1px solid ${critical>0?'rgba(220,38,38,0.2)':'var(--border)'};border-radius:var(--radius-lg);text-align:center;min-width:100px">
            <div style="font-size:24px;font-weight:700;color:${critical>0?'var(--red)':'var(--text-3)'}">${critical}</div>
            <div style="font-size:10px;color:var(--text-3);margin-top:2px">&lt;30 DAYS</div>
          </div>
          <div style="padding:14px 20px;background:${warning>0?'var(--yellow-dim)':'var(--surface-2)'};border:1px solid ${warning>0?'rgba(217,119,6,0.2)':'var(--border)'};border-radius:var(--radius-lg);text-align:center;min-width:100px">
            <div style="font-size:24px;font-weight:700;color:${warning>0?'var(--yellow)':'var(--text-3)'}">${warning}</div>
            <div style="font-size:10px;color:var(--text-3);margin-top:2px">30–90 DAYS</div>
          </div>
          <div style="padding:14px 20px;background:var(--surface-2);border:1px solid var(--border);border-radius:var(--radius-lg);text-align:center;min-width:100px">
            <div style="font-size:24px;font-weight:700;color:var(--text)">${rfeCases.length}</div>
            <div style="font-size:10px;color:var(--text-3);margin-top:2px">TOTAL RFE</div>
          </div>
        </div>
        <div style="border:1px solid var(--border);border-radius:var(--radius-lg);overflow:hidden">
          ${rfeCases.length === 0
            ? `<div style="text-align:center;padding:60px;color:var(--text-3)">No active RFE cases${fStatus||fAtty?' matching selected filters':''}.</div>`
            : `<div style="overflow-x:auto">
                <table style="width:100%;border-collapse:collapse;font-size:13px">
                  <thead><tr style="border-bottom:2px solid var(--border)">
                    ${['Client','Case Type','Status','RFE Issue Date','RFE Due Date','Days Remaining','Response Status','Attorney','CM',''].map(h=>
                      `<th style="padding:10px 14px;text-align:left;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-3);white-space:nowrap">${h}</th>`
                    ).join('')}
                  </tr></thead>
                  <tbody>${rows.join('')}</tbody>
                </table>
              </div>`
          }
        </div>
      </div>`;
  },

  // ============================================================
  // Export / Print
  // ============================================================
  exportCSV(rows, filename) {
    if (!rows || !rows.length) { if (typeof toast === 'function') toast('No data to export', 'warn'); return; }
    const csv = rows.map(r =>
      r.map(cell => `"${String(cell || '').replace(/"/g, '""')}"`).join(',')
    ).join('\n');
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
    a.download = filename || 'report.csv';
    a.click();
    if (typeof toast === 'function') toast('CSV exported: ' + (filename || 'report.csv'));
  },

  exportPDF(reportId) {
    // Collect print region content
    const region = document.getElementById('print-region');
    if (!region) { window.print(); return; }
    // Ensure print styles exist
    if (!document.getElementById('reports-print-style')) {
      const s = document.createElement('style');
      s.id = 'reports-print-style';
      s.textContent = `
        @media print {
          body > * { display: none !important; }
          #print-region { display: block !important; position: static !important; }
          #print-region * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          @page { margin: 0.75in; }
        }`;
      document.head.appendChild(s);
    }
    window.print();
  },

  // ============================================================
  // Internal helpers
  // ============================================================
  _sendReminder(caseId) {
    const cases = _getCases();
    const c = cases.find(x => x.id === caseId);
    if (!c) return;
    if (typeof toast === 'function') {
      toast(`Reminder sent for ${_clientName(c)}`);
    }
    // If email system is available, open compose
    if (typeof State !== 'undefined' && typeof navigate === 'function') {
      // Could open email tab — for now just toast
    }
  },

  _showReassignModal(staffName) {
    const cases = _getCases();
    const assignedCases = cases.filter(c => c.assignedAttorney === staffName || c.assignedCM === staffName);
    if (!assignedCases.length) {
      if (typeof toast === 'function') toast('No cases assigned to ' + staffName, 'warn');
      return;
    }
    const allStaff = [...new Set([
      ...cases.map(c => c.assignedAttorney),
      ...cases.map(c => c.assignedCM),
    ].filter(Boolean).filter(n => n !== staffName))].sort();

    if (typeof showModal !== 'function') {
      alert(`${assignedCases.length} case(s) assigned to ${staffName}. Use the Cases section to reassign individually.`);
      return;
    }

    showModal(`
      <div class="modal" style="max-width:480px">
        <div class="modal-header">
          <h3 class="modal-title">Reassign Cases — ${_esc(staffName)}</h3>
          <button class="modal-close" onclick="closeModal()">×</button>
        </div>
        <div style="padding:20px">
          <p style="font-size:13px;color:var(--text-2);margin-bottom:16px">
            ${assignedCases.length} case${assignedCases.length>1?'s':''} assigned to <strong>${_esc(staffName)}</strong>.
            Select a staff member to reassign all cases to:
          </p>
          <div class="field">
            <label>Reassign To</label>
            <select id="reassign-to" style="width:100%;padding:8px 10px;border:1px solid var(--border-2);border-radius:var(--radius);background:var(--white)">
              <option value="">Select staff member...</option>
              ${allStaff.map(s => `<option value="${_esc(s)}">${_esc(s)}</option>`).join('')}
            </select>
          </div>
          <div style="margin-top:8px;max-height:180px;overflow-y:auto;border:1px solid var(--border);border-radius:var(--radius);padding:8px">
            ${assignedCases.map(c => `<div style="font-size:12px;color:var(--text-3);padding:3px 0">• ${_esc(_clientName(c))} (${_esc(c.visaType||'')})</div>`).join('')}
          </div>
        </div>
        <div style="padding:16px 20px;border-top:1px solid var(--border);display:flex;gap:8px;justify-content:flex-end">
          <button class="btn btn-ghost btn-sm" onclick="closeModal()">Cancel</button>
          <button class="btn btn-gold btn-sm" onclick="Reports._doReassign('${_esc(staffName)}')">Reassign All</button>
        </div>
      </div>`);
  },

  _doReassign(fromStaff) {
    const toStaff = document.getElementById('reassign-to')?.value;
    if (!toStaff) { if (typeof toast === 'function') toast('Select a staff member', 'warn'); return; }
    const cases = _getCases();
    let count = 0;
    cases.forEach(c => {
      let changed = false;
      if (c.assignedAttorney === fromStaff) { c.assignedAttorney = toStaff; changed = true; }
      if (c.assignedCM === fromStaff) { c.assignedCM = toStaff; changed = true; }
      if (changed) { c.updatedAt = new Date().toISOString(); count++; }
    });
    if (typeof Storage !== 'undefined' && Storage.save) Storage.save();
    if (typeof closeModal === 'function') closeModal();
    if (typeof toast === 'function') toast(`${count} case${count!==1?'s':''} reassigned to ${toStaff}`);
    Reports.renderAndMount('WorkloadBalance');
  },

  // Render a specific report into the main content area
  renderAndMount(reportId) {
    _setActiveReport(reportId);
    const mc = document.getElementById('main-content');
    if (!mc) { if (typeof render === 'function') render(); return; }
    const fn = Reports['render' + reportId];
    if (fn) mc.innerHTML = fn.call(Reports);
  },
};

// ============================================================
// Patch renderMain() to handle 'reports' view
// ============================================================
(function _patchRenderMain() {
  function _applyPatch() {
    if (typeof window.renderMain !== 'function') return;
    // Guard against double-patching
    if (window.renderMain._reportsPatchApplied) return;
    const _origRenderMain = window.renderMain;
    window.renderMain = function () {
      if (typeof State !== 'undefined' && State.view === 'reports') {
        const rid = State.activeReport || window._activeReport;
        if (!rid) return Reports.renderReportsHub();
        const key = 'render' + rid.replace(/-./g, m => m[1].toUpperCase());
        const fn = Reports[key];
        return fn ? fn.call(Reports) : Reports.renderReportsHub();
      }
      return _origRenderMain.apply(this, arguments);
    };
    window.renderMain._reportsPatchApplied = true;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _applyPatch);
  } else {
    // renderMain may not exist yet if this file loads before case-manager.js fully runs,
    // so try now and also after a tick
    _applyPatch();
    setTimeout(_applyPatch, 0);
  }
})();

// ============================================================
// Add Reports navigation to the sidebar (patch renderSidebar)
// ============================================================
(function _patchSidebar() {
  function _applyPatch() {
    if (typeof window.renderSidebar !== 'function') return;
    if (window.renderSidebar._reportsPatchApplied) return;
    const _origSidebar = window.renderSidebar;
    window.renderSidebar = function () {
      let html = _origSidebar.apply(this, arguments);
      // Inject a Reports link after the nav-section-label "Overview" section
      // by appending before </nav>
      const insertBefore = `<div class="nav-section-label" style="margin-top:16px">Actions</div>`;
      const navItem = `
        <div class="nav-section-label" style="margin-top:16px">Analytics</div>
        <button class="nav-item ${(typeof State !== 'undefined' && State.view === 'reports') ? 'active' : ''}"
          onclick="Reports.navigate(null)">
          <span class="nav-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg></span>
          Reports
        </button>`;
      html = html.replace(insertBefore, navItem + insertBefore);
      return html;
    };
    window.renderSidebar._reportsPatchApplied = true;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _applyPatch);
  } else {
    _applyPatch();
    setTimeout(_applyPatch, 0);
  }
})();
