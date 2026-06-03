/* ============================================================
   Kamkhadze PA — USCIS Officer Report Module
   Requires: case-manager.js loaded first (State, CASE_STATUSES, etc.)
   SECURITY: Restricted to authenticated users with attorney/CM roles.
   ============================================================ */

const OfficerReport = (() => {

  // ---- Aggregation helpers ----

  // Return normalized officer number (trim + uppercase) or '' if blank
  function norm(raw) {
    return (raw || '').trim().toUpperCase();
  }

  // Collect all cases that have a recorded officer number.
  // Cases where uscisOfficerNumber is blank are grouped as 'UNRECORDED'.
  function getCasesWithOfficerData() {
    return (typeof State !== 'undefined' ? State.cases : []).map(c => ({
      ...c,
      _officer: norm(c.uscisOfficerNumber) || 'UNRECORDED',
    }));
  }

  // Build a map of officer → array of cases
  function groupByOfficer(cases, officerFilter) {
    const map = {};
    cases.forEach(c => {
      const o = c._officer;
      if (officerFilter && officerFilter !== 'ALL' && o !== norm(officerFilter)) return;
      if (!map[o]) map[o] = [];
      map[o].push(c);
    });
    return map;
  }

  // Days between two ISO date strings; null if either is missing
  function daysBetween(a, b) {
    if (!a || !b) return null;
    const d = Math.round((new Date(b) - new Date(a)) / 86400000);
    return isNaN(d) ? null : d;
  }

  // Compute per-officer statistics for reporting
  function computeStats(cases) {
    const total = cases.length;
    const byDecision = {};
    const byVisa = {};
    let approvals = 0, denials = 0;
    let turnaroundTotal = 0, turnaroundCount = 0;

    cases.forEach(c => {
      // Decision breakdown
      const dt = c.decisionType || 'Pending';
      byDecision[dt] = (byDecision[dt] || 0) + 1;
      if (dt === 'Approved') approvals++;
      if (dt === 'Denied')   denials++;

      // Visa type breakdown
      const vt = c.visaType || 'Unknown';
      byVisa[vt] = (byVisa[vt] || 0) + 1;

      // Turnaround: RFE response filed → decision
      const t = daysBetween(c.rfeResponseFiledDate, c.decisionDate);
      if (t !== null && t >= 0) {
        turnaroundTotal += t;
        turnaroundCount++;
      }
    });

    const approvalDenial = approvals + denials;
    const approvalRate = approvalDenial > 0 ? Math.round(approvals / approvalDenial * 100) : null;
    const avgTurnaround = turnaroundCount > 0 ? Math.round(turnaroundTotal / turnaroundCount) : null;

    return { total, byDecision, byVisa, approvals, denials, approvalRate, avgTurnaround };
  }

  // ---- CSV Export ----
  function exportCSV(rows, filename) {
    const csv = rows
      .map(r => r.map(cell => `"${String(cell == null ? '' : cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
    a.download = filename || 'officer-report.csv';
    a.click();
  }

  function exportOfficerCSV(officerFilter, dateFrom, dateTo, visaFilter, decisionFilter, statusFilter) {
    const cases = getFilteredCases(officerFilter, dateFrom, dateTo, visaFilter, decisionFilter, statusFilter);
    const rows = [
      ['Officer #', 'Client', 'Visa Type', 'Filing Type', 'Status', 'Decision Type',
       'Decision Date', 'RFE Response Filed', 'Days to Decision', 'Receipt #', 'Assigned Attorney'],
    ];
    cases.forEach(c => {
      rows.push([
        c._officer,
        `${c.firstName} ${c.lastName}`,
        c.visaType || '',
        c.filingType || '',
        c.statusCode || c.stage || '',
        c.decisionType || '',
        c.decisionDate || '',
        c.rfeResponseFiledDate || '',
        daysBetween(c.rfeResponseFiledDate, c.decisionDate) ?? '',
        c.uscisReceiptNumber || '',
        c.assignedAttorney || '',
      ]);
    });
    exportCSV(rows, `officer-report-${new Date().toISOString().slice(0,10)}.csv`);
  }

  // ---- Filtering ----
  function getFilteredCases(officerFilter, dateFrom, dateTo, visaFilter, decisionFilter, statusFilter) {
    let cases = getCasesWithOfficerData();

    if (officerFilter && officerFilter !== 'ALL') {
      cases = cases.filter(c => c._officer === norm(officerFilter));
    }
    if (dateFrom) {
      cases = cases.filter(c => c.decisionDate && c.decisionDate >= dateFrom);
    }
    if (dateTo) {
      cases = cases.filter(c => c.decisionDate && c.decisionDate <= dateTo);
    }
    if (visaFilter) {
      cases = cases.filter(c => c.visaType === visaFilter);
    }
    if (decisionFilter) {
      cases = cases.filter(c => (c.decisionType || '') === decisionFilter);
    }
    if (statusFilter) {
      cases = cases.filter(c => (c.statusCode || c.stage) === statusFilter);
    }
    return cases;
  }

  // ---- Sorting ----
  function sortOfficerGroups(groups, sortBy) {
    return groups.slice().sort((a, b) => {
      switch (sortBy) {
        case 'approval_rate':
          return (b.stats.approvalRate ?? -1) - (a.stats.approvalRate ?? -1);
        case 'avg_days':
          return (a.stats.avgTurnaround ?? 9999) - (b.stats.avgTurnaround ?? 9999);
        case 'denials':
          return b.stats.denials - a.stats.denials;
        case 'total':
        default:
          return b.stats.total - a.stats.total;
      }
    });
  }

  // ---- State ----
  let _state = {
    officerFilter:  '',
    dateFrom:       '',
    dateTo:         '',
    visaFilter:     '',
    decisionFilter: '',
    statusFilter:   '',
    sortBy:         'total',
    expandedOfficer: null,
  };

  // Apply a window-level pre-filter (set by deep-link from case detail)
  function applyWindowFilter() {
    if (window._officerFilter) {
      _state.officerFilter = window._officerFilter;
      window._officerFilter = null;
    }
  }

  // ---- Rendering ----

  function renderPage() {
    // SECURITY: restrict to authenticated users with attorney/CM roles
    if (typeof RBAC !== 'undefined' && !RBAC.can('view_reports')) {
      return `<div class="topbar"><div class="topbar-title">Officer Report</div></div>
        <div class="content">
          <div class="empty-state">
            <div class="empty-state-icon">🔒</div>
            <h3>Access Restricted</h3>
            <p>The Officer Report requires attorney or case manager permissions.</p>
          </div>
        </div>`;
    }

    applyWindowFilter();

    const cases = getFilteredCases(
      _state.officerFilter, _state.dateFrom, _state.dateTo,
      _state.visaFilter, _state.decisionFilter, _state.statusFilter
    );

    const officerMap = groupByOfficer(getCasesWithOfficerData(),
      _state.officerFilter || 'ALL');

    const officerGroups = Object.entries(
      groupByOfficer(cases, 'ALL')
    ).map(([officer, ocs]) => ({
      officer,
      cases: ocs,
      stats: computeStats(ocs),
    }));

    const sorted = sortOfficerGroups(officerGroups, _state.sortBy);

    // All unique officer numbers for the filter dropdown
    const allOfficers = [...new Set(
      getCasesWithOfficerData().map(c => c._officer).filter(o => o !== 'UNRECORDED')
    )].sort();

    // Summary stats across all filtered cases
    const totalStats = computeStats(cases);
    const uniqueOfficerCount = new Set(cases.map(c => c._officer).filter(o => o !== 'UNRECORDED')).size;

    return `
      <div class="topbar">
        <div class="topbar-title">USCIS Officer Report</div>
        <div class="topbar-actions">
          <button class="btn btn-ghost btn-sm export-btn"
            onclick="OfficerReport._exportCurrent()">
            ↓ CSV
          </button>
          <button class="btn btn-ghost btn-sm export-btn"
            onclick="OfficerReport._print()">
            ⎙ Print
          </button>
        </div>
      </div>
      <div class="content">
        ${_renderFilters(allOfficers)}
        ${_renderSummaryCards(totalStats, uniqueOfficerCount, cases.length)}
        ${_renderLimitation()}
        ${sorted.length === 0
          ? _renderEmpty()
          : _renderOfficerTable(sorted, cases)}
      </div>`;
  }

  function _renderFilters(allOfficers) {
    const visaTypes = [...new Set(State.cases.map(c => c.visaType).filter(Boolean))].sort();
    return `
      <div class="panel" style="margin-bottom:20px">
        <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end">
          <div class="field" style="min-width:180px;margin-bottom:0">
            <label>Officer Number</label>
            <select onchange="OfficerReport._filter('officerFilter',this.value)">
              <option value="">All Officers</option>
              <option value="">— Unrecorded —</option>
              ${allOfficers.map(o => `<option value="${escAttr(o)}" ${_state.officerFilter===o?'selected':''}>${escHtml(o)}</option>`).join('')}
            </select>
          </div>
          <div class="field" style="margin-bottom:0">
            <label>Decision Date From</label>
            <input type="date" value="${escAttr(_state.dateFrom)}"
              onchange="OfficerReport._filter('dateFrom',this.value)" />
          </div>
          <div class="field" style="margin-bottom:0">
            <label>To</label>
            <input type="date" value="${escAttr(_state.dateTo)}"
              onchange="OfficerReport._filter('dateTo',this.value)" />
          </div>
          <div class="field" style="min-width:140px;margin-bottom:0">
            <label>Case Type</label>
            <select onchange="OfficerReport._filter('visaFilter',this.value)">
              <option value="">All Types</option>
              ${visaTypes.map(v => `<option value="${escAttr(v)}" ${_state.visaFilter===v?'selected':''}>${escHtml(v)}</option>`).join('')}
            </select>
          </div>
          <div class="field" style="min-width:140px;margin-bottom:0">
            <label>Decision Type</label>
            <select onchange="OfficerReport._filter('decisionFilter',this.value)">
              <option value="">All Decisions</option>
              ${['Approved','Denied','NOID','Second RFE','Pending'].map(d =>
                `<option value="${escAttr(d)}" ${_state.decisionFilter===d?'selected':''}>${escHtml(d)}</option>`).join('')}
            </select>
          </div>
          <div class="field" style="min-width:140px;margin-bottom:0">
            <label>Final Status</label>
            <select onchange="OfficerReport._filter('statusFilter',this.value)">
              <option value="">All Statuses</option>
              ${(typeof CASE_STATUSES !== 'undefined' ? CASE_STATUSES : []).map(s =>
                `<option value="${escAttr(s.value)}" ${_state.statusFilter===s.value?'selected':''}>${escHtml(s.label)}</option>`).join('')}
            </select>
          </div>
          <div class="field" style="min-width:140px;margin-bottom:0">
            <label>Sort By</label>
            <select onchange="OfficerReport._filter('sortBy',this.value)">
              <option value="total" ${_state.sortBy==='total'?'selected':''}>Total Cases</option>
              <option value="approval_rate" ${_state.sortBy==='approval_rate'?'selected':''}>Approval Rate</option>
              <option value="avg_days" ${_state.sortBy==='avg_days'?'selected':''}>Avg Decision Days</option>
              <option value="denials" ${_state.sortBy==='denials'?'selected':''}>Denial Count</option>
            </select>
          </div>
          ${(_state.officerFilter||_state.dateFrom||_state.dateTo||_state.visaFilter||_state.decisionFilter||_state.statusFilter) ?
            `<button class="btn btn-ghost btn-sm" style="margin-bottom:0" onclick="OfficerReport._clearFilters()">Clear Filters</button>` : ''}
        </div>
      </div>`;
  }

  function _renderSummaryCards(stats, uniqueOfficers, totalCases) {
    return `
      <div class="stats-grid" style="margin-bottom:24px">
        <div class="stat-card">
          <div class="stat-card-label">Unique Officers</div>
          <div class="stat-card-value">${uniqueOfficers}</div>
          <div class="stat-card-sub">With recorded officer numbers</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-label">Cases in View</div>
          <div class="stat-card-value">${totalCases}</div>
          <div class="stat-card-sub">After applied filters</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-label">Overall Approval Rate</div>
          <div class="stat-card-value" style="color:${stats.approvalRate !== null ? (stats.approvalRate >= 70 ? '#16A34A' : stats.approvalRate >= 40 ? '#D97706' : '#DC2626') : 'var(--text-3)'}">
            ${stats.approvalRate !== null ? stats.approvalRate + '%' : '—'}
          </div>
          <div class="stat-card-sub">${stats.approvals} approved / ${stats.denials} denied</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-label">Avg Days to Decision</div>
          <div class="stat-card-value">${stats.avgTurnaround !== null ? stats.avgTurnaround : '—'}</div>
          <div class="stat-card-sub">RFE response → decision</div>
        </div>
      </div>`;
  }

  function _renderLimitation() {
    return `
      <div style="padding:10px 14px;background:#FFF9EC;border:1px solid #F0D080;border-radius:6px;font-size:12px;color:#92600A;margin-bottom:20px">
        <strong>Note:</strong> This system records one officer per case. If a case had multiple RFEs, the officer
        number recorded is used for all RFE decision attribution. For multi-RFE cases, update the officer number
        to reflect the officer on the final RFE response.
      </div>`;
  }

  function _renderEmpty() {
    return `
      <div class="empty-state">
        <div class="empty-state-icon" style="font-size:48px">🏛️</div>
        <h3>No Officer Data</h3>
        <p>No cases match the current filters, or no USCIS officer numbers have been recorded yet.</p>
        <p style="font-size:13px;color:var(--text-3);margin-top:8px">
          Add officer numbers by opening a case → USCIS Status tab → Officer Number field.
        </p>
      </div>`;
  }

  function _renderOfficerTable(groups, allCases) {
    return `
      <div id="print-region">
        <div class="report-header" style="margin-bottom:16px;display:flex;align-items:center;justify-content:space-between">
          <div>
            <div style="font-family:var(--font-serif);font-size:20px;color:var(--navy)">USCIS Officer Performance Report</div>
            <div style="font-size:12px;color:var(--text-3)">Generated ${new Date().toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'})} · Kamkhadze PA</div>
          </div>
        </div>

        ${groups.map(g => _renderOfficerRow(g)).join('')}
      </div>`;
  }

  function _renderOfficerRow(g) {
    const s = g.stats;
    const isExpanded = _state.expandedOfficer === g.officer;
    const isUnrecorded = g.officer === 'UNRECORDED';

    const approvalColor = s.approvalRate === null ? '#6B7280'
      : s.approvalRate >= 70 ? '#16A34A'
      : s.approvalRate >= 40 ? '#D97706' : '#DC2626';

    const visaBreakdown = Object.entries(s.byVisa)
      .sort((a,b) => b[1] - a[1])
      .map(([v,n]) => `<span style="font-size:11px;padding:2px 7px;border-radius:10px;background:rgba(10,22,40,0.07);margin:2px">${escHtml(v)}: ${n}</span>`)
      .join('');

    const decisionBreakdown = Object.entries(s.byDecision)
      .sort((a,b) => b[1] - a[1])
      .map(([d,n]) => {
        const col = d==='Approved'?'#16A34A':d==='Denied'?'#DC2626':d==='NOID'?'#7C3AED':'#D97706';
        return `<span style="font-size:11px;padding:2px 7px;border-radius:10px;background:rgba(0,0,0,0.05);color:${col};font-weight:600;margin:2px">${escHtml(d)}: ${n}</span>`;
      }).join('');

    return `
      <div class="panel" style="margin-bottom:12px;${isUnrecorded?'opacity:0.75':''}">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px">
          <div style="display:flex;align-items:center;gap:16px">
            <div>
              <div style="font-size:16px;font-weight:700;color:var(--navy);font-family:monospace;letter-spacing:0.05em">
                ${isUnrecorded ? '<span style="color:var(--text-3);font-style:italic">Officer not recorded</span>' : escHtml(g.officer)}
              </div>
              <div style="margin-top:6px;display:flex;flex-wrap:wrap;gap:4px">${visaBreakdown}</div>
            </div>
          </div>

          <div style="display:flex;gap:24px;align-items:center;flex-wrap:wrap">
            <div style="text-align:center">
              <div style="font-size:22px;font-weight:700;color:var(--navy)">${s.total}</div>
              <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.1em;color:var(--text-3)">Cases</div>
            </div>
            <div style="text-align:center">
              <div style="font-size:22px;font-weight:700;color:${approvalColor}">
                ${s.approvalRate !== null ? s.approvalRate + '%' : '—'}
              </div>
              <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.1em;color:var(--text-3)">Approval Rate</div>
            </div>
            <div style="text-align:center">
              <div style="font-size:22px;font-weight:700;color:var(--navy)">${s.avgTurnaround !== null ? s.avgTurnaround + 'd' : '—'}</div>
              <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.1em;color:var(--text-3)">Avg Days</div>
            </div>
            <div style="text-align:center">
              <div style="font-size:22px;font-weight:700;color:#DC2626">${s.denials}</div>
              <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.1em;color:var(--text-3)">Denials</div>
            </div>
            <button class="btn btn-ghost btn-sm" onclick="OfficerReport._toggleExpand('${escAttr(g.officer)}')">
              ${isExpanded ? 'Collapse ▲' : 'Show Cases ▼'}
            </button>
          </div>
        </div>

        <div style="margin-top:10px;display:flex;flex-wrap:wrap;gap:4px">${decisionBreakdown}</div>

        ${isExpanded ? _renderCaseList(g.cases) : ''}
      </div>`;
  }

  function _renderCaseList(cases) {
    return `
      <div style="margin-top:16px;border-top:1px solid var(--border);padding-top:16px">
        <div style="font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:var(--text-3);margin-bottom:10px">
          Underlying Cases (${cases.length})
        </div>
        <table class="report-table" style="width:100%">
          <thead><tr>
            <th>Client</th>
            <th>Case Type</th>
            <th>Status</th>
            <th>Decision</th>
            <th>Decision Date</th>
            <th>RFE Response Filed</th>
            <th>Days</th>
            <th>Receipt #</th>
            <th>Attorney</th>
            <th></th>
          </tr></thead>
          <tbody>
          ${cases.map(c => {
            const days = daysBetween(c.rfeResponseFiledDate, c.decisionDate);
            const decCol = c.decisionType==='Approved'?'#16A34A':c.decisionType==='Denied'?'#DC2626':c.decisionType==='NOID'?'#7C3AED':'inherit';
            return `<tr>
              <td style="font-weight:500">${escHtml(c.firstName)} ${escHtml(c.lastName)}</td>
              <td>${escHtml(c.visaType||'—')}</td>
              <td>${typeof stageBadge !== 'undefined' ? stageBadge(c.statusCode||c.stage) : escHtml(c.statusCode||c.stage||'—')}</td>
              <td style="color:${decCol};font-weight:600">${escHtml(c.decisionType||'—')}</td>
              <td style="font-size:12px">${c.decisionDate ? (typeof fmtDate !== 'undefined' ? fmtDate(c.decisionDate) : c.decisionDate) : '—'}</td>
              <td style="font-size:12px">${c.rfeResponseFiledDate ? (typeof fmtDate !== 'undefined' ? fmtDate(c.rfeResponseFiledDate) : c.rfeResponseFiledDate) : '—'}</td>
              <td style="font-size:12px;${days!==null&&days>60?'color:#DC2626;font-weight:600':''}">
                ${days !== null ? days + 'd' : '—'}
              </td>
              <td style="font-family:monospace;font-size:11px">${escHtml(c.uscisReceiptNumber||'—')}</td>
              <td style="font-size:12px">${escHtml(c.assignedAttorney||'—')}</td>
              <td>
                <button class="btn btn-ghost btn-sm" onclick="navigate('case-detail','${c.id}')">→</button>
              </td>
            </tr>`;
          }).join('')}
          </tbody>
        </table>
      </div>`;
  }

  // ---- Public API ----
  return {
    renderPage,
    computeStats,       // exposed for tests
    daysBetween,        // exposed for tests
    normalizeOfficer: norm, // exposed for tests

    _filter(key, value) {
      _state[key] = value;
      document.getElementById('main-content').innerHTML = renderPage();
    },

    _clearFilters() {
      _state.officerFilter = _state.dateFrom = _state.dateTo =
        _state.visaFilter = _state.decisionFilter = _state.statusFilter = '';
      document.getElementById('main-content').innerHTML = renderPage();
    },

    _toggleExpand(officer) {
      _state.expandedOfficer = _state.expandedOfficer === officer ? null : officer;
      document.getElementById('main-content').innerHTML = renderPage();
    },

    _exportCurrent() {
      exportOfficerCSV(
        _state.officerFilter, _state.dateFrom, _state.dateTo,
        _state.visaFilter, _state.decisionFilter, _state.statusFilter
      );
    },

    _print() {
      const region = document.getElementById('print-region');
      if (!region) return;
      const w = window.open('', '_blank', 'width=900,height=700');
      w.document.write(`<!DOCTYPE html><html><head>
        <title>Officer Report — Kamkhadze PA</title>
        <style>
          body{font-family:Georgia,serif;color:#0A1628;max-width:100%;padding:20px}
          table{width:100%;border-collapse:collapse;font-size:12px}
          th{background:#0A1628;color:#fff;padding:8px;text-align:left}
          td{padding:6px 8px;border-bottom:1px solid #E8ECF0}
          .panel{border:1px solid #E8ECF0;border-radius:8px;padding:16px;margin-bottom:12px}
          @media print{button{display:none}}
        </style></head><body>${region.innerHTML}</body></html>`);
      w.document.close();
      setTimeout(() => w.print(), 500);
    },
  };
})();
