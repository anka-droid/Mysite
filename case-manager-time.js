/* ============================================================
   Kamkhadze PA — Automatic Time Tracking Engine
   Requires: case-manager-auth.js, case-manager-rbac.js, case-manager.js
   Storage:
     km_time_log_v1      — JSON array of time log entries (non-PII, unencrypted)
     km_time_settings_v1 — JSON settings object (default times, hourly rate)
   ============================================================ */

(function () {
  'use strict';

  /* ── Constants ─────────────────────────────────────────── */

  const TIME_LOG_KEY      = 'km_time_log_v1';
  const TIME_SETTINGS_KEY = 'km_time_settings_v1';

  const TIME_DEFAULTS = {
    email_sent:         10,
    invoice_generated:  15,
    rep_agreement:      15,
    questionnaire_sent: 10,
    document_review:    20,
    petition_drafted:   90,
    toc_generated:      20,
    exhibit_numbered:   30,
    zoom_scheduled:     15,
    rfe_response:      120,
    status_updated:      5,
    reminder_sent:       5,
    case_created:       20,
    document_uploaded:  20,
    note_added:          5,
  };

  const ACTION_LABELS = {
    email_sent:         'Email Sent',
    invoice_generated:  'Invoice Generated',
    rep_agreement:      'Rep Agreement',
    questionnaire_sent: 'Questionnaire Sent',
    document_review:    'Document Review',
    petition_drafted:   'Petition Drafted',
    toc_generated:      'Table of Contents Generated',
    exhibit_numbered:   'Exhibit Numbered',
    zoom_scheduled:     'Zoom Meeting Scheduled',
    rfe_response:       'RFE Response',
    status_updated:     'Status Updated',
    reminder_sent:      'Reminder Sent',
    case_created:       'Case Created',
    document_uploaded:  'Document Uploaded',
    note_added:         'Note Added',
  };

  const DEFAULT_HOURLY_RATE = 350;

  /* ── Helpers ────────────────────────────────────────────── */

  function _loadLog() {
    try {
      const raw = localStorage.getItem(TIME_LOG_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function _saveLog(entries) {
    try {
      localStorage.setItem(TIME_LOG_KEY, JSON.stringify(entries));
    } catch (e) {
      console.warn('[TimeTracker] Could not save time log:', e);
    }
  }

  function _loadSettings() {
    try {
      const raw = localStorage.getItem(TIME_SETTINGS_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  function _saveSettings(settings) {
    try {
      localStorage.setItem(TIME_SETTINGS_KEY, JSON.stringify(settings));
    } catch (e) {
      console.warn('[TimeTracker] Could not save settings:', e);
    }
  }

  function _getEffectiveMins(action) {
    const settings = _loadSettings();
    if (settings.overrides && settings.overrides[action] != null) {
      return settings.overrides[action];
    }
    return TIME_DEFAULTS[action] != null ? TIME_DEFAULTS[action] : 15;
  }

  function _getHourlyRate() {
    const settings = _loadSettings();
    return settings.hourlyRate != null ? settings.hourlyRate : DEFAULT_HOURLY_RATE;
  }

  function _currentUsername() {
    try {
      return (typeof Auth !== 'undefined' && Auth.username) ? Auth.username : 'unknown';
    } catch (e) {
      return 'unknown';
    }
  }

  function _currentRole() {
    try {
      if (typeof RBAC !== 'undefined' && typeof RBAC.getRole === 'function') {
        return RBAC.getRole() || 'managing_attorney';
      }
    } catch (e) {}
    return 'managing_attorney';
  }

  function _escHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /** Returns "2 hr 15 min" or "45 min" or "0 min" */
  function formatTime(mins) {
    if (!mins && mins !== 0) return '—';
    mins = Math.round(mins);
    if (mins === 0) return '0 min';
    if (mins < 60) return `${mins} min`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m === 0 ? `${h} hr` : `${h} hr ${m} min`;
  }

  function _formatCurrency(dollars) {
    return '$' + dollars.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }

  function _startOfWeek() {
    const d = new Date();
    const day = d.getDay(); // 0=Sun
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - day);
    return d;
  }

  /* ── Core Storage Methods ───────────────────────────────── */

  function log(caseId, action, label, overrideMins = null) {
    try {
      const estimatedMins = overrideMins != null ? overrideMins : _getEffectiveMins(action);
      const entry = {
        id:           (typeof uuid === 'function') ? uuid() : ('tt_' + Date.now() + '_' + Math.random().toString(36).slice(2)),
        caseId:       caseId,
        action:       action,
        label:        label || ACTION_LABELS[action] || action,
        username:     _currentUsername(),
        role:         _currentRole(),
        estimatedMins: estimatedMins,
        actualMins:   null,
        timestamp:    new Date().toISOString(),
        billed:       false,
        invoiceId:    null,
      };
      const entries = _loadLog();
      entries.push(entry);
      _saveLog(entries);
    } catch (e) {
      // Silent — must not interrupt workflow
      console.warn('[TimeTracker] log() failed silently:', e);
    }
  }

  function getForCase(caseId) {
    return _loadLog().filter(e => e.caseId === caseId);
  }

  function getForUser(username, startDate, endDate) {
    let entries = _loadLog().filter(e => e.username === username);
    if (startDate) {
      const start = new Date(startDate).getTime();
      entries = entries.filter(e => new Date(e.timestamp).getTime() >= start);
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      entries = entries.filter(e => new Date(e.timestamp).getTime() <= end.getTime());
    }
    return entries;
  }

  function totalMinsForCase(caseId) {
    return getForCase(caseId).reduce((sum, e) => {
      return sum + (e.actualMins != null ? e.actualMins : e.estimatedMins);
    }, 0);
  }

  function breakdownByRole(caseId) {
    const entries = getForCase(caseId);
    const breakdown = {};
    entries.forEach(e => {
      const mins = e.actualMins != null ? e.actualMins : e.estimatedMins;
      if (!breakdown[e.role]) breakdown[e.role] = 0;
      breakdown[e.role] += mins;
    });
    return breakdown;
  }

  function updateActual(entryId, actualMins) {
    const entries = _loadLog();
    const entry = entries.find(e => e.id === entryId);
    if (!entry) return false;
    entry.actualMins = actualMins;
    _saveLog(entries);
    return true;
  }

  function markBilled(entryId, invoiceId) {
    const entries = _loadLog();
    const entry = entries.find(e => e.id === entryId);
    if (!entry) return false;
    entry.billed = true;
    entry.invoiceId = invoiceId || null;
    _saveLog(entries);
    return true;
  }

  function getUnbilledForCase(caseId) {
    return getForCase(caseId).filter(e => !e.billed);
  }

  function getSettings() {
    const stored = _loadSettings();
    return {
      hourlyRate: stored.hourlyRate != null ? stored.hourlyRate : DEFAULT_HOURLY_RATE,
      overrides:  stored.overrides || {},
    };
  }

  function saveSettings(settings) {
    _saveSettings(settings);
  }

  /* ── Render: Case Time Log Panel ────────────────────────── */

  function renderCaseTimeLog(caseId) {
    const entries = getForCase(caseId);
    const totalMins = totalMinsForCase(caseId);
    const hourlyRate = _getHourlyRate();
    const billableAmount = Math.round((totalMins / 60) * hourlyRate);
    const unbilledEntries = entries.filter(e => !e.billed);
    const unbilledMins = unbilledEntries.reduce((s, e) => s + (e.actualMins != null ? e.actualMins : e.estimatedMins), 0);

    const rowsHtml = entries.length === 0
      ? `<tr><td colspan="7" style="text-align:center;color:#9ca3af;padding:24px;">No time entries yet. Actions you perform will appear here automatically.</td></tr>`
      : entries.slice().sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).map(e => {
          const actualDisplay = e.actualMins != null
            ? `<span style="color:#059669;font-weight:600;">${formatTime(e.actualMins)}</span>`
            : `<span style="color:#9ca3af;">—</span>`;
          const billedBadge = e.billed
            ? `<span style="background:#d1fae5;color:#065f46;border-radius:4px;padding:2px 8px;font-size:11px;">Billed${e.invoiceId ? ' #' + _escHtml(e.invoiceId) : ''}</span>`
            : `<button onclick="TimeTracker._markBilledPrompt('${_escHtml(e.id)}')" style="background:#f3f4f6;border:none;border-radius:4px;padding:2px 8px;font-size:11px;cursor:pointer;color:#374151;">Mark Billed</button>`;
          const roleLabel = { managing_attorney: 'Atty', associate_attorney: 'Assoc.', case_manager: 'CM' }[e.role] || e.role;
          return `<tr>
            <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;color:#6b7280;">${_escHtml(fmtDate ? fmtDate(e.timestamp) : e.timestamp.slice(0,10))}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;">${_escHtml(e.label)}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;color:#6b7280;">${_escHtml(e.username)} <small style="color:#d1d5db;">(${roleLabel})</small></td>
            <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;">${formatTime(e.estimatedMins)}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;">
              <span onclick="TimeTracker._inlineEditActual(this, '${_escHtml(e.id)}')" title="Click to set actual time" style="cursor:pointer;border-bottom:1px dashed #9ca3af;">
                ${actualDisplay}
              </span>
            </td>
            <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;">${billedBadge}</td>
          </tr>`;
        }).join('');

    return `
<div class="tt-case-log" style="background:#fff;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;">
  <!-- Header -->
  <div style="background:#f9fafb;border-bottom:1px solid #e5e7eb;padding:16px 20px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
    <div>
      <h3 style="margin:0 0 4px;font-size:15px;font-weight:600;color:#111827;">Time Log</h3>
      <div style="font-size:13px;color:#6b7280;">
        Total: <strong style="color:#111827;">${formatTime(totalMins)}</strong>
        &nbsp;·&nbsp;
        Est. billable: <strong style="color:#059669;">${_formatCurrency(billableAmount)}</strong>
        &nbsp;·&nbsp;
        Unbilled: <strong style="color:#d97706;">${formatTime(unbilledMins)}</strong>
      </div>
    </div>
    <div style="display:flex;gap:8px;align-items:center;">
      <button onclick="TimeTracker._showManualLogModal('${_escHtml(caseId)}')"
        style="background:#4f46e5;color:#fff;border:none;border-radius:6px;padding:7px 14px;font-size:13px;cursor:pointer;font-weight:500;">
        + Log Time
      </button>
      <button onclick="TimeTracker._exportCaseCsv('${_escHtml(caseId)}')"
        style="background:#f3f4f6;color:#374151;border:1px solid #e5e7eb;border-radius:6px;padding:7px 14px;font-size:13px;cursor:pointer;">
        Export CSV
      </button>
    </div>
  </div>
  <!-- Table -->
  <div style="overflow-x:auto;">
    <table style="width:100%;border-collapse:collapse;">
      <thead>
        <tr style="background:#f9fafb;">
          <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;border-bottom:1px solid #e5e7eb;">Date</th>
          <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;border-bottom:1px solid #e5e7eb;">Action</th>
          <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;border-bottom:1px solid #e5e7eb;">Staff</th>
          <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;border-bottom:1px solid #e5e7eb;">Est. Time</th>
          <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;border-bottom:1px solid #e5e7eb;">Actual Time</th>
          <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;border-bottom:1px solid #e5e7eb;">Billing</th>
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
    </table>
  </div>
</div>`;
  }

  /* ── Render: Time Summary Widget ────────────────────────── */

  function renderTimeSummary(caseId) {
    const entries = getForCase(caseId);
    const totalMins = totalMinsForCase(caseId);
    const weekStart = _startOfWeek();
    const weekMins = entries.filter(e => new Date(e.timestamp) >= weekStart)
      .reduce((s, e) => s + (e.actualMins != null ? e.actualMins : e.estimatedMins), 0);
    const unbilledMins = getUnbilledForCase(caseId)
      .reduce((s, e) => s + (e.actualMins != null ? e.actualMins : e.estimatedMins), 0);

    const stat = (label, value, color) => `
      <div style="flex:1;min-width:110px;padding:14px 16px;background:#fff;border:1px solid #e5e7eb;border-radius:8px;text-align:center;">
        <div style="font-size:18px;font-weight:700;color:${color};margin-bottom:4px;">${value}</div>
        <div style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:.05em;">${label}</div>
      </div>`;

    return `
<div style="display:flex;gap:10px;flex-wrap:wrap;margin:12px 0;" data-tt-summary="${_escHtml(caseId)}">
  ${stat('Total Time', formatTime(totalMins), '#4f46e5')}
  ${stat('This Week', formatTime(weekMins), '#0891b2')}
  ${stat('Unbilled', formatTime(unbilledMins), '#d97706')}
</div>`;
  }

  /* ── Render: Full Time Report ───────────────────────────── */

  /**
   * filters: { groupBy: 'case'|'staff', startDate, endDate, username, visaType }
   */
  function renderTimeReport(filters) {
    filters = filters || {};
    const groupBy    = filters.groupBy   || 'case';
    const startDate  = filters.startDate || '';
    const endDate    = filters.endDate   || '';
    const filterUser = filters.username  || '';
    const filterVisa = filters.visaType  || '';
    const hourlyRate = _getHourlyRate();

    let entries = _loadLog();

    // Date filters
    if (startDate) {
      const start = new Date(startDate).getTime();
      entries = entries.filter(e => new Date(e.timestamp).getTime() >= start);
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      entries = entries.filter(e => new Date(e.timestamp).getTime() <= end.getTime());
    }
    if (filterUser) {
      entries = entries.filter(e => e.username === filterUser);
    }

    // Visa type filter — requires State.cases lookup
    if (filterVisa && typeof State !== 'undefined' && State.cases) {
      const matchingCaseIds = new Set(State.cases.filter(c => c.visaType === filterVisa).map(c => c.id));
      entries = entries.filter(e => matchingCaseIds.has(e.caseId));
    }

    // Totals
    const grandEstMins = entries.reduce((s, e) => s + e.estimatedMins, 0);
    const grandActMins = entries.reduce((s, e) => s + (e.actualMins != null ? e.actualMins : e.estimatedMins), 0);
    const grandBillable = Math.round((grandActMins / 60) * hourlyRate);
    const grandUnbilledMins = entries.filter(e => !e.billed).reduce((s, e) => s + (e.actualMins != null ? e.actualMins : e.estimatedMins), 0);

    // Grouping
    const groups = {};
    entries.forEach(e => {
      const key = groupBy === 'staff' ? e.username : e.caseId;
      if (!groups[key]) groups[key] = [];
      groups[key].push(e);
    });

    // Build group label helper
    function groupLabel(key) {
      if (groupBy === 'staff') return _escHtml(key);
      if (typeof State !== 'undefined' && State.cases) {
        const c = State.cases.find(x => x.id === key);
        if (c) return `${_escHtml(c.firstName + ' ' + c.lastName)} <small style="color:#9ca3af;">${_escHtml(c.visaType || '')}</small>`;
      }
      return _escHtml(key);
    }

    // All unique users for filter dropdown
    const allUsers = [...new Set(_loadLog().map(e => e.username))];
    // All visa types
    const allVisaTypes = (typeof State !== 'undefined' && State.cases)
      ? [...new Set(State.cases.map(c => c.visaType).filter(Boolean))]
      : [];

    const groupsHtml = Object.keys(groups).length === 0
      ? `<tr><td colspan="6" style="text-align:center;color:#9ca3af;padding:32px;">No entries match the selected filters.</td></tr>`
      : Object.entries(groups).map(([key, grpEntries]) => {
          const grpEst  = grpEntries.reduce((s, e) => s + e.estimatedMins, 0);
          const grpAct  = grpEntries.reduce((s, e) => s + (e.actualMins != null ? e.actualMins : e.estimatedMins), 0);
          const grpBill = Math.round((grpAct / 60) * hourlyRate);
          const grpUnbilled = grpEntries.filter(e => !e.billed).reduce((s, e) => s + (e.actualMins != null ? e.actualMins : e.estimatedMins), 0);

          const subRows = grpEntries.slice().sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).map(e => `
            <tr style="background:#fafafa;">
              <td style="padding:6px 12px 6px 28px;border-bottom:1px solid #f3f4f6;font-size:12px;color:#6b7280;">${_escHtml(fmtDate ? fmtDate(e.timestamp) : e.timestamp.slice(0,10))}</td>
              <td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;font-size:12px;">${_escHtml(e.label)}</td>
              <td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;font-size:12px;color:#6b7280;">${_escHtml(e.username)}</td>
              <td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;font-size:12px;">${formatTime(e.estimatedMins)}</td>
              <td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;font-size:12px;">${e.actualMins != null ? `<span style="color:#059669;">${formatTime(e.actualMins)}</span>` : '<span style="color:#d1d5db;">—</span>'}</td>
              <td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;font-size:12px;">${e.billed ? '<span style="color:#059669;">✓ Billed</span>' : '<span style="color:#9ca3af;">Unbilled</span>'}</td>
            </tr>`).join('');

          return `
          <tr style="background:#f9fafb;cursor:pointer;" onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'':'none'">
            <td colspan="2" style="padding:10px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;font-weight:600;">▸ ${groupLabel(key)}</td>
            <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#6b7280;">${grpEntries.length} entries</td>
            <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;">${formatTime(grpEst)}</td>
            <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;font-weight:600;color:#4f46e5;">${formatTime(grpAct)}</td>
            <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#059669;">${_formatCurrency(grpBill)}<br><small style="color:#d97706;font-weight:400;">${formatTime(grpUnbilled)} unbilled</small></td>
          </tr>
          <tbody style="display:none;">${subRows}</tbody>`;
        }).join('');

    return `
<div class="tt-report" style="background:#fff;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;">
  <!-- Filter Bar -->
  <div style="background:#f9fafb;border-bottom:1px solid #e5e7eb;padding:16px 20px;">
    <h3 style="margin:0 0 12px;font-size:15px;font-weight:600;color:#111827;">Time Report</h3>
    <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end;">
      <label style="font-size:12px;color:#6b7280;display:flex;flex-direction:column;gap:4px;">
        Group by
        <select onchange="TimeTracker._reloadReport(this)" data-filter="groupBy"
          style="border:1px solid #d1d5db;border-radius:6px;padding:6px 10px;font-size:13px;background:#fff;">
          <option value="case"  ${groupBy==='case' ?'selected':''}>Case</option>
          <option value="staff" ${groupBy==='staff'?'selected':''}>Staff Member</option>
        </select>
      </label>
      <label style="font-size:12px;color:#6b7280;display:flex;flex-direction:column;gap:4px;">
        From
        <input type="date" value="${_escHtml(startDate)}" data-filter="startDate"
          onchange="TimeTracker._reloadReport(this)"
          style="border:1px solid #d1d5db;border-radius:6px;padding:6px 10px;font-size:13px;">
      </label>
      <label style="font-size:12px;color:#6b7280;display:flex;flex-direction:column;gap:4px;">
        To
        <input type="date" value="${_escHtml(endDate)}" data-filter="endDate"
          onchange="TimeTracker._reloadReport(this)"
          style="border:1px solid #d1d5db;border-radius:6px;padding:6px 10px;font-size:13px;">
      </label>
      <label style="font-size:12px;color:#6b7280;display:flex;flex-direction:column;gap:4px;">
        Staff
        <select onchange="TimeTracker._reloadReport(this)" data-filter="username"
          style="border:1px solid #d1d5db;border-radius:6px;padding:6px 10px;font-size:13px;background:#fff;">
          <option value="">All Staff</option>
          ${allUsers.map(u => `<option value="${_escHtml(u)}" ${filterUser===u?'selected':''}>${_escHtml(u)}</option>`).join('')}
        </select>
      </label>
      ${allVisaTypes.length > 0 ? `
      <label style="font-size:12px;color:#6b7280;display:flex;flex-direction:column;gap:4px;">
        Visa Type
        <select onchange="TimeTracker._reloadReport(this)" data-filter="visaType"
          style="border:1px solid #d1d5db;border-radius:6px;padding:6px 10px;font-size:13px;background:#fff;">
          <option value="">All Types</option>
          ${allVisaTypes.map(v => `<option value="${_escHtml(v)}" ${filterVisa===v?'selected':''}>${_escHtml(v)}</option>`).join('')}
        </select>
      </label>` : ''}
      <button onclick="TimeTracker._exportReportCsv(${JSON.stringify(filters).replace(/"/g,'&quot;')})"
        style="background:#f3f4f6;color:#374151;border:1px solid #e5e7eb;border-radius:6px;padding:7px 14px;font-size:13px;cursor:pointer;margin-left:auto;">
        Export CSV
      </button>
    </div>
  </div>
  <!-- Summary Stats -->
  <div style="display:flex;gap:0;border-bottom:1px solid #e5e7eb;">
    ${[
      ['Total Entries', entries.length, '#6b7280'],
      ['Est. Time',     formatTime(grandEstMins), '#6b7280'],
      ['Actual Time',   formatTime(grandActMins), '#4f46e5'],
      ['Billable',      _formatCurrency(grandBillable), '#059669'],
      ['Unbilled',      formatTime(grandUnbilledMins), '#d97706'],
    ].map(([label, val, color]) => `
      <div style="flex:1;padding:14px 16px;border-right:1px solid #e5e7eb;text-align:center;">
        <div style="font-size:16px;font-weight:700;color:${color};">${val}</div>
        <div style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:.04em;">${label}</div>
      </div>`).join('')}
  </div>
  <!-- Table -->
  <div style="overflow-x:auto;">
    <table style="width:100%;border-collapse:collapse;">
      <thead>
        <tr style="background:#f9fafb;">
          <th colspan="2" style="padding:10px 12px;text-align:left;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;border-bottom:1px solid #e5e7eb;">${groupBy === 'staff' ? 'Staff / Action' : 'Case / Action'}</th>
          <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;border-bottom:1px solid #e5e7eb;">Count</th>
          <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;border-bottom:1px solid #e5e7eb;">Estimated</th>
          <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;border-bottom:1px solid #e5e7eb;">Actual</th>
          <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;border-bottom:1px solid #e5e7eb;">Billable / Unbilled</th>
        </tr>
      </thead>
      <tbody>${groupsHtml}</tbody>
    </table>
  </div>
</div>`;
  }

  /* ── Render: Settings Panel ─────────────────────────────── */

  function renderSettings() {
    const settings = getSettings();
    const rate = settings.hourlyRate;
    const overrides = settings.overrides || {};

    const rowsHtml = Object.entries(TIME_DEFAULTS).map(([action, defaultMins]) => {
      const current = overrides[action] != null ? overrides[action] : defaultMins;
      const label = ACTION_LABELS[action] || action;
      return `<tr>
        <td style="padding:10px 12px;font-size:13px;color:#374151;">${_escHtml(label)}</td>
        <td style="padding:10px 12px;font-size:12px;color:#9ca3af;font-family:monospace;">${_escHtml(action)}</td>
        <td style="padding:10px 12px;">
          <input type="number" min="1" max="600"
            id="tt-setting-${_escHtml(action)}"
            value="${_escHtml(String(current))}"
            style="width:80px;border:1px solid #d1d5db;border-radius:6px;padding:5px 8px;font-size:13px;text-align:right;">
          <span style="font-size:12px;color:#9ca3af;margin-left:4px;">min</span>
        </td>
        <td style="padding:10px 12px;font-size:12px;color:#9ca3af;">${_escHtml(String(defaultMins))} min (default)</td>
      </tr>`;
    }).join('');

    return `
<div class="tt-settings" style="background:#fff;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;max-width:680px;">
  <div style="background:#f9fafb;border-bottom:1px solid #e5e7eb;padding:16px 20px;">
    <h3 style="margin:0;font-size:15px;font-weight:600;color:#111827;">Time Tracking Settings</h3>
    <p style="margin:4px 0 0;font-size:13px;color:#6b7280;">Configure default time estimates and billing rate.</p>
  </div>
  <!-- Hourly Rate -->
  <div style="padding:16px 20px;border-bottom:1px solid #e5e7eb;display:flex;align-items:center;gap:16px;">
    <label style="font-size:13px;font-weight:600;color:#374151;min-width:160px;">Hourly Billing Rate</label>
    <div style="display:flex;align-items:center;gap:6px;">
      <span style="font-size:14px;color:#6b7280;">$</span>
      <input type="number" min="1" max="99999" id="tt-setting-hourlyRate"
        value="${_escHtml(String(rate))}"
        style="width:100px;border:1px solid #d1d5db;border-radius:6px;padding:6px 10px;font-size:14px;font-weight:600;">
      <span style="font-size:13px;color:#9ca3af;">per hour</span>
    </div>
  </div>
  <!-- Default Times Table -->
  <div style="overflow-x:auto;">
    <table style="width:100%;border-collapse:collapse;">
      <thead>
        <tr style="background:#f9fafb;">
          <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;border-bottom:1px solid #e5e7eb;">Action</th>
          <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;border-bottom:1px solid #e5e7eb;">Key</th>
          <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;border-bottom:1px solid #e5e7eb;">Time</th>
          <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;border-bottom:1px solid #e5e7eb;">System Default</th>
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
    </table>
  </div>
  <!-- Actions -->
  <div style="padding:16px 20px;border-top:1px solid #e5e7eb;display:flex;gap:10px;justify-content:flex-end;">
    <button onclick="TimeTracker._resetSettingsDefaults()"
      style="background:#f3f4f6;color:#374151;border:1px solid #e5e7eb;border-radius:6px;padding:8px 18px;font-size:13px;cursor:pointer;">
      Reset to Defaults
    </button>
    <button onclick="TimeTracker._saveSettingsFromForm()"
      style="background:#4f46e5;color:#fff;border:none;border-radius:6px;padding:8px 18px;font-size:13px;cursor:pointer;font-weight:500;">
      Save Settings
    </button>
  </div>
</div>`;
  }

  /* ── Internal UI Helpers ────────────────────────────────── */

  function _saveSettingsFromForm() {
    const settings = { overrides: {} };
    const rateInput = document.getElementById('tt-setting-hourlyRate');
    if (rateInput) {
      const r = parseFloat(rateInput.value);
      settings.hourlyRate = isNaN(r) ? DEFAULT_HOURLY_RATE : r;
    }
    Object.keys(TIME_DEFAULTS).forEach(action => {
      const el = document.getElementById('tt-setting-' + action);
      if (el) {
        const val = parseInt(el.value, 10);
        if (!isNaN(val) && val > 0) {
          settings.overrides[action] = val;
        }
      }
    });
    saveSettings(settings);
    if (typeof toast === 'function') toast('Time tracking settings saved');
  }

  function _resetSettingsDefaults() {
    if (!confirm('Reset all time estimates to system defaults?')) return;
    _saveSettings({ hourlyRate: DEFAULT_HOURLY_RATE, overrides: {} });
    if (typeof toast === 'function') toast('Settings reset to defaults');
    if (typeof render === 'function') render();
  }

  function _inlineEditActual(el, entryId) {
    const parent = el.parentElement;
    const current = _loadLog().find(e => e.id === entryId);
    const currentVal = current && current.actualMins != null ? current.actualMins : '';
    parent.innerHTML = `
      <input type="number" min="0" max="9999" value="${_escHtml(String(currentVal))}" placeholder="mins"
        id="tt-actual-input-${_escHtml(entryId)}"
        style="width:70px;border:1px solid #4f46e5;border-radius:4px;padding:3px 6px;font-size:13px;">
      <button onclick="TimeTracker._saveActualInline('${_escHtml(entryId)}')"
        style="background:#4f46e5;color:#fff;border:none;border-radius:4px;padding:3px 8px;font-size:12px;cursor:pointer;margin-left:4px;">✓</button>
      <button onclick="if(typeof render==='function')render();"
        style="background:#f3f4f6;border:1px solid #e5e7eb;border-radius:4px;padding:3px 6px;font-size:12px;cursor:pointer;margin-left:2px;">✕</button>`;
    const input = document.getElementById('tt-actual-input-' + entryId);
    if (input) {
      input.focus();
      input.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') TimeTracker._saveActualInline(entryId);
        if (e.key === 'Escape' && typeof render === 'function') render();
      });
    }
  }

  function _saveActualInline(entryId) {
    const input = document.getElementById('tt-actual-input-' + entryId);
    if (!input) return;
    const val = parseInt(input.value, 10);
    if (isNaN(val) || val < 0) {
      if (typeof toast === 'function') toast('Please enter a valid number of minutes', 'warn');
      return;
    }
    updateActual(entryId, val);
    if (typeof toast === 'function') toast('Actual time updated');
    if (typeof render === 'function') render();
  }

  function _markBilledPrompt(entryId) {
    const invoiceId = prompt('Enter invoice ID (optional, press OK to mark billed without one):');
    if (invoiceId === null) return; // cancelled
    markBilled(entryId, invoiceId.trim() || null);
    if (typeof toast === 'function') toast('Entry marked as billed');
    if (typeof render === 'function') render();
  }

  function _showManualLogModal(caseId) {
    // Remove any existing modal
    const existing = document.getElementById('tt-manual-log-modal');
    if (existing) existing.remove();

    const actionOptions = Object.entries(ACTION_LABELS)
      .map(([k, v]) => `<option value="${_escHtml(k)}">${_escHtml(v)}</option>`)
      .join('');

    const modal = document.createElement('div');
    modal.id = 'tt-manual-log-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9999;display:flex;align-items:center;justify-content:center;';
    modal.innerHTML = `
      <div style="background:#fff;border-radius:12px;padding:28px;width:420px;max-width:95vw;box-shadow:0 20px 60px rgba(0,0,0,.25);">
        <h3 style="margin:0 0 18px;font-size:16px;font-weight:600;color:#111827;">Log Time Manually</h3>
        <label style="display:block;font-size:13px;color:#374151;margin-bottom:12px;">
          Action Type
          <select id="tt-manual-action" onchange="TimeTracker._updateManualLabel()"
            style="display:block;width:100%;margin-top:4px;border:1px solid #d1d5db;border-radius:6px;padding:8px 10px;font-size:13px;">
            ${actionOptions}
            <option value="__custom">Custom…</option>
          </select>
        </label>
        <label style="display:block;font-size:13px;color:#374151;margin-bottom:12px;">
          Description
          <input type="text" id="tt-manual-label" placeholder="Short description of work done"
            style="display:block;width:100%;margin-top:4px;border:1px solid #d1d5db;border-radius:6px;padding:8px 10px;font-size:13px;box-sizing:border-box;">
        </label>
        <label style="display:block;font-size:13px;color:#374151;margin-bottom:20px;">
          Duration (minutes)
          <input type="number" id="tt-manual-mins" min="1" max="9999" placeholder="e.g. 30"
            style="display:block;width:100%;margin-top:4px;border:1px solid #d1d5db;border-radius:6px;padding:8px 10px;font-size:13px;box-sizing:border-box;">
        </label>
        <div style="display:flex;gap:10px;justify-content:flex-end;">
          <button onclick="document.getElementById('tt-manual-log-modal').remove()"
            style="background:#f3f4f6;color:#374151;border:1px solid #e5e7eb;border-radius:6px;padding:8px 18px;font-size:13px;cursor:pointer;">
            Cancel
          </button>
          <button onclick="TimeTracker._submitManualLog('${_escHtml(caseId)}')"
            style="background:#4f46e5;color:#fff;border:none;border-radius:6px;padding:8px 18px;font-size:13px;cursor:pointer;font-weight:500;">
            Log Time
          </button>
        </div>
      </div>`;
    modal.addEventListener('click', function(e) {
      if (e.target === modal) modal.remove();
    });
    document.body.appendChild(modal);
    // Pre-fill label from first action
    setTimeout(() => TimeTracker._updateManualLabel(), 0);
  }

  function _updateManualLabel() {
    const actionEl = document.getElementById('tt-manual-action');
    const labelEl  = document.getElementById('tt-manual-label');
    const minsEl   = document.getElementById('tt-manual-mins');
    if (!actionEl) return;
    const action = actionEl.value;
    if (action !== '__custom') {
      if (labelEl && !labelEl.dataset.userEdited) {
        labelEl.value = ACTION_LABELS[action] || '';
      }
      if (minsEl && !minsEl.dataset.userEdited) {
        minsEl.value = String(_getEffectiveMins(action));
      }
    }
  }

  function _submitManualLog(caseId) {
    const actionEl = document.getElementById('tt-manual-action');
    const labelEl  = document.getElementById('tt-manual-label');
    const minsEl   = document.getElementById('tt-manual-mins');
    if (!actionEl || !labelEl || !minsEl) return;

    const action = actionEl.value === '__custom' ? 'note_added' : actionEl.value;
    const label  = labelEl.value.trim();
    const mins   = parseInt(minsEl.value, 10);

    if (!label) {
      if (typeof toast === 'function') toast('Please enter a description', 'warn');
      return;
    }
    if (isNaN(mins) || mins < 1) {
      if (typeof toast === 'function') toast('Please enter a valid duration in minutes', 'warn');
      return;
    }

    log(caseId, action, label, mins);
    document.getElementById('tt-manual-log-modal').remove();
    if (typeof toast === 'function') toast('Time entry logged');
    if (typeof render === 'function') render();
  }

  // Current report filters cache for re-render
  let _currentReportFilters = {};

  function _reloadReport(changedEl) {
    const container = changedEl.closest('.tt-report');
    if (!container) return;
    // Collect all filter inputs from within the report
    container.querySelectorAll('[data-filter]').forEach(el => {
      _currentReportFilters[el.dataset.filter] = el.value;
    });
    container.outerHTML = renderTimeReport(_currentReportFilters);
    // Re-render into DOM: replace the element
    // Since outerHTML replaces, we need to find target container
    const target = document.querySelector('[data-tt-report-container]');
    if (target) {
      target.innerHTML = renderTimeReport(_currentReportFilters);
    }
  }

  /* ── CSV Export Helpers ─────────────────────────────────── */

  function _entriesToCsv(entries) {
    const header = ['ID', 'Case ID', 'Action', 'Label', 'Username', 'Role', 'Estimated (min)', 'Actual (min)', 'Timestamp', 'Billed', 'Invoice ID'];
    const rows = entries.map(e => [
      e.id, e.caseId, e.action, e.label, e.username, e.role,
      e.estimatedMins, e.actualMins != null ? e.actualMins : '',
      e.timestamp, e.billed ? 'Yes' : 'No', e.invoiceId || ''
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
    return [header.join(','), ...rows].join('\n');
  }

  function _downloadCsv(filename, csvContent) {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 1000);
  }

  function _exportCaseCsv(caseId) {
    const entries = getForCase(caseId);
    if (entries.length === 0) {
      if (typeof toast === 'function') toast('No time entries to export', 'warn');
      return;
    }
    _downloadCsv(`time-log-case-${caseId}-${new Date().toISOString().slice(0,10)}.csv`, _entriesToCsv(entries));
  }

  function _exportReportCsv(filters) {
    filters = filters || _currentReportFilters || {};
    let entries = _loadLog();
    if (filters.startDate) {
      const start = new Date(filters.startDate).getTime();
      entries = entries.filter(e => new Date(e.timestamp).getTime() >= start);
    }
    if (filters.endDate) {
      const end = new Date(filters.endDate);
      end.setHours(23, 59, 59, 999);
      entries = entries.filter(e => new Date(e.timestamp).getTime() <= end.getTime());
    }
    if (filters.username) entries = entries.filter(e => e.username === filters.username);
    if (filters.visaType && typeof State !== 'undefined' && State.cases) {
      const ids = new Set(State.cases.filter(c => c.visaType === filters.visaType).map(c => c.id));
      entries = entries.filter(e => ids.has(e.caseId));
    }
    if (entries.length === 0) {
      if (typeof toast === 'function') toast('No time entries to export', 'warn');
      return;
    }
    _downloadCsv(`time-report-${new Date().toISOString().slice(0,10)}.csv`, _entriesToCsv(entries));
  }

  /* ── Public API ─────────────────────────────────────────── */

  const TimeTracker = {
    // Core
    log,
    getForCase,
    getForUser,
    totalMinsForCase,
    breakdownByRole,
    updateActual,
    markBilled,
    getUnbilledForCase,
    // Render
    renderCaseTimeLog,
    renderTimeSummary,
    renderTimeReport,
    renderSettings,
    // Settings
    getSettings,
    saveSettings,
    // Utility (exposed for external use)
    formatTime,
    // Internal UI helpers (called from inline HTML)
    _inlineEditActual,
    _saveActualInline,
    _markBilledPrompt,
    _showManualLogModal,
    _updateManualLabel,
    _submitManualLog,
    _saveSettingsFromForm,
    _resetSettingsDefaults,
    _reloadReport,
    _exportCaseCsv,
    _exportReportCsv,
  };

  window.TimeTracker = TimeTracker;

  /* ── Function Patching — Auto-log from existing globals ──── */

  // Patch saveInvoice → invoice_generated
  // Note: saveInvoice does not receive caseId; we read from State if available
  const _origSaveInvoice = window.saveInvoice;
  if (typeof _origSaveInvoice === 'function') {
    window.saveInvoice = function (...args) {
      const result = _origSaveInvoice.apply(this, args);
      // Attempt to determine current caseId from State
      try {
        const caseId = (typeof State !== 'undefined' && State.currentCase)
          ? State.currentCase
          : (args[0] || null);
        TimeTracker.log(caseId, 'invoice_generated', 'Invoice generated');
      } catch (e) { /* silent */ }
      return result;
    };
  }

  // Patch logEmailSent → email_sent (this function has caseId as first param)
  const _origLogEmailSent = window.logEmailSent;
  if (typeof _origLogEmailSent === 'function') {
    window.logEmailSent = function (caseId, ...args) {
      const result = _origLogEmailSent.apply(this, [caseId, ...args]);
      TimeTracker.log(caseId, 'email_sent', 'Email sent');
      return result;
    };
  }

  // Patch emailSend → email_sent (general email send, no caseId; use State)
  const _origEmailSend = window.emailSend;
  if (typeof _origEmailSend === 'function') {
    window.emailSend = function (...args) {
      const result = _origEmailSend.apply(this, args);
      try {
        const caseId = (typeof State !== 'undefined' && State.currentCase) ? State.currentCase : null;
        if (caseId) TimeTracker.log(caseId, 'email_sent', 'Email sent');
      } catch (e) { /* silent */ }
      return result;
    };
  }

  // Patch showRepAgreement → rep_agreement
  const _origShowRepAgreement = window.showRepAgreement;
  if (typeof _origShowRepAgreement === 'function') {
    window.showRepAgreement = function (caseId, ...args) {
      const result = _origShowRepAgreement.apply(this, [caseId, ...args]);
      TimeTracker.log(caseId, 'rep_agreement', 'Rep agreement opened');
      return result;
    };
  }

  // Patch zoomCreateMeeting → zoom_scheduled
  const _origZoomCreateMeeting = window.zoomCreateMeeting;
  if (typeof _origZoomCreateMeeting === 'function') {
    window.zoomCreateMeeting = function (...args) {
      const result = _origZoomCreateMeeting.apply(this, args);
      try {
        const caseId = (typeof State !== 'undefined' && State.zoom && State.zoom.scheduleClient)
          ? State.zoom.scheduleClient.id
          : ((typeof State !== 'undefined' && State.currentCase) ? State.currentCase : null);
        if (caseId) TimeTracker.log(caseId, 'zoom_scheduled', 'Zoom meeting scheduled');
      } catch (e) { /* silent */ }
      return result;
    };
  }

})();
