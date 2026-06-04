/* ============================================================
   Kamkhadze PA — Case Manager v3
   New: Invoices · Fees · Activity Log · Key Dates · Alerts
        Multi-Case Clients · Enhanced Emails · Consultation History
        Stage Confirmation · Social Media UI · Reports
   Load AFTER case-manager-v2.js
   ============================================================ */

// ================================================================
// SECTION 1 — State Extensions
// ================================================================
(function _v3StateInit() {
  if (!State.feeTemplates) {
    State.feeTemplates = JSON.parse(localStorage.getItem('km_fee_templates') || JSON.stringify([
      { id: 'ft1', name: 'Initial Consultation', amount: 350,  category: 'consultation', description: 'Strategy consultation fee' },
      { id: 'ft2', name: 'RFE Consultation',     amount: 350,  category: 'consultation', description: 'RFE strategy consultation fee' },
      { id: 'ft3', name: 'Follow-up Call',        amount: 150,  category: 'consultation', description: '30-minute follow-up call' },
      { id: 'ft4', name: 'Attorney Retainer',     amount: 5000, category: 'retainer',     description: 'Legal representation retainer' },
      { id: 'ft5', name: 'Filing Fees (O-1A)',    amount: 460,  category: 'filing',       description: 'USCIS I-129 filing fee' },
      { id: 'ft6', name: 'Filing Fees (EB-1A)',   amount: 700,  category: 'filing',       description: 'USCIS I-140 filing fee' },
      { id: 'ft7', name: 'Premium Processing',    amount: 2805, category: 'filing',       description: 'USCIS premium processing fee' },
      { id: 'ft8', name: 'RFE Response Fee',      amount: 1500, category: 'legal',        description: 'Attorney fee for RFE response' },
    ]));
  }

  if (!State.socialMedia) {
    State.socialMedia = {
      activeTab: 'assistant',
      messages: JSON.parse(localStorage.getItem('km_social_messages') || '[]'),
      pending: JSON.parse(localStorage.getItem('km_social_pending') || '[]'),
      accounts: JSON.parse(localStorage.getItem('km_social_accounts') || JSON.stringify({
        facebook:  { connected: false, name: '', token: '' },
        linkedin:  { connected: false, name: '', token: '' },
        instagram: { connected: false, name: '', token: '' },
        website:   { connected: false, url: '',  token: '' },
      })),
      input: '',
    };
  }

  if (!State.questionnaire) {
    State.questionnaire = {
      templates: JSON.parse(localStorage.getItem('km_questionnaire_templates') || '[]'),
      responses: JSON.parse(localStorage.getItem('km_questionnaire_responses') || '[]'),
      activeTemplate: null,
    };
  }

  if (!State.reports) {
    State.reports = { activeTab: 'pipeline' };
  }
})();

// ================================================================
// SECTION 2 — Case Model Migration
// Ensures every case has all v3 fields without losing existing data
// ================================================================
function _v3MigrateCase(c) {
  if (!c.fees)                    c.fees                    = [];
  if (!c.invoices)                c.invoices                = [];
  if (!c.activityLog)             c.activityLog             = [];
  if (!c.communicationLog)        c.communicationLog        = [];
  if (!c.consultationHistory)     c.consultationHistory     = [];
  if (!c.rfeResponseDue)          c.rfeResponseDue          = '';
  if (!c.rfeReceivedDate)         c.rfeReceivedDate         = '';
  if (!c.statusExpirationDate)    c.statusExpirationDate    = '';
  if (!c.representationAgreementDate) c.representationAgreementDate = c.retainerDate || '';
  if (!c.nextFeeDescription)      c.nextFeeDescription      = '';
  if (typeof c.consultationFeePaid === 'undefined') c.consultationFeePaid = false;
  if (!c.consultationFeeAmount)   c.consultationFeeAmount   = '';
  if (!c.consultationFeeDate)     c.consultationFeeDate     = '';
  if (!c.dropboxFolderStructure)  c.dropboxFolderStructure  = '';
  return c;
}

// Run migration on all existing cases when v3 loads
function _v3RunMigration() {
  if (!State.cases) return;
  State.cases.forEach(_v3MigrateCase);
}

// ================================================================
// SECTION 3 — Utility Helpers
// ================================================================

// Days between two ISO dates (positive = future)
function daysBetween(isoA, isoB) {
  const a = new Date(isoA), b = new Date(isoB || new Date().toISOString());
  return Math.round((a - b) / (1000 * 60 * 60 * 24));
}

function daysFromNow(iso) {
  if (!iso) return null;
  return daysBetween(iso, new Date().toISOString());
}

function fmtCurrency(n) {
  if (!n && n !== 0) return '—';
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtRelDate(iso) {
  if (!iso) return '—';
  const d = daysFromNow(iso);
  if (d === 0) return 'Today';
  if (d === 1) return 'Tomorrow';
  if (d === -1) return 'Yesterday';
  if (d > 0) return `In ${d} days`;
  return `${Math.abs(d)} days ago`;
}

// Generate incremental invoice number
function nextInvoiceNumber() {
  const all = State.cases.flatMap(c => c.invoices || []);
  const nums = all.map(inv => parseInt((inv.number || '').replace(/[^0-9]/g, '') || '0'));
  const max = nums.length ? Math.max(...nums) : 1000;
  return `INV-${String(max + 1).padStart(4, '0')}`;
}

// ================================================================
// SECTION 4 — Activity Log
// ================================================================

function activityAdd(caseId, type, description, details, linkedId) {
  const c = getCase(caseId);
  if (!c) return;
  if (!c.activityLog) c.activityLog = [];
  c.activityLog.unshift({
    id: uuid(),
    type,          // 'email_sent'|'email_received'|'meeting'|'fee_paid'|'fee_created'|'call'|'note'|'stage_change'|'document'|'invoice'
    date: new Date().toISOString(),
    description,
    details: details || '',
    linkedId: linkedId || '',
    user: Auth.username || 'System',
  });
  c.updatedAt = new Date().toISOString();
  Storage.save();
}

const ACTIVITY_ICONS = {
  email_sent:     '✉',
  email_received: '📩',
  meeting:        '📹',
  fee_paid:       '✅',
  fee_created:    '💰',
  call:           '📞',
  note:           '📝',
  stage_change:   '🔄',
  document:       '📄',
  invoice:        '🧾',
  default:        '•',
};

function renderActivityLog(c, limit) {
  const log = (c.activityLog || []).slice(0, limit || 999);
  if (!log.length) {
    return `<div style="text-align:center;padding:32px;color:var(--text-3);font-size:13px;">No activity recorded yet. Activity will appear here as you work on this case.</div>`;
  }
  return log.map(e => `
    <div style="display:flex;gap:12px;padding:10px 0;border-bottom:1px solid var(--border-2);">
      <div style="width:28px;height:28px;background:var(--surface-2);border:1px solid var(--border-2);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;flex-shrink:0;">
        ${ACTIVITY_ICONS[e.type] || ACTIVITY_ICONS.default}
      </div>
      <div style="flex:1;min-width:0;">
        <div style="font-size:13px;color:var(--text);font-weight:500;">${escHtml(e.description)}</div>
        ${e.details ? `<div style="font-size:12px;color:var(--text-3);margin-top:2px;white-space:pre-wrap;">${escHtml(e.details)}</div>` : ''}
        <div style="font-size:11px;color:var(--text-3);margin-top:3px;">${fmtDate(e.date)} · ${escHtml(e.user || '')}</div>
      </div>
    </div>`).join('');
}

// ================================================================
// SECTION 5 — Fee Management
// ================================================================

function saveFeeTemplates() {
  localStorage.setItem('km_fee_templates', JSON.stringify(State.feeTemplates));
}

function createFee(caseId, feeData) {
  const c = getCase(caseId);
  if (!c) return null;
  if (!c.fees) c.fees = [];
  const fee = {
    id: uuid(),
    caseId,
    type:        feeData.type        || 'custom',
    description: feeData.description || '',
    amount:      parseFloat(feeData.amount) || 0,
    dueDate:     feeData.dueDate     || '',
    paid:        feeData.paid        || false,
    paidDate:    feeData.paidDate    || '',
    paidAmount:  feeData.paidAmount  || '',
    linkedMeetingId: feeData.linkedMeetingId || '',
    invoiceId:   '',
    createdAt:   new Date().toISOString(),
    notes:       feeData.notes       || '',
  };
  c.fees.push(fee);
  activityAdd(caseId, 'fee_created', `Fee created: ${fee.description}`, fmtCurrency(fee.amount));
  c.updatedAt = new Date().toISOString();
  Storage.save();
  return fee;
}

function markFeePaid(caseId, feeId, paidAmount, paidDate) {
  const c = getCase(caseId);
  if (!c) return;
  const fee = (c.fees || []).find(f => f.id === feeId);
  if (!fee) return;
  fee.paid       = true;
  fee.paidDate   = paidDate || today();
  fee.paidAmount = paidAmount || String(fee.amount);
  activityAdd(caseId, 'fee_paid', `Payment received: ${fee.description}`, fmtCurrency(fee.paidAmount), feeId);
  c.updatedAt = new Date().toISOString();
  Storage.save();
  toast(`Payment recorded: ${fee.description}`);
  // Auto-confirm meeting if linked
  if (fee.linkedMeetingId) {
    const m = State.zoom.meetings.find(m => m.id === fee.linkedMeetingId);
    if (m) { m.feePaid = true; m.feeConfirmed = true; zoomSaveMeetings(); toast('Meeting confirmed — fee paid ✓'); }
  }
}

function getCaseFeeBalance(c) {
  const fees = c.fees || [];
  const totalCharged = fees.reduce((s, f) => s + (f.amount || 0), 0);
  const totalPaid    = fees.filter(f => f.paid).reduce((s, f) => s + (parseFloat(f.paidAmount) || f.amount || 0), 0);
  const overdue      = fees.filter(f => !f.paid && f.dueDate && new Date(f.dueDate) < new Date());
  const nextDue      = fees.filter(f => !f.paid).sort((a, b) => new Date(a.dueDate || '9999') - new Date(b.dueDate || '9999'))[0];
  return { totalCharged, totalPaid, balance: totalCharged - totalPaid, overdue, nextDue };
}

function renderFeesTab(c) {
  const fees = c.fees || [];
  const balance = getCaseFeeBalance(c);
  const unpaid = fees.filter(f => !f.paid);
  const paid   = fees.filter(f => f.paid);

  return `
    <div class="two-col" style="gap:16px;margin-bottom:20px;">
      ${_feeStatCard('Total Charged', fmtCurrency(balance.totalCharged), 'var(--text)')}
      ${_feeStatCard('Total Paid',    fmtCurrency(balance.totalPaid),    'var(--green)')}
      ${_feeStatCard('Balance Due',   fmtCurrency(balance.balance),      balance.balance > 0 ? 'var(--yellow)' : 'var(--green)')}
      ${_feeStatCard('Overdue Items', String(balance.overdue.length),    balance.overdue.length > 0 ? 'var(--red)' : 'var(--text-3)')}
    </div>

    ${balance.nextDue ? `
    <div class="panel" style="border-color:rgba(251,191,36,0.3);background:var(--yellow-dim);margin-bottom:16px;">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;">
        <div>
          <div style="font-size:13px;font-weight:600;color:var(--yellow);">⏰ Next Payment Due</div>
          <div style="font-size:13px;color:var(--text);margin-top:2px;">${escHtml(balance.nextDue.description)} — ${fmtCurrency(balance.nextDue.amount)}</div>
          ${balance.nextDue.dueDate ? `<div style="font-size:12px;color:var(--text-3);">${fmtDate(balance.nextDue.dueDate)} (${fmtRelDate(balance.nextDue.dueDate)})</div>` : ''}
        </div>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-gold btn-sm" onclick="showMarkFeePaidModal('${c.id}','${balance.nextDue.id}')">Mark Paid</button>
          <button class="btn btn-ghost btn-sm" onclick="showSendInvoiceEmail('${c.id}','${balance.nextDue.id}')">✉ Send Invoice</button>
        </div>
      </div>
    </div>` : ''}

    <div class="panel">
      <div class="panel-title">
        Fees &amp; Charges
        <div style="display:flex;gap:8px;">
          <button class="btn btn-ghost btn-sm" onclick="showAddFeeModal('${c.id}')">+ Add Fee</button>
          <button class="btn btn-gold btn-sm" onclick="showCreateInvoiceModal('${c.id}')">🧾 Create Invoice</button>
        </div>
      </div>

      ${unpaid.length ? `
      <div style="margin-bottom:16px;">
        <div style="font-size:11px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:var(--text-3);margin-bottom:8px;">Unpaid</div>
        ${unpaid.map(f => _renderFeeRow(c.id, f)).join('')}
      </div>` : ''}

      ${paid.length ? `
      <div>
        <div style="font-size:11px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:var(--text-3);margin-bottom:8px;">Paid</div>
        ${paid.map(f => _renderFeeRow(c.id, f)).join('')}
      </div>` : ''}

      ${!fees.length ? `<div style="text-align:center;padding:32px;color:var(--text-3);font-size:13px;">No fees added yet.<br><button class="btn btn-gold btn-sm" style="margin-top:12px;" onclick="showAddFeeModal('${c.id}')">Add First Fee</button></div>` : ''}
    </div>

    <div class="panel">
      <div class="panel-title">
        Invoices
        <button class="btn btn-ghost btn-sm" onclick="showCreateInvoiceModal('${c.id}')">+ New Invoice</button>
      </div>
      ${_renderInvoiceList(c)}
    </div>`;
}

function _feeStatCard(label, value, color) {
  return `<div class="panel" style="text-align:center;padding:16px;">
    <div style="font-size:11px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:var(--text-3);margin-bottom:6px;">${label}</div>
    <div style="font-family:var(--font-serif);font-size:24px;font-weight:600;color:${color};">${value}</div>
  </div>`;
}

function _renderFeeRow(caseId, f) {
  const overdue = !f.paid && f.dueDate && new Date(f.dueDate) < new Date();
  return `
    <div style="display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:var(--radius);margin-bottom:4px;background:var(--surface-2);" onmouseover="this.style.background='var(--surface-3)'" onmouseout="this.style.background='var(--surface-2)'">
      <div style="width:8px;height:8px;border-radius:50%;background:${f.paid ? 'var(--green)' : overdue ? 'var(--red)' : 'var(--yellow)'};flex-shrink:0;"></div>
      <div style="flex:1;min-width:0;">
        <div style="font-size:13px;color:var(--text);font-weight:500;">${escHtml(f.description)}</div>
        <div style="font-size:11px;color:var(--text-3);">
          ${f.paid ? `Paid ${fmtDate(f.paidDate)} · ${fmtCurrency(f.paidAmount || f.amount)}` : f.dueDate ? `Due ${fmtDate(f.dueDate)}${overdue ? ' — <span style="color:var(--red)">OVERDUE</span>' : ''}` : 'No due date'}
          ${f.notes ? ` · ${escHtml(f.notes)}` : ''}
        </div>
      </div>
      <div style="font-size:14px;font-weight:600;color:${f.paid ? 'var(--text-3)' : 'var(--text)'};">${fmtCurrency(f.amount)}</div>
      <div style="display:flex;gap:6px;">
        ${!f.paid ? `<button class="btn btn-ghost btn-sm" onclick="showMarkFeePaidModal('${caseId}','${f.id}')">Mark Paid</button>` : ''}
        <button class="btn btn-ghost btn-sm" style="color:var(--red)" onclick="deleteFee('${caseId}','${f.id}')">✕</button>
      </div>
    </div>`;
}

function showAddFeeModal(caseId) {
  const templates = State.feeTemplates || [];
  showModal(`
    <div class="modal" style="max-width:480px">
      <div class="modal-header"><h3>Add Fee</h3><button class="modal-close" onclick="closeModal()">×</button></div>
      <div class="modal-body">
        <div class="field">
          <label>Quick Select from Template</label>
          <select id="af-template" onchange="v3FeeFromTemplate(this.value)">
            <option value="">— Custom fee —</option>
            ${templates.map(t => `<option value="${escAttr(JSON.stringify({d:t.name,a:t.amount,tp:t.category}))}">${escHtml(t.name)} — ${fmtCurrency(t.amount)}</option>`).join('')}
          </select>
        </div>
        <div class="field"><label>Description *</label><input id="af-desc" placeholder="e.g. Initial consultation fee" /></div>
        <div class="field-row">
          <div class="field"><label>Amount ($) *</label><input id="af-amount" type="number" placeholder="0.00" /></div>
          <div class="field"><label>Due Date</label><input id="af-due" type="date" /></div>
        </div>
        <div class="field">
          <label>Type</label>
          <select id="af-type">
            <option value="consultation">Consultation</option>
            <option value="retainer">Retainer</option>
            <option value="filing">Filing Fee</option>
            <option value="legal">Legal Fee</option>
            <option value="custom">Custom</option>
          </select>
        </div>
        <div class="field"><label>Notes</label><input id="af-notes" placeholder="Optional notes" /></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
        <button class="btn btn-gold" onclick="saveAddFee('${caseId}')">Add Fee</button>
      </div>
    </div>`);
}

function v3FeeFromTemplate(val) {
  if (!val) return;
  try {
    const t = JSON.parse(val);
    const d = document.getElementById('af-desc'); if (d) d.value = t.d || '';
    const a = document.getElementById('af-amount'); if (a) a.value = t.a || '';
    const tp = document.getElementById('af-type'); if (tp) tp.value = t.tp || 'custom';
  } catch(e) {}
}

function saveAddFee(caseId) {
  const desc   = document.getElementById('af-desc')?.value.trim();
  const amount = document.getElementById('af-amount')?.value;
  if (!desc || !amount) { toast('Description and amount are required', 'warn'); return; }
  createFee(caseId, {
    description: desc,
    amount,
    dueDate: document.getElementById('af-due')?.value || '',
    type:    document.getElementById('af-type')?.value || 'custom',
    notes:   document.getElementById('af-notes')?.value || '',
  });
  closeModal();
  toast('Fee added');
  rerenderTab(caseId);
}

function showMarkFeePaidModal(caseId, feeId) {
  const c = getCase(caseId);
  const fee = (c?.fees || []).find(f => f.id === feeId);
  if (!fee) return;
  showModal(`
    <div class="modal" style="max-width:400px">
      <div class="modal-header"><h3>Record Payment</h3><button class="modal-close" onclick="closeModal()">×</button></div>
      <div class="modal-body">
        <div style="background:var(--surface-2);border:1px solid var(--border-2);border-radius:var(--radius);padding:12px;margin-bottom:16px;">
          <div style="font-size:13px;font-weight:600;color:var(--text)">${escHtml(fee.description)}</div>
          <div style="font-size:13px;color:var(--gold);margin-top:2px;">Amount due: ${fmtCurrency(fee.amount)}</div>
        </div>
        <div class="field-row">
          <div class="field"><label>Amount Paid ($)</label><input id="mp-amount" type="number" value="${fee.amount}" /></div>
          <div class="field"><label>Date Received</label><input id="mp-date" type="date" value="${today()}" /></div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
        <button class="btn btn-gold" onclick="saveMarkPaid('${caseId}','${feeId}')">Confirm Payment</button>
      </div>
    </div>`);
}

function saveMarkPaid(caseId, feeId) {
  const amount = document.getElementById('mp-amount')?.value;
  const date   = document.getElementById('mp-date')?.value;
  markFeePaid(caseId, feeId, amount, date);
  closeModal();
  rerenderTab(caseId);
}

function deleteFee(caseId, feeId) {
  const c = getCase(caseId);
  if (!c) return;
  const fee = (c.fees || []).find(f => f.id === feeId);
  if (!fee) return;
  if (!confirm(`Delete fee "${fee.description}"?`)) return;
  c.fees = c.fees.filter(f => f.id !== feeId);
  c.updatedAt = new Date().toISOString();
  Storage.save();
  toast('Fee removed');
  rerenderTab(caseId);
}

// ================================================================
// SECTION 6 — Invoice System
// ================================================================

function createInvoice(caseId, data) {
  const c = getCase(caseId);
  if (!c) return null;
  if (!c.invoices) c.invoices = [];
  const inv = {
    id:         uuid(),
    caseId,
    number:     nextInvoiceNumber(),
    clientName: `${c.firstName} ${c.lastName}`,
    clientEmail: c.email || '',
    issueDate:  data.issueDate  || today(),
    dueDate:    data.dueDate    || '',
    lineItems:  data.lineItems  || [],
    notes:      data.notes      || '',
    status:     'draft',  // draft | sent | paid | overdue | partial
    totalAmount: (data.lineItems || []).reduce((s, li) => s + (parseFloat(li.amount) || 0), 0),
    paidAmount:  0,
    sentDate:   '',
    paidDate:   '',
    createdAt:  new Date().toISOString(),
  };
  c.invoices.push(inv);
  activityAdd(caseId, 'invoice', `Invoice ${inv.number} created — ${fmtCurrency(inv.totalAmount)}`);
  c.updatedAt = new Date().toISOString();
  Storage.save();
  return inv;
}

function getInvoiceSummary(c) {
  const invoices = c.invoices || [];
  const totalInvoiced = invoices.reduce((s, i) => s + (i.totalAmount || 0), 0);
  const totalPaid     = invoices.reduce((s, i) => s + (i.paidAmount  || 0), 0);
  const outstanding   = invoices.filter(i => i.status !== 'paid');
  const overdue       = invoices.filter(i => i.status === 'overdue' || (i.dueDate && new Date(i.dueDate) < new Date() && i.status !== 'paid'));
  return { totalInvoiced, totalPaid, outstanding, overdue, count: invoices.length };
}

function _renderInvoiceList(c) {
  const invoices = c.invoices || [];
  if (!invoices.length) return `<div style="text-align:center;padding:24px;color:var(--text-3);font-size:13px;">No invoices yet. Create your first invoice to track billing.</div>`;
  return invoices.slice().reverse().map(inv => {
    const color = { draft:'var(--text-3)', sent:'var(--blue)', paid:'var(--green)', overdue:'var(--red)', partial:'var(--yellow)' }[inv.status] || 'var(--text-3)';
    return `
      <div style="display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:var(--radius);margin-bottom:4px;background:var(--surface-2);">
        <div style="flex:1;min-width:0;">
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="font-size:13px;font-weight:600;color:var(--text);">${escHtml(inv.number)}</span>
            <span style="font-size:10px;padding:2px 8px;border-radius:10px;background:var(--surface-3);color:${color};font-weight:600;text-transform:uppercase;">${inv.status}</span>
          </div>
          <div style="font-size:12px;color:var(--text-3);margin-top:2px;">
            Issued ${fmtDate(inv.issueDate)}${inv.dueDate ? ` · Due ${fmtDate(inv.dueDate)}` : ''}
            ${inv.lineItems?.length ? ` · ${inv.lineItems.length} item${inv.lineItems.length > 1 ? 's' : ''}` : ''}
          </div>
        </div>
        <div style="font-size:14px;font-weight:600;color:var(--text);">${fmtCurrency(inv.totalAmount)}</div>
        <div style="display:flex;gap:6px;">
          <button class="btn btn-ghost btn-sm" onclick="showViewInvoice('${c.id}','${inv.id}')">View</button>
          <button class="btn btn-ghost btn-sm" onclick="showSendInvoiceEmail('${c.id}','${inv.id}')">✉ Send</button>
          ${inv.status !== 'paid' ? `<button class="btn btn-gold btn-sm" onclick="markInvoicePaid('${c.id}','${inv.id}')">Paid ✓</button>` : ''}
        </div>
      </div>`;
  }).join('');
}

function showCreateInvoiceModal(caseId) {
  const c = getCase(caseId);
  if (!c) return;
  const fees = (c.fees || []).filter(f => !f.paid);
  const dueDefault = new Date(); dueDefault.setDate(dueDefault.getDate() + 14);
  const dueDef = dueDefault.toISOString().split('T')[0];

  // Build pre-filled line items from unpaid fees
  const preItems = fees.slice(0, 5).map(f => `
    <tr id="li-row-${f.id}">
      <td><input style="${_liStyle()}" value="${escAttr(f.description)}" oninput="v3UpdateInvTotal()" class="inv-li-desc" /></td>
      <td><input style="${_liStyle()} text-align:right;" type="number" value="${f.amount}" oninput="v3UpdateInvTotal()" class="inv-li-amount" /></td>
      <td><button onclick="this.closest('tr').remove();v3UpdateInvTotal()" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:16px;">×</button></td>
    </tr>`).join('');

  showModal(`
    <div class="modal modal-lg">
      <div class="modal-header"><h3>Create Invoice</h3><button class="modal-close" onclick="closeModal()">×</button></div>
      <div class="modal-body">
        <div style="background:var(--surface-2);border:1px solid var(--border-2);border-radius:var(--radius);padding:16px;margin-bottom:16px;">
          <div style="font-family:var(--font-serif);font-size:20px;color:var(--gold-light);margin-bottom:4px;">Kamkhadze PA</div>
          <div style="font-size:12px;color:var(--text-3);">anka@esq.mba · (786) 590-9400 · Hollywood Beach, FL</div>
        </div>
        <div class="field-row">
          <div class="field">
            <label>Bill To</label>
            <input id="inv-client" value="${escAttr(c.firstName + ' ' + c.lastName)}" />
          </div>
          <div class="field">
            <label>Client Email</label>
            <input id="inv-email" type="email" value="${escAttr(c.email || '')}" />
          </div>
        </div>
        <div class="field-row">
          <div class="field"><label>Issue Date</label><input id="inv-issue" type="date" value="${today()}" /></div>
          <div class="field"><label>Due Date</label><input id="inv-due" type="date" value="${dueDef}" /></div>
        </div>
        <div class="field"><label>Visa / Case Type</label><input id="inv-case-ref" value="${escAttr(c.visaType + ' — ' + c.firstName + ' ' + c.lastName)}" /></div>

        <div style="margin-top:16px;margin-bottom:8px;">
          <div style="font-size:11px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:var(--text-3);margin-bottom:8px;">Line Items</div>
          <table style="width:100%;border-collapse:collapse;" id="inv-items-table">
            <thead>
              <tr>
                <th style="text-align:left;font-size:11px;color:var(--text-3);padding:4px 8px;">Description</th>
                <th style="text-align:right;font-size:11px;color:var(--text-3);padding:4px 8px;width:120px;">Amount ($)</th>
                <th style="width:32px;"></th>
              </tr>
            </thead>
            <tbody id="inv-items-body">
              ${preItems || `<tr id="li-row-new1"><td><input style="${_liStyle()}" placeholder="Description" oninput="v3UpdateInvTotal()" class="inv-li-desc" /></td><td><input style="${_liStyle()} text-align:right;" type="number" placeholder="0.00" oninput="v3UpdateInvTotal()" class="inv-li-amount" /></td><td><button onclick="this.closest('tr').remove();v3UpdateInvTotal()" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:16px;">×</button></td></tr>`}
            </tbody>
          </table>
          <button class="btn btn-ghost btn-sm" style="margin-top:8px;" onclick="v3AddInvRow()">+ Add Line Item</button>
        </div>

        <div style="display:flex;justify-content:flex-end;margin:12px 0 0;">
          <div style="background:var(--surface-2);border:1px solid var(--border-2);border-radius:var(--radius);padding:12px 20px;min-width:200px;text-align:right;">
            <div style="font-size:12px;color:var(--text-3);margin-bottom:4px;">TOTAL</div>
            <div id="inv-total-display" style="font-family:var(--font-serif);font-size:28px;font-weight:600;color:var(--gold-light);">$0.00</div>
          </div>
        </div>
        <div class="field" style="margin-top:12px;"><label>Notes / Payment Instructions</label><textarea id="inv-notes" rows="3" placeholder="Payment via Zelle: anka@esq.mba · Wire instructions on request"></textarea></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
        <button class="btn btn-ghost" onclick="saveInvoice('${caseId}','draft')">Save Draft</button>
        <button class="btn btn-gold" onclick="saveInvoice('${caseId}','send')">Create &amp; Send</button>
      </div>
    </div>`);
  setTimeout(v3UpdateInvTotal, 50);
}

function _liStyle() {
  return 'width:100%;background:var(--bg-2);border:1px solid var(--border-2);border-radius:var(--radius);color:var(--text);font-size:13px;padding:7px 10px;outline:none;';
}

function v3AddInvRow() {
  const tbody = document.getElementById('inv-items-body');
  if (!tbody) return;
  const tr = document.createElement('tr');
  tr.innerHTML = `<td><input style="${_liStyle()}" placeholder="Description" oninput="v3UpdateInvTotal()" class="inv-li-desc" /></td><td><input style="${_liStyle()} text-align:right;" type="number" placeholder="0.00" oninput="v3UpdateInvTotal()" class="inv-li-amount" /></td><td><button onclick="this.closest('tr').remove();v3UpdateInvTotal()" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:16px;">×</button></td>`;
  tbody.appendChild(tr);
}

function v3UpdateInvTotal() {
  const amounts = document.querySelectorAll('.inv-li-amount');
  const total = Array.from(amounts).reduce((s, el) => s + (parseFloat(el.value) || 0), 0);
  const el = document.getElementById('inv-total-display');
  if (el) el.textContent = fmtCurrency(total);
}

function saveInvoice(caseId, action) {
  const descs   = Array.from(document.querySelectorAll('.inv-li-desc')).map(el => el.value.trim());
  const amounts = Array.from(document.querySelectorAll('.inv-li-amount')).map(el => parseFloat(el.value) || 0);
  const lineItems = descs.map((d, i) => ({ description: d, amount: amounts[i] })).filter(li => li.description || li.amount > 0);
  if (!lineItems.length) { toast('Add at least one line item', 'warn'); return; }

  const inv = createInvoice(caseId, {
    issueDate: document.getElementById('inv-issue')?.value || today(),
    dueDate:   document.getElementById('inv-due')?.value  || '',
    lineItems,
    notes:     document.getElementById('inv-notes')?.value || '',
  });
  if (!inv) return;
  if (action === 'send') { inv.status = 'sent'; inv.sentDate = today(); Storage.save(); }
  closeModal();
  toast(`Invoice ${inv.number} ${action === 'send' ? 'created & ready to send' : 'saved as draft'}`);
  if (action === 'send') showSendInvoiceEmail(caseId, inv.id);
  else rerenderTab(caseId);
}

function markInvoicePaid(caseId, invoiceId) {
  const c = getCase(caseId);
  const inv = (c?.invoices || []).find(i => i.id === invoiceId);
  if (!inv) return;
  inv.status    = 'paid';
  inv.paidDate  = today();
  inv.paidAmount = inv.totalAmount;
  activityAdd(caseId, 'fee_paid', `Invoice ${inv.number} paid — ${fmtCurrency(inv.totalAmount)}`);
  c.updatedAt = new Date().toISOString();
  Storage.save();
  toast(`Invoice ${inv.number} marked as paid`);
  rerenderTab(caseId);
}

function showViewInvoice(caseId, invoiceId) {
  const c = getCase(caseId);
  const inv = (c?.invoices || []).find(i => i.id === invoiceId);
  if (!inv) return;
  const statusColor = { draft:'var(--text-3)', sent:'var(--blue)', paid:'var(--green)', overdue:'var(--red)', partial:'var(--yellow)' }[inv.status] || 'var(--text-3)';

  showModal(`
    <div class="modal modal-lg">
      <div class="modal-header">
        <h3>${inv.number}</h3>
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="font-size:11px;padding:3px 10px;border-radius:10px;background:var(--surface-2);color:${statusColor};font-weight:600;text-transform:uppercase;">${inv.status}</span>
          <button class="modal-close" onclick="closeModal()">×</button>
        </div>
      </div>
      <div class="modal-body">
        <div style="display:flex;justify-content:space-between;margin-bottom:24px;">
          <div>
            <div style="font-family:var(--font-serif);font-size:22px;color:var(--gold-light);">Kamkhadze PA</div>
            <div style="font-size:12px;color:var(--text-3);margin-top:2px;">anka@esq.mba · (786) 590-9400</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:13px;color:var(--text-3);">Invoice # <strong style="color:var(--text)">${escHtml(inv.number)}</strong></div>
            <div style="font-size:12px;color:var(--text-3);margin-top:2px;">Issued: ${fmtDate(inv.issueDate)}</div>
            ${inv.dueDate ? `<div style="font-size:12px;color:var(--text-3);">Due: ${fmtDate(inv.dueDate)}</div>` : ''}
          </div>
        </div>
        <div style="background:var(--surface-2);border-radius:var(--radius);padding:12px;margin-bottom:20px;">
          <div style="font-size:11px;color:var(--text-3);margin-bottom:2px;">BILL TO</div>
          <div style="font-size:14px;color:var(--text)">${escHtml(inv.clientName)}</div>
          <div style="font-size:12px;color:var(--text-3)">${escHtml(inv.clientEmail)}</div>
        </div>
        <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
          <thead>
            <tr style="border-bottom:1px solid var(--border-2);">
              <th style="text-align:left;font-size:11px;color:var(--text-3);padding:6px 8px;">DESCRIPTION</th>
              <th style="text-align:right;font-size:11px;color:var(--text-3);padding:6px 8px;">AMOUNT</th>
            </tr>
          </thead>
          <tbody>
            ${(inv.lineItems || []).map(li => `
              <tr style="border-bottom:1px solid var(--border-2);">
                <td style="font-size:13px;color:var(--text-2);padding:10px 8px;">${escHtml(li.description)}</td>
                <td style="font-size:13px;color:var(--text);text-align:right;padding:10px 8px;font-weight:500;">${fmtCurrency(li.amount)}</td>
              </tr>`).join('')}
          </tbody>
        </table>
        <div style="display:flex;justify-content:flex-end;">
          <div style="min-width:220px;">
            <div style="display:flex;justify-content:space-between;padding:8px 0;border-top:2px solid var(--border);">
              <span style="font-size:15px;font-weight:600;color:var(--text);">TOTAL</span>
              <span style="font-family:var(--font-serif);font-size:22px;font-weight:600;color:var(--gold-light);">${fmtCurrency(inv.totalAmount)}</span>
            </div>
          </div>
        </div>
        ${inv.notes ? `<div style="margin-top:16px;padding:12px;background:var(--surface-2);border-radius:var(--radius);font-size:13px;color:var(--text-3);white-space:pre-wrap;">${escHtml(inv.notes)}</div>` : ''}
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="closeModal()">Close</button>
        <button class="btn btn-ghost" onclick="copyInvoiceText('${caseId}','${inv.id}')">Copy Text</button>
        <button class="btn btn-ghost" onclick="showSendInvoiceEmail('${caseId}','${inv.id}')">✉ Send via Email</button>
        ${inv.status !== 'paid' ? `<button class="btn btn-gold" onclick="markInvoicePaid('${caseId}','${inv.id}');closeModal()">Mark as Paid ✓</button>` : ''}
      </div>
    </div>`);
}

function copyInvoiceText(caseId, invoiceId) {
  const c = getCase(caseId);
  const inv = (c?.invoices || []).find(i => i.id === invoiceId);
  if (!inv) return;
  const text = `INVOICE ${inv.number}\nKamkhadze PA · anka@esq.mba · (786) 590-9400\n\nBill To: ${inv.clientName}\nIssued: ${fmtDate(inv.issueDate)}${inv.dueDate ? '\nDue: '+fmtDate(inv.dueDate) : ''}\n\n${(inv.lineItems||[]).map(li => `${li.description} ........ ${fmtCurrency(li.amount)}`).join('\n')}\n\nTOTAL: ${fmtCurrency(inv.totalAmount)}\n${inv.notes || ''}`;
  navigator.clipboard.writeText(text).then(() => toast('Invoice text copied to clipboard'));
}

function showSendInvoiceEmail(caseId, invoiceId) {
  const c = getCase(caseId);
  if (!c) return;
  let inv = null;
  if (invoiceId) {
    inv = (c.invoices || []).find(i => i.id === invoiceId);
  } else {
    // Find next unpaid fee / outstanding invoice
    inv = (c.invoices || []).find(i => i.status !== 'paid');
  }

  const feeBalance = getCaseFeeBalance(c);
  const invSummary = inv ? `Invoice ${inv.number} — ${fmtCurrency(inv.totalAmount)} due ${inv.dueDate ? fmtDate(inv.dueDate) : 'upon receipt'}` : '';
  const nextFee    = feeBalance.nextDue;

  const body = buildInvoiceEmailBody(c, inv, nextFee);

  State.email.tab = 'compose';
  State.email.composeData = {
    to:      c.email || '',
    subject: inv ? `Invoice ${inv.number} — Kamkhadze PA` : `Payment Request — Kamkhadze PA`,
    body,
    attachedInvoiceId: inv?.id || '',
    attachedInvoiceSummary: invSummary,
  };
  closeModal();
  navigate('email');
  toast('Invoice email ready to send');
}

function buildInvoiceEmailBody(c, inv, nextFee) {
  const name = c.firstName || 'Client';
  let body = `Dear ${name},\n\n`;
  if (inv) {
    body += `Please find below your invoice from Kamkhadze PA.\n\nINVOICE DETAILS:\nInvoice #: ${inv.number}\nDate: ${fmtDate(inv.issueDate)}\n${inv.dueDate ? 'Due Date: '+fmtDate(inv.dueDate)+'\n' : ''}`;
    body += `\nITEMS:\n${(inv.lineItems||[]).map(li => `• ${li.description} — ${fmtCurrency(li.amount)}`).join('\n')}\n\nTOTAL DUE: ${fmtCurrency(inv.totalAmount)}\n`;
  }
  if (nextFee && !inv) {
    body += `The following payment is now due:\n\n• ${nextFee.description} — ${fmtCurrency(nextFee.amount)}\n${nextFee.dueDate ? '  Due: '+fmtDate(nextFee.dueDate)+'\n' : ''}`;
  }
  body += `\nPAYMENT OPTIONS:\n• Zelle: anka@esq.mba (Reference: ${c.firstName} ${c.lastName} — ${c.visaType})\n• Wire transfer / ACH: contact us for banking details\n• Check payable to: Kamkhadze PA\n\nPlease confirm payment at anka@esq.mba once sent.\n\nThank you,\n\nAna Kamkhadze, Esq. MBA\nKamkhadze PA\nanka@esq.mba | (786) 590-9400`;
  return body;
}

// ================================================================
// SECTION 7 — Key Dates & Dashboard Alerts
// ================================================================

function getDashboardAlerts() {
  const alerts = [];
  const now = new Date();

  State.cases.forEach(c => {
    const name = `${c.firstName} ${c.lastName}`;
    const cid  = c.id;

    // Status expiration alerts
    if (c.statusExpirationDate) {
      const days = daysFromNow(c.statusExpirationDate);
      if (days !== null && days >= 0 && days <= 60) {
        alerts.push({
          level: days <= 14 ? 'critical' : days <= 30 ? 'warning' : 'info',
          caseId: cid, type: 'expiration',
          msg: `${name} — Immigration status expires in ${days} day${days !== 1 ? 's' : ''}`,
          date: c.statusExpirationDate,
        });
      }
    }

    // RFE response due alerts
    if (c.stage === 'rfe' && c.rfeResponseDue) {
      const days = daysFromNow(c.rfeResponseDue);
      if (days !== null && days >= 0 && days <= 30) {
        alerts.push({
          level: days <= 7 ? 'critical' : 'warning',
          caseId: cid, type: 'rfe',
          msg: `${name} — RFE response due in ${days} day${days !== 1 ? 's' : ''}`,
          date: c.rfeResponseDue,
        });
      } else if (days !== null && days < 0) {
        alerts.push({
          level: 'critical', caseId: cid, type: 'rfe',
          msg: `${name} — RFE response is OVERDUE (${Math.abs(days)} days past deadline)`,
          date: c.rfeResponseDue,
        });
      }
    }

    // Unpaid consultation fees
    const unpaidConsult = (c.fees || []).filter(f => !f.paid && f.type === 'consultation');
    if (unpaidConsult.length) {
      alerts.push({
        level: 'info', caseId: cid, type: 'fee',
        msg: `${name} — ${unpaidConsult.length} unpaid consultation fee${unpaidConsult.length > 1 ? 's' : ''} (${fmtCurrency(unpaidConsult.reduce((s,f)=>s+f.amount,0))})`,
        date: unpaidConsult[0].dueDate || '',
      });
    }

    // Approved — remind to send congratulations
    if (c.stage === 'approved' && c.approvalDate) {
      const sent = (c.emailLog || []).some(e => /approv|congrat/i.test(e.subject));
      if (!sent) {
        alerts.push({
          level: 'info', caseId: cid, type: 'approval',
          msg: `${name} — Approval email not yet sent. Send congratulations!`,
          date: c.approvalDate,
        });
      }
    }

    // RFE — remind to send RFE consultation email
    if (c.stage === 'rfe' && c.rfeReceivedDate) {
      const sent = (c.emailLog || []).some(e => /rfe|request for evidence/i.test(e.subject));
      if (!sent) {
        alerts.push({
          level: 'warning', caseId: cid, type: 'rfe_email',
          msg: `${name} — RFE received but no RFE email sent yet`,
          date: c.rfeReceivedDate,
        });
      }
    }
  });

  return alerts.sort((a, b) => {
    const order = { critical: 0, warning: 1, info: 2 };
    return order[a.level] - order[b.level];
  });
}

function renderAlertsPanel() {
  const alerts = getDashboardAlerts();
  if (!alerts.length) return '';
  const colorMap = { critical: 'var(--red)', warning: 'var(--yellow)', info: 'var(--blue)' };
  const bgMap    = { critical: 'rgba(248,113,113,0.08)', warning: 'rgba(251,191,36,0.08)', info: 'rgba(96,165,250,0.08)' };
  const iconMap  = { critical: '🚨', warning: '⚠', info: 'ℹ' };
  return `
    <div class="panel" style="margin-bottom:24px;border-color:rgba(248,113,113,0.3);">
      <div class="panel-title" style="color:var(--red);margin-bottom:12px;">
        🚨 Action Required (${alerts.length})
      </div>
      ${alerts.slice(0, 8).map(a => `
        <div style="display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:var(--radius);background:${bgMap[a.level]};border-left:3px solid ${colorMap[a.level]};margin-bottom:6px;cursor:pointer;" onclick="navigate('case-detail','${a.caseId}')">
          <span style="font-size:14px;">${iconMap[a.level]}</span>
          <div style="flex:1;font-size:13px;color:var(--text);">${escHtml(a.msg)}</div>
          ${a.date ? `<div style="font-size:11px;color:var(--text-3);flex-shrink:0;">${fmtDate(a.date)}</div>` : ''}
          <span style="color:${colorMap[a.level]};font-size:12px;">→</span>
        </div>`).join('')}
    </div>`;
}

// RFE countdown widget shown in status tab
function renderRFECountdown(c) {
  if (c.stage !== 'rfe' || !c.rfeResponseDue) return '';
  const days = daysFromNow(c.rfeResponseDue);
  const isOverdue = days < 0;
  const color = isOverdue ? 'var(--red)' : days <= 14 ? 'var(--red)' : days <= 30 ? 'var(--yellow)' : 'var(--green)';
  const pct   = isOverdue ? 100 : Math.max(0, Math.round(((87 - days) / 87) * 100));
  return `
    <div class="panel" style="border-color:${isOverdue ? 'rgba(248,113,113,0.4)' : 'rgba(251,191,36,0.3)'};margin-bottom:16px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
        <div>
          <div style="font-size:13px;font-weight:600;color:${color};">⏰ RFE Response Deadline</div>
          <div style="font-size:12px;color:var(--text-3);margin-top:2px;">Due: ${fmtDate(c.rfeResponseDue)}</div>
        </div>
        <div style="text-align:right;">
          <div style="font-family:var(--font-serif);font-size:36px;font-weight:600;color:${color};line-height:1;">${isOverdue ? '!' : days}</div>
          <div style="font-size:11px;color:var(--text-3);">${isOverdue ? 'OVERDUE' : 'days left'}</div>
        </div>
      </div>
      <div style="height:8px;background:var(--surface-2);border-radius:4px;overflow:hidden;">
        <div style="height:100%;width:${pct}%;background:${color};border-radius:4px;transition:width .5s;"></div>
      </div>
      <div style="font-size:11px;color:var(--text-3);margin-top:6px;">87-day response window (${pct}% elapsed)</div>
    </div>`;
}

// ================================================================
// SECTION 8 — Enhanced Key Dates Panel (shown in Overview tab)
// ================================================================

function renderKeyDatesPanel(c) {
  const dates = [
    { label: 'Priority Date',       value: c.priorityDate,                color: 'var(--text-2)' },
    { label: 'Filing Date',         value: c.filingDate,                  color: 'var(--text-2)' },
    { label: 'Rep. Agreement Date', value: c.representationAgreementDate, color: 'var(--gold)' },
    { label: 'RFE Received',        value: c.rfeReceivedDate,             color: 'var(--yellow)' },
    { label: 'RFE Response Due',    value: c.rfeResponseDue,              color: c.rfeResponseDue && daysFromNow(c.rfeResponseDue) <= 30 ? 'var(--red)' : 'var(--yellow)' },
    { label: 'Approval Date',       value: c.approvalDate,                color: 'var(--green)' },
    { label: 'Status Expiration',   value: c.statusExpirationDate,        color: c.statusExpirationDate && daysFromNow(c.statusExpirationDate) <= 30 ? 'var(--red)' : 'var(--text-2)' },
  ].filter(d => d.value);

  if (!dates.length) {
    return `<div style="font-size:13px;color:var(--text-3);">No key dates entered. Edit the case to add important dates.</div>`;
  }

  return dates.map(d => {
    const rel = daysFromNow(d.value);
    const relStr = rel !== null ? (rel === 0 ? ' — Today' : rel > 0 ? ` — in ${rel}d` : ` — ${Math.abs(rel)}d ago`) : '';
    return `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border-2);">
        <div style="font-size:12px;color:var(--text-3);">${d.label}</div>
        <div style="font-size:13px;font-weight:500;color:${d.color};">${fmtDate(d.value)}<span style="font-size:11px;font-weight:400;color:var(--text-3);">${relStr}</span></div>
      </div>`;
  }).join('');
}

// ================================================================
// SECTION 9 — Consultation History Tab
// ================================================================

function renderConsultationTab(c) {
  const history = c.consultationHistory || [];
  const fees    = (c.fees || []).filter(f => f.type === 'consultation');

  return `
    <div class="two-col">
      <div>
        <div class="panel">
          <div class="panel-title">
            Consultation Log
            <button class="btn btn-gold btn-sm" onclick="showAddConsultationModal('${c.id}')">+ Log Session</button>
          </div>
          ${history.length ? history.slice().reverse().map(s => _renderConsultationEntry(c.id, s)).join('') : `
            <div style="text-align:center;padding:32px;color:var(--text-3);font-size:13px;">
              No consultations logged yet.<br>
              <button class="btn btn-gold btn-sm" style="margin-top:12px;" onclick="showAddConsultationModal('${c.id}')">Log First Consultation</button>
            </div>`}
        </div>
      </div>
      <div>
        <div class="panel">
          <div class="panel-title">Consultation Fees</div>
          ${fees.length ? fees.map(f => _renderFeeRow(c.id, f)).join('') : `<div style="font-size:13px;color:var(--text-3);">No consultation fees on record.</div>`}
          <button class="btn btn-ghost btn-sm" style="margin-top:12px;" onclick="v3AddConsultFee('${c.id}')">+ Add Consultation Fee</button>
        </div>
        <div class="panel" style="margin-top:16px;">
          <div class="panel-title">Quick Email</div>
          <div style="display:flex;flex-direction:column;gap:8px;">
            <button class="btn btn-ghost btn-sm" style="justify-content:flex-start;" onclick="State.emailDraft='consultation-confirm';State.activeTab='emails';switchTab('emails','${c.id}')">✉ Consultation Confirmation</button>
            <button class="btn btn-ghost btn-sm" style="justify-content:flex-start;" onclick="State.emailDraft='rfe-consultation';State.activeTab='emails';switchTab('emails','${c.id}')">✉ RFE Consultation Request</button>
          </div>
        </div>
      </div>
    </div>`;
}

function _renderConsultationEntry(caseId, s) {
  return `
    <div style="background:var(--surface-2);border-radius:var(--radius);padding:14px;margin-bottom:10px;border-left:3px solid var(--gold);">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;">
        <div>
          <div style="font-size:13px;font-weight:600;color:var(--text);">${fmtDate(s.date)} at ${escHtml(s.time || '—')}</div>
          <div style="font-size:12px;color:var(--text-3);margin-top:2px;">${escHtml(s.type || 'Consultation')} · ${escHtml(s.duration || '60')} min · ${s.feePaid ? '<span style="color:var(--green)">Fee Paid ✓</span>' : '<span style="color:var(--yellow)">Fee Pending</span>'}</div>
        </div>
        <button onclick="deleteConsultationEntry('${caseId}','${s.id}')" style="background:none;border:none;color:var(--text-3);cursor:pointer;font-size:14px;padding:2px;">✕</button>
      </div>
      ${s.summary ? `<div style="font-size:13px;color:var(--text-2);margin-top:10px;line-height:1.6;white-space:pre-wrap;">${escHtml(s.summary)}</div>` : ''}
      ${s.notes ? `<div style="font-size:12px;color:var(--text-3);margin-top:6px;border-top:1px solid var(--border-2);padding-top:6px;white-space:pre-wrap;">📝 ${escHtml(s.notes)}</div>` : ''}
      ${s.nextSteps ? `<div style="font-size:12px;color:var(--gold);margin-top:6px;">→ Next steps: ${escHtml(s.nextSteps)}</div>` : ''}
    </div>`;
}

function showAddConsultationModal(caseId) {
  showModal(`
    <div class="modal modal-lg">
      <div class="modal-header"><h3>Log Consultation Session</h3><button class="modal-close" onclick="closeModal()">×</button></div>
      <div class="modal-body">
        <div class="field-row">
          <div class="field"><label>Date</label><input id="cs-date" type="date" value="${today()}" /></div>
          <div class="field"><label>Time</label><input id="cs-time" type="time" value="10:00" /></div>
        </div>
        <div class="field-row">
          <div class="field">
            <label>Type</label>
            <select id="cs-type">
              <option value="Initial Consultation">Initial Consultation</option>
              <option value="Strategy Session">Strategy Session</option>
              <option value="RFE Consultation">RFE Consultation</option>
              <option value="Follow-up Call">Follow-up Call</option>
              <option value="Phone Call">Phone Call</option>
              <option value="Status Update">Status Update</option>
            </select>
          </div>
          <div class="field">
            <label>Duration (min)</label>
            <select id="cs-duration">
              <option value="30">30</option>
              <option value="45">45</option>
              <option value="60" selected>60</option>
              <option value="90">90</option>
              <option value="120">120</option>
            </select>
          </div>
        </div>
        <div class="field">
          <label>AI Summary / Session Notes</label>
          <textarea id="cs-summary" rows="5" placeholder="Key points discussed, eligibility findings, strategy decided…"></textarea>
        </div>
        <div class="field">
          <label>Manual Notes (private)</label>
          <textarea id="cs-notes" rows="3" placeholder="Internal notes, reminders, observations…"></textarea>
        </div>
        <div class="field">
          <label>Next Steps Agreed</label>
          <input id="cs-nextsteps" placeholder="e.g. Client to provide updated CV, request recommendation letters" />
        </div>
        <div class="field-row">
          <div class="field">
            <label>Fee Charged ($)</label>
            <input id="cs-fee" type="number" placeholder="350" />
          </div>
          <div class="field" style="display:flex;align-items:center;gap:10px;padding-top:22px;">
            <input type="checkbox" id="cs-fee-paid" style="width:16px;height:16px;accent-color:var(--gold);" />
            <label for="cs-fee-paid" style="font-size:13px;color:var(--text-2);cursor:pointer;">Fee already paid</label>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
        <button class="btn btn-gold" onclick="saveConsultation('${caseId}')">Save Session</button>
      </div>
    </div>`);
}

function saveConsultation(caseId) {
  const c = getCase(caseId);
  if (!c) return;
  if (!c.consultationHistory) c.consultationHistory = [];

  const feeAmt  = parseFloat(document.getElementById('cs-fee')?.value) || 0;
  const feePaid = document.getElementById('cs-fee-paid')?.checked || false;
  const session = {
    id:        uuid(),
    date:      document.getElementById('cs-date')?.value  || today(),
    time:      document.getElementById('cs-time')?.value  || '',
    type:      document.getElementById('cs-type')?.value  || 'Consultation',
    duration:  document.getElementById('cs-duration')?.value || '60',
    summary:   document.getElementById('cs-summary')?.value.trim() || '',
    notes:     document.getElementById('cs-notes')?.value.trim()   || '',
    nextSteps: document.getElementById('cs-nextsteps')?.value.trim() || '',
    feeAmount: feeAmt,
    feePaid,
    createdAt: new Date().toISOString(),
  };
  c.consultationHistory.push(session);
  activityAdd(caseId, 'meeting', `${session.type} logged — ${session.duration} min`, session.nextSteps);

  if (feeAmt > 0) {
    createFee(caseId, {
      type:        'consultation',
      description: session.type,
      amount:      feeAmt,
      paid:        feePaid,
      paidDate:    feePaid ? session.date : '',
      paidAmount:  feePaid ? String(feeAmt) : '',
      notes:       `Session on ${fmtDate(session.date)}`,
    });
  }
  c.updatedAt = new Date().toISOString();
  Storage.save();
  closeModal();
  toast('Consultation session saved');
  rerenderTab(caseId);
}

function deleteConsultationEntry(caseId, sessionId) {
  const c = getCase(caseId);
  if (!c) return;
  if (!confirm('Delete this consultation record?')) return;
  c.consultationHistory = (c.consultationHistory || []).filter(s => s.id !== sessionId);
  c.updatedAt = new Date().toISOString();
  Storage.save();
  rerenderTab(caseId);
}

function v3AddConsultFee(caseId) {
  showAddFeeModal(caseId);
  setTimeout(() => {
    const typeEl = document.getElementById('af-type');
    if (typeEl) typeEl.value = 'consultation';
    const descEl = document.getElementById('af-desc');
    if (descEl) descEl.value = 'Consultation Fee';
    const amtEl = document.getElementById('af-amount');
    if (amtEl) amtEl.value = '350';
  }, 100);
}

// ================================================================
// SECTION 10 — Communication Log Tab
// ================================================================

function renderCommunicationTab(c) {
  const log = c.communicationLog || [];
  return `
    <div class="panel">
      <div class="panel-title">
        Client Communication Log
        <div style="display:flex;gap:8px;">
          <button class="btn btn-ghost btn-sm" onclick="showLogCallModal('${c.id}','phone')">📞 Log Call</button>
          <button class="btn btn-ghost btn-sm" onclick="showLogCallModal('${c.id}','zoom')">📹 Log Zoom</button>
          <button class="btn btn-gold btn-sm" onclick="showLogCallModal('${c.id}','note')">+ Note</button>
        </div>
      </div>
      ${log.length ? `
        <div style="display:flex;flex-direction:column;gap:0;">
          ${log.slice().reverse().map(e => _renderCommEntry(c.id, e)).join('')}
        </div>` : `
        <div style="text-align:center;padding:40px;color:var(--text-3);font-size:13px;">
          No communications logged yet.<br>Track calls, Zoom sessions, emails and notes here.
        </div>`}
    </div>`;
}

function _renderCommEntry(caseId, e) {
  const typeIcon  = { phone:'📞', zoom:'📹', email_sent:'✉', email_received:'📩', note:'📝' }[e.type] || '•';
  const typeColor = { phone:'var(--blue)', zoom:'var(--blue)', email_sent:'var(--gold)', email_received:'var(--text-2)', note:'var(--text-3)' }[e.type] || 'var(--text-3)';
  return `
    <div style="display:flex;gap:12px;padding:12px 0;border-bottom:1px solid var(--border-2);">
      <div style="width:32px;height:32px;border-radius:50%;background:var(--surface-2);border:1px solid var(--border-2);display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0;">${typeIcon}</div>
      <div style="flex:1;min-width:0;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:2px;">
          <span style="font-size:13px;font-weight:500;color:${typeColor};">${escHtml(e.type?.replace(/_/g,' ').toUpperCase() || '')}</span>
          <span style="font-size:11px;color:var(--text-3);">${fmtDate(e.date)} ${e.time ? '· ' + e.time : ''}</span>
          ${e.duration ? `<span style="font-size:11px;color:var(--text-3);">· ${escHtml(e.duration)} min</span>` : ''}
        </div>
        ${e.subject ? `<div style="font-size:13px;color:var(--text);margin-bottom:3px;">${escHtml(e.subject)}</div>` : ''}
        ${e.notes ? `<div style="font-size:12px;color:var(--text-3);line-height:1.5;white-space:pre-wrap;">${escHtml(e.notes)}</div>` : ''}
      </div>
      <button onclick="deleteCommEntry('${caseId}','${e.id}')" style="background:none;border:none;color:var(--text-3);cursor:pointer;font-size:12px;flex-shrink:0;">✕</button>
    </div>`;
}

function showLogCallModal(caseId, type) {
  const titles = { phone:'Log Phone Call', zoom:'Log Zoom Meeting', note:'Add Note' };
  showModal(`
    <div class="modal" style="max-width:480px">
      <div class="modal-header"><h3>${titles[type] || 'Log Communication'}</h3><button class="modal-close" onclick="closeModal()">×</button></div>
      <div class="modal-body">
        <div class="field-row">
          <div class="field"><label>Date</label><input id="lc-date" type="date" value="${today()}" /></div>
          ${type !== 'note' ? `<div class="field"><label>Time</label><input id="lc-time" type="time" value="10:00" /></div>` : ''}
        </div>
        ${type !== 'note' ? `<div class="field"><label>Duration (min)</label><select id="lc-dur"><option value="">—</option><option value="15">15</option><option value="30">30</option><option value="45">45</option><option value="60">60</option><option value="90">90</option></select></div>` : ''}
        ${type === 'zoom' ? `<div class="field"><label>Zoom Meeting Link / ID</label><input id="lc-zoom" placeholder="https://zoom.us/j/..." /></div>` : ''}
        <div class="field"><label>Subject / Topic</label><input id="lc-subj" placeholder="${type === 'note' ? 'Note title' : 'What was discussed?'}" /></div>
        <div class="field"><label>Notes</label><textarea id="lc-notes" rows="4" placeholder="Key points, decisions, action items…"></textarea></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
        <button class="btn btn-gold" onclick="saveCommEntry('${caseId}','${type}')">Save</button>
      </div>
    </div>`);
}

function saveCommEntry(caseId, type) {
  const c = getCase(caseId);
  if (!c) return;
  if (!c.communicationLog) c.communicationLog = [];
  const entry = {
    id:       uuid(),
    type,
    date:     document.getElementById('lc-date')?.value || today(),
    time:     document.getElementById('lc-time')?.value || '',
    duration: document.getElementById('lc-dur')?.value  || '',
    subject:  document.getElementById('lc-subj')?.value.trim() || '',
    notes:    document.getElementById('lc-notes')?.value.trim() || '',
    zoomLink: document.getElementById('lc-zoom')?.value || '',
    createdAt: new Date().toISOString(),
  };
  c.communicationLog.push(entry);
  activityAdd(caseId, type, entry.subject || `${type} logged`, entry.notes, entry.id);
  c.updatedAt = new Date().toISOString();
  Storage.save();
  closeModal();
  toast('Communication logged');
  rerenderTab(caseId);
}

function deleteCommEntry(caseId, entryId) {
  const c = getCase(caseId);
  if (!c) return;
  c.communicationLog = (c.communicationLog || []).filter(e => e.id !== entryId);
  c.updatedAt = new Date().toISOString();
  Storage.save();
  rerenderTab(caseId);
}

// ================================================================
// SECTION 11 — Stage Change Confirmation
// ================================================================

// Override advanceStage with confirmation
advanceStage = function(caseId) {
  const c = getCase(caseId);
  if (!c) return;
  const idx = STAGE_ORDER.indexOf(c.stage);
  if (idx >= STAGE_ORDER.length - 1) { toast('Already at final stage', 'warn'); return; }
  const nextStage = STAGE_ORDER[idx + 1];
  const nextLabel = STAGES.find(s => s.value === nextStage)?.label || nextStage;
  const currLabel = STAGES.find(s => s.value === c.stage)?.label || c.stage;
  showModal(`
    <div class="modal" style="max-width:420px">
      <div class="modal-header"><h3>Confirm Stage Change</h3><button class="modal-close" onclick="closeModal()">×</button></div>
      <div class="modal-body">
        <p style="font-size:14px;color:var(--text-2);margin-bottom:16px;">Are you sure you want to advance <strong style="color:var(--text)">${escHtml(c.firstName)} ${escHtml(c.lastName)}</strong> to the next stage?</p>
        <div style="display:flex;align-items:center;justify-content:center;gap:16px;padding:16px;background:var(--surface-2);border-radius:var(--radius);">
          <span class="badge badge-${c.stage}">${escHtml(currLabel)}</span>
          <span style="color:var(--gold);font-size:18px;">→</span>
          <span class="badge badge-${nextStage}">${escHtml(nextLabel)}</span>
        </div>
        <p style="font-size:12px;color:var(--text-3);margin-top:12px;">This action is logged and can be reviewed in the Activity tab.</p>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
        <button class="btn btn-gold" onclick="_doAdvanceStage('${caseId}','${nextStage}','${escAttr(nextLabel)}')">Advance to ${escHtml(nextLabel)}</button>
      </div>
    </div>`);
};

function _doAdvanceStage(caseId, nextStage, nextLabel) {
  const c = getCase(caseId);
  if (!c) return;
  const prevLabel = STAGES.find(s => s.value === c.stage)?.label || c.stage;
  activityAdd(caseId, 'stage_change', `Stage changed: ${prevLabel} → ${nextLabel}`);
  c.stage = nextStage;
  c.updatedAt = new Date().toISOString();
  Storage.save();
  closeModal();
  toast(`Stage advanced to: ${nextLabel}`);

  // Stage-specific alerts
  if (nextStage === 'rfe') {
    const rfeDate = today();
    const dueDate = new Date(); dueDate.setDate(dueDate.getDate() + 87);
    c.rfeReceivedDate = rfeDate;
    c.rfeResponseDue  = dueDate.toISOString().split('T')[0];
    Storage.save();
    setTimeout(() => {
      if (confirm(`RFE received — send the RFE notification email to ${c.firstName}?`)) {
        State.emailDraft = 'rfe-received';
        State.activeTab  = 'emails';
        navigate('case-detail', caseId);
        setTimeout(() => switchTab('emails', caseId), 100);
      }
    }, 400);
  }
  if (nextStage === 'approved') {
    c.approvalDate = c.approvalDate || today();
    Storage.save();
    setTimeout(() => {
      if (confirm(`Congratulations! Send the approval email to ${c.firstName}?`)) {
        State.emailDraft = 'approval';
        State.activeTab  = 'emails';
        navigate('case-detail', caseId);
        setTimeout(() => switchTab('emails', caseId), 100);
      }
    }, 400);
  }
  render();
}

// Also add a Set Stage directly modal
function showSetStageModal(caseId) {
  const c = getCase(caseId);
  if (!c) return;
  showModal(`
    <div class="modal" style="max-width:400px">
      <div class="modal-header"><h3>Change Stage</h3><button class="modal-close" onclick="closeModal()">×</button></div>
      <div class="modal-body">
        <p style="font-size:13px;color:var(--text-3);margin-bottom:12px;">⚠ Carefully select the new stage. This change is logged.</p>
        <div class="field">
          <label>New Stage</label>
          <select id="set-stage-val">
            ${STAGES.map(s => `<option value="${s.value}" ${c.stage === s.value ? 'selected' : ''}>${s.label}</option>`).join('')}
          </select>
        </div>
        <div class="field"><label>Reason for change (required)</label><input id="set-stage-reason" placeholder="e.g. Filing confirmed, updated status from USCIS portal" /></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
        <button class="btn btn-danger" onclick="saveSetStage('${caseId}')">Change Stage</button>
      </div>
    </div>`);
}

function saveSetStage(caseId) {
  const c      = getCase(caseId);
  const newStg = document.getElementById('set-stage-val')?.value;
  const reason = document.getElementById('set-stage-reason')?.value.trim();
  if (!reason) { toast('Please provide a reason for the change', 'warn'); return; }
  if (!c || newStg === c.stage) { closeModal(); return; }
  const prevLabel = STAGES.find(s => s.value === c.stage)?.label    || c.stage;
  const newLabel  = STAGES.find(s => s.value === newStg)?.label || newStg;
  activityAdd(caseId, 'stage_change', `Stage manually set: ${prevLabel} → ${newLabel}`, `Reason: ${reason}`);
  c.stage = newStg;
  c.updatedAt = new Date().toISOString();
  Storage.save();
  closeModal();
  toast(`Stage set to: ${newLabel}`);
  render();
}

// ================================================================
// SECTION 12 — Enhanced Email Templates (Next Steps, RFE Consult,
//              Approval with Suggestions, Invoice Emails)
// ================================================================

// Extend buildEmailDraft with new v3 templates
const _origBuildEmailDraft = buildEmailDraft;
buildEmailDraft = function(c, templateId) {
  const name     = c.firstName || 'Client';
  const fullName = `${c.firstName} ${c.lastName}`.trim() || 'Client';
  const visa     = c.visaType || 'immigration';
  const receipt  = c.uscisReceiptNumber || '[RECEIPT NUMBER]';
  const dbxLink  = c.dropboxLink || '[DROPBOX LINK — add in Case → Edit]';

  // Detect language
  const isGeo = State.emailLang === 'ka';

  const v3Templates = {

    // ── NEXT STEPS (combined intro + doc upload + dropbox)
    'next-steps': {
      templateName: isGeo ? 'შემდეგი ნაბიჯები' : 'Next Steps & Document Upload',
      subject: isGeo
        ? `კამხაძე PA — შემდეგი ნაბიჯები | ${visa}`
        : `Welcome to Kamkhadze PA — Your Next Steps & Document Upload | ${visa}`,
      body: isGeo
        ? `ძვირფასო ${name},\n\nკეთილი იყოს თქვენი მობრძანება კამხაძე PA-ში. სიხარულით გეგებებით.\n\nქვემოთ ჩამოთვლილია მომდევნო ნაბიჯები თქვენი ${visa} საქმის განვითარებისთვის:\n\n1. წარმომადგენლობის შეთანხმება — გთხოვთ გადახედოთ და ხელი მოაწეროთ. შეთანხმება გამოგეგზავნებათ ცალკე.\n\n2. ავანსის გადახდა — გადახდის ინსტრუქცია გამოგეგზავნებათ ცალკე.\n\n3. დოკუმენტების ატვირთვა — გთხოვთ დოკუმენტები ატვირთოთ Dropbox-ის პირად საქაღალდეში:\n${dbxLink}\n\nSAQAGHALDIS STRUQTURA:\n• 01_Personal_Documents — პასპორტი, CV, სტატუსი\n• 02_Evidence — ჯილდოები, პრესა, პუბლიკაციები\n• 03_Support_Letters — სარეკომენდაციო წერილები\n• 04_Financial — საგადასახადო, ანაზღაურება\n\nპრიორიტეტული დოკუმენტები:\n• პასპორტი (ყველა გვერდი)\n• CV (განახლებული)\n• ჯილდოები / პრესა\n\n7 დღის განმავლობაში გთხოვთ ატვირთოთ პრიორიტეტული დოკუმენტები.\n\nნებისმიერ კითხვაზე: anka@esq.mba | (786) 590-9400\n\nპატივისცემით,\nანა კამხაძე, Esq. MBA`
        : `Dear ${name},\n\nWelcome to Kamkhadze PA — it is our privilege to represent you in your ${visa} immigration journey.\n\nBelow are your immediate next steps to get your case moving:\n\n──────────────────────────────\n1. REPRESENTATION AGREEMENT\nPlease review and sign your engagement letter (sent separately). Return a signed copy to anka@esq.mba.\n\n2. RETAINER PAYMENT\nPayment instructions will follow in a separate email. Your case file opens upon receipt of the signed agreement and retainer.\n\n3. DOCUMENT UPLOAD — Action Required\nPlease upload all documents to your secure, private Dropbox folder:\n\n→ ${dbxLink}\n\nYour folder is organized as follows — please upload documents to the correct sub-folder:\n\n📁 01_Personal_Documents\n   Upload: Passport (all pages), Current visa/status docs, Professional CV\n\n📁 02_Evidence\n   Upload: Awards, press/media articles, publications, patents, original contributions\n\n📁 03_Support_Letters\n   Upload: Recommendation/expert letters (as they are drafted and signed)\n\n📁 04_Financial_Documents\n   Upload: Tax returns, compensation documentation, bank statements\n\n📁 05_Correspondence\n   Upload: Any additional supporting materials\n\nPRIORITY UPLOAD (please complete within 7 days):\n✓ Passport copy (all pages)\n✓ Updated CV / Resume\n✓ Any awards, press coverage, or recognition documentation\n✓ Current compensation documentation\n\nFILE GUIDELINES:\n• PDF format preferred · Name files clearly (e.g., Passport_${c.firstName}${c.lastName}.pdf)\n• Include English translations for non-English documents\n• If you experience any issues with the upload link, please email me directly\n\n──────────────────────────────\n4. STRATEGY SESSION\nOnce your initial documents are uploaded, we will schedule a focused strategy session to review your evidence and outline the petition approach.\n\nI will be reviewing documents as they come in and will reach out with questions or guidance.\n\nPlease do not hesitate to contact me at any time:\nanka@esq.mba | (786) 590-9400\n\nWarmly,\n\nAna Kamkhadze, Esq. MBA\nFounder & Immigration Attorney\nKamkhadze PA\nanka@esq.mba | (786) 590-9400\nHollywood Beach, FL\n\nPRIVILEGED & CONFIDENTIAL — ATTORNEY-CLIENT COMMUNICATION`,
    },

    // ── RFE CONSULTATION REQUEST
    'rfe-consultation': {
      templateName: isGeo ? 'RFE კონსულტაციის მოთხოვნა' : 'RFE — Let\'s Talk Strategy',
      subject: isGeo
        ? `RFE — სასწრაფოდ გვჭირდება კონსულტაცია | ${receipt}`
        : `We Need to Talk — RFE Strategy Consultation | ${receipt}`,
      body: isGeo
        ? `ძვირფასო ${name},\n\nUSCIS-მა გამოაგზავნა მტკიცებულების მოთხოვნა (RFE) თქვენი ${visa} შუამდგომლობაზე.\n\nეს ჩვეულებრივი პროცედურის ნაწილია — არ ნიშნავს, რომ საქმე უარყოფილი იქნება.\n\nგვჭირდება სასწრაფო კონსულტაცია სტრატეგიის განსახილველად.\n\nRFE-ს პასუხის ვადა: [DEADLINE]\n\nგთხოვთ, რაც შეიძლება მალე დამიკავშირდეთ:\nanka@esq.mba | (786) 590-9400\n\nპატივისცემით,\nანა კამხაძე, Esq. MBA`
        : `Dear ${name},\n\nUSCIS has issued a Request for Evidence (RFE) on your ${visa} petition.\n\nReceipt Number: ${receipt}\nRFE Received: ${c.rfeReceivedDate ? fmtDate(c.rfeReceivedDate) : '[DATE]'}\nResponse Deadline: ${c.rfeResponseDue ? fmtDate(c.rfeResponseDue) : '[87 days from RFE date]'}\n\nFIRST — please don't be alarmed. An RFE is a routine part of adjudication and does not mean your case will be denied. It simply means USCIS needs additional documentation or clarification on specific points.\n\nI have reviewed the RFE and have a clear strategy in mind. However, I need to speak with you as soon as possible so we can:\n\n• Review exactly what USCIS is requesting\n• Identify any additional documents or information needed from you\n• Map out our response strategy and timeline\n• Ensure we have the strongest possible response ready well before the deadline\n\nPLEASE SCHEDULE A CONSULTATION:\nReply to this email or call (786) 590-9400 to schedule your RFE strategy consultation at your earliest convenience.\n\nDo not share the RFE document with anyone or take any independent action — please coordinate all responses through our office.\n\nI am treating this as urgent and am available to speak as early as possible.\n\nBest regards,\n\nAna Kamkhadze, Esq. MBA\nKamkhadze PA\nanka@esq.mba | (786) 590-9400\n\nPRIVILEGED & CONFIDENTIAL — ATTORNEY-CLIENT COMMUNICATION`,
    },

    // ── APPROVAL — CONGRATULATIONS WITH NEXT STEPS SUGGESTION
    'approval-congrats': {
      templateName: isGeo ? 'დამტკიცება — მილოცვა' : 'Approval — Congratulations & Next Steps',
      subject: isGeo
        ? `🎉 დამტკიცებულია! თქვენი ${visa} შუამდგომლობა | ${receipt}`
        : `🎉 APPROVED — Your ${visa} Petition | ${receipt}`,
      body: isGeo
        ? `ძვირფასო ${name},\n\nგულწრფელად გილოცავ! — USCIS-მა დაამტკიცა თქვენი ${visa} შუამდგომლობა!\n\nდამტკიცების ნომერი: ${receipt}\nდამტკიცების თარიღი: ${c.approvalDate ? fmtDate(c.approvalDate) : '[ᲗᲐᲠᲘᲦᲘ]'}\n\nეს განსაკუთრებული მიღწევაა! გილოცავ!\n\nშემდეგი ნაბიჯები:\n${_v3ApprovalNextSteps(c, 'ka')}\n\nნებისმიერ კითხვაზე: anka@esq.mba\n\nგულწრფელი მილოცვით,\nანა კამხაძე, Esq. MBA`
        : `Dear ${name},\n\nI am absolutely thrilled to share this news — your ${visa} petition has been APPROVED by USCIS!\n\n🎉 CONGRATULATIONS!\n\nAPPROVAL DETAILS:\nReceipt Number: ${receipt}\nApproval Date: ${c.approvalDate ? fmtDate(c.approvalDate) : '[DATE]'}\nValid Through: [VALIDITY DATE — please check your approval notice]\n\nThis is a remarkable achievement. Your extraordinary profile, the strength of the evidence we assembled, and your dedication throughout this process made all the difference.\n\nYOUR NEXT STEPS:\n${_v3ApprovalNextSteps(c, 'en')}\n\nIMPORTANT: Please keep your original USCIS Approval Notice (I-797) in a safe, accessible place. You will need it for:\n• Employment verification (I-9 process)\n• Re-entry to the United States\n• Future immigration applications\n• Visa stamp applications at consulates\n\nIt has been a genuine privilege working with you on this case. We hope to continue supporting your U.S. immigration journey.\n\nWith warmest congratulations,\n\nAna Kamkhadze, Esq. MBA\nFounder & Immigration Attorney\nKamkhadze PA\nanka@esq.mba | (786) 590-9400\n\nPRIVILEGED & CONFIDENTIAL — ATTORNEY-CLIENT COMMUNICATION`,
    },

    // ── CONSULTATION CONFIRMATION WITH FEE
    'consult-with-fee': {
      templateName: 'Consultation Confirmation + Fee',
      subject: `Consultation Confirmed — ${fmtDate(c.consultationDate || '')} | Payment Required`,
      body: `Dear ${name},\n\nYour strategy consultation with Kamkhadze PA has been confirmed.\n\nCONSULTATION DETAILS:\nDate: ${c.consultationDate ? fmtDate(c.consultationDate) : '[DATE]'}\nTime: ${c.consultationTime || '[TIME]'} (Eastern Time)\nDuration: ${c.consultationDuration || 60} minutes\nFormat: Zoom video call (link to follow)\n\nCONSULTATION FEE:\nFee: ${c.consultationFeeAmount ? fmtCurrency(c.consultationFeeAmount) : '$350.00'}\nPayment is required to confirm your appointment.\n\nPAYMENT OPTIONS:\n• Zelle: anka@esq.mba (Reference: ${fullName} Consultation)\n• Venmo / Other: contact our office\n\nIMPORTANT: Please complete payment at least 24 hours before your consultation. Your appointment will be confirmed upon receipt of payment.\n\nPLEASE HAVE READY FOR YOUR CALL:\n• Updated CV / Resume\n• Brief summary of your professional achievements\n• Any questions you have about your visa options\n\nIf you need to reschedule, please notify us at least 24 hours in advance.\n\nLooking forward to speaking with you,\n\nAna Kamkhadze, Esq. MBA\nKamkhadze PA\nanka@esq.mba | (786) 590-9400`,
    },
  };

  // Return v3 template if found
  if (v3Templates[templateId]) return v3Templates[templateId];
  // Fall back to original
  return _origBuildEmailDraft(c, templateId);
};

// Smart next-steps suggestion based on visa type and case
function _v3ApprovalNextSteps(c, lang) {
  const visa = (c.visaType || '').toUpperCase();
  const isGeo = lang === 'ka';

  if (isGeo) {
    return '• ვიზის შტამპი — საკონსულო პროცედურა\n• სარეზიდენტო სტატუსი — I-485 (სურვილისამებრ)\n• სამუშაო ნებართვა — EAD\n\nდეტალებისთვის: anka@esq.mba';
  }

  if (/O-1/.test(visa)) {
    return `1. VISA STAMP (If outside the U.S.):\n   → Schedule an appointment at your nearest U.S. Embassy/Consulate to obtain your O-1 visa stamp. Bring your original I-797 Approval Notice.\n\n2. STATUS MAINTENANCE (If in the U.S.):\n   → Your approved O-1 status is now active. Ensure you maintain lawful status throughout the validity period.\n\n3. TRAVEL:\n   → You may travel internationally. Upon return, present your O-1 visa stamp and I-797 at the port of entry.\n\n4. WORK AUTHORIZATION:\n   → You are authorized to work for your petitioning employer. Any change of employer requires a new petition.\n\n5. FUTURE PLANNING:\n   → Consider discussing an EB-1A (Extraordinary Ability Green Card) — your O-1 approval strengthens this path significantly.`;
  }
  if (/EB-1A|EB1A/.test(visa)) {
    return `1. PRIORITY DATE & VISA AVAILABILITY:\n   → Check the USCIS Visa Bulletin for your priority date. Depending on your country of birth, a visa number may be immediately available.\n\n2. ADJUSTMENT OF STATUS (If in the U.S.):\n   → If a visa number is available, you may file Form I-485 (Adjustment of Status) to become a Lawful Permanent Resident.\n\n3. CONSULAR PROCESSING (If outside the U.S.):\n   → Your case will be transferred to the National Visa Center (NVC) for consular processing at your local U.S. Embassy.\n\n4. EMPLOYMENT AUTHORIZATION:\n   → File I-765 (EAD) simultaneously with I-485 for unrestricted work authorization.\n\n5. TRAVEL DOCUMENT:\n   → File I-131 (Advance Parole) to travel internationally while I-485 is pending.`;
  }
  if (/EB-2|NIW/.test(visa)) {
    return `1. PRIORITY DATE CHECK:\n   → Verify your priority date in the USCIS Visa Bulletin (particularly for India/China nationals, retrogression may apply).\n\n2. ADJUSTMENT OR CONSULAR PROCESSING:\n   → File I-485 (Adjustment of Status) if in the U.S. and a visa number is available, or proceed with NVC/consular processing.\n\n3. EAD & ADVANCE PAROLE:\n   → File I-765 and I-131 concurrently with I-485 for work authorization and travel document.\n\n4. LONG-TERM PLANNING:\n   → Your NIW approval establishes your intent for a permanent career in the U.S. national interest.`;
  }
  return `1. NEXT IMMIGRATION STEP:\n   → We will schedule a follow-up consultation to determine the optimal next step based on your goals (Green Card, future renewals, etc.).\n\n2. KEEP YOUR DOCUMENTS SAFE:\n   → Store your I-797 Approval Notice securely. Make digital copies.\n\n3. STATUS COMPLIANCE:\n   → Ensure you maintain your authorized status. Do not overstay your visa validity.\n\nPlease schedule a follow-up call so we can map your next steps in detail.`;
}

// ================================================================
// SECTION 13 — Override renderTab to add new tabs
// ================================================================

const _origRenderTab = renderTab;
renderTab = function(tab, c, docPct) {
  switch (tab) {
    case 'activity':       return renderActivityTabPanel(c);
    case 'fees':           return renderFeesTab(c);
    case 'communication':  return renderCommunicationTab(c);
    case 'consultation':   return renderConsultationTab(c);
    default:               return _origRenderTab(tab, c, docPct);
  }
};

function renderActivityTabPanel(c) {
  return `
    <div class="panel">
      <div class="panel-title">
        Activity Log — All Case Events
        <button class="btn btn-ghost btn-sm" onclick="showLogCallModal('${c.id}','note')">+ Add Note</button>
      </div>
      ${renderActivityLog(c)}
    </div>`;
}

// ================================================================
// SECTION 14 — Override renderCaseDetail to add new tabs
// ================================================================

const _origRenderCaseDetail = renderCaseDetail;
renderCaseDetail = function(caseId) {
  const c = getCase(caseId);
  if (!c) { navigate('cases'); return ''; }
  _v3MigrateCase(c);
  State.selectedCaseId = caseId;

  const feeBalance = getCaseFeeBalance(c);
  const alerts     = getDashboardAlerts().filter(a => a.caseId === caseId);
  const caseFiles  = (State.dropbox.files || []).filter(f => f.clientId === caseId || (c.email && f.clientEmail === c.email));

  const tabs = [
    { id: 'overview',      label: 'Overview' },
    { id: 'activity',      label: 'Activity' + ((c.activityLog||[]).length ? ` (${(c.activityLog||[]).length})` : '') },
    { id: 'consultation',  label: 'Consultations' },
    { id: 'fees',          label: 'Fees' + (feeBalance.balance > 0 ? ` · ${fmtCurrency(feeBalance.balance)}` : '') },
    { id: 'communication', label: 'Communications' },
    { id: 'schedule',      label: 'Schedule' },
    { id: 'emails',        label: 'Emails' },
    { id: 'documents',     label: 'Documents' },
    { id: 'petition',      label: 'Petition' },
    { id: 'status',        label: 'USCIS Status' },
  ];

  const docs       = c.documents || [];
  const approvedD  = docs.filter(d => ['approved','reviewed'].includes(d.status)).length;
  const docPct     = docs.length ? Math.round(approvedD / docs.length * 100) : 0;
  const clientCases = State.cases.filter(x => x.email && x.email === c.email && x.id !== caseId);

  return `
    <div class="topbar">
      <div class="topbar-title">${escHtml(c.firstName)} ${escHtml(c.lastName)} <em>· ${escHtml(c.visaType)}</em></div>
      <div class="topbar-actions">
        <button class="btn btn-ghost btn-sm" onclick="showEditCase('${c.id}')">${icon('edit')} Edit</button>
        <button class="btn btn-ghost btn-sm" onclick="advanceStage('${c.id}')">Advance →</button>
        <button class="btn btn-ghost btn-sm" onclick="showSetStageModal('${c.id}')">Set Stage</button>
      </div>
    </div>
    <div class="content">
      <button class="back-btn" onclick="navigate('cases')">${icon('back')} Back to Cases</button>

      ${alerts.length ? `
      <div style="margin-bottom:16px;">
        ${alerts.map(a => {
          const colors = { critical:'var(--red)', warning:'var(--yellow)', info:'var(--blue)' };
          const bgs    = { critical:'rgba(248,113,113,0.08)', warning:'rgba(251,191,36,0.08)', info:'rgba(96,165,250,0.08)' };
          const icons  = { critical:'🚨', warning:'⚠', info:'ℹ' };
          return `<div style="display:flex;align-items:center;gap:10px;padding:9px 14px;background:${bgs[a.level]};border:1px solid ${colors[a.level]};border-radius:var(--radius);margin-bottom:6px;">
            <span>${icons[a.level]}</span>
            <span style="flex:1;font-size:13px;color:var(--text);">${escHtml(a.msg)}</span>
            ${a.type === 'approval' ? `<button class="btn btn-gold btn-sm" onclick="State.emailDraft='approval-congrats';State.activeTab='emails';switchTab('emails','${c.id}')">Send Email</button>` : ''}
            ${a.type === 'rfe_email' ? `<button class="btn btn-gold btn-sm" onclick="State.emailDraft='rfe-consultation';State.activeTab='emails';switchTab('emails','${c.id}')">Send Email</button>` : ''}
          </div>`;
        }).join('')}
      </div>` : ''}

      ${clientCases.length ? `
      <div style="background:var(--surface-2);border:1px solid var(--border-2);border-radius:var(--radius);padding:10px 14px;margin-bottom:16px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
        <span style="font-size:12px;color:var(--text-3);">Other cases for ${escHtml(c.firstName)}:</span>
        ${clientCases.map(x => `<button class="btn btn-ghost btn-sm" onclick="navigate('case-detail','${x.id}')">${escHtml(x.visaType)} · ${x.stage}</button>`).join('')}
        <button class="btn btn-ghost btn-sm" onclick="startNewCaseForClient('${c.id}')">+ New Case</button>
      </div>` : `
      <div style="background:var(--surface-2);border:1px solid var(--border-2);border-radius:var(--radius);padding:8px 14px;margin-bottom:16px;display:flex;align-items:center;gap:10px;">
        <span style="font-size:12px;color:var(--text-3);">Single case for this client.</span>
        <button class="btn btn-ghost btn-sm" onclick="startNewCaseForClient('${c.id}')">+ Start Another Case</button>
      </div>`}

      <div class="case-header">
        <div class="case-header-info">
          <h2>${escHtml(c.firstName)} ${escHtml(c.lastName)}</h2>
          <div class="case-meta">
            ${stageBadge(c.stage)}
            <div class="case-meta-item"><span>${escHtml(c.visaType)}</span></div>
            ${c.email ? `<div class="case-meta-item">✉ <span>${escHtml(c.email)}</span></div>` : ''}
            ${c.phone ? `<div class="case-meta-item">✆ <span>${escHtml(c.phone)}</span></div>` : ''}
            ${c.uscisReceiptNumber ? `<div class="case-meta-item" style="font-family:monospace">USCIS: <span>${escHtml(c.uscisReceiptNumber)}</span></div>` : ''}
            ${feeBalance.balance > 0 ? `<div class="case-meta-item" style="color:var(--yellow)">💰 Balance: ${fmtCurrency(feeBalance.balance)}</div>` : ''}
          </div>
        </div>
        <div class="case-header-actions">
          ${c.email ? `<button class="btn btn-ghost btn-sm" onclick="navigate('email');State.email.tab='compose';State.email.composeData={to:'${escAttr(c.email)}',subject:'',body:''}">✉ Email</button>` : ''}
          <button class="btn btn-gold btn-sm" onclick="showAddFeeModal('${c.id}')">+ Fee</button>
        </div>
      </div>

      <div class="tabs" style="overflow-x:auto;">
        ${tabs.map(t => `
          <button class="tab-btn ${State.activeTab === t.id ? 'active' : ''}"
            onclick="switchTab('${t.id}','${c.id}')">${t.label}</button>
        `).join('')}
      </div>

      <div id="tab-content">
        ${renderTab(State.activeTab, c, docPct)}
      </div>
    </div>`;
};

// Multiple cases for same client
function startNewCaseForClient(existingCaseId) {
  const orig = getCase(existingCaseId);
  if (!orig) return;
  showModal(`
    <div class="modal" style="max-width:420px">
      <div class="modal-header"><h3>New Case for ${escHtml(orig.firstName)} ${escHtml(orig.lastName)}</h3><button class="modal-close" onclick="closeModal()">×</button></div>
      <div class="modal-body">
        <p style="font-size:13px;color:var(--text-3);margin-bottom:16px;">Client information will be copied. Select the new visa type and stage.</p>
        <div class="field">
          <label>New Visa Type</label>
          <select id="ncf-visa">
            ${VISA_TYPES.map(v => `<option value="${v}">${v}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label>Stage</label>
          <select id="ncf-stage">
            ${STAGES.map(s => `<option value="${s.value}">${s.label}</option>`).join('')}
          </select>
        </div>
        <div class="field"><label>Notes</label><textarea id="ncf-notes" rows="2" placeholder="Any notes for this new case…"></textarea></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
        <button class="btn btn-gold" onclick="saveNewCaseForClient('${existingCaseId}')">Create Case</button>
      </div>
    </div>`);
}

function saveNewCaseForClient(existingCaseId) {
  const orig = getCase(existingCaseId);
  if (!orig) return;
  const visaType = document.getElementById('ncf-visa')?.value || 'O-1A';
  const stage    = document.getElementById('ncf-stage')?.value || 'lead';
  const notes    = document.getElementById('ncf-notes')?.value || '';

  const c = newCase({
    firstName:   orig.firstName,
    lastName:    orig.lastName,
    email:       orig.email,
    phone:       orig.phone,
    nationality: orig.nationality,
    location:    orig.location,
    company:     orig.company,
    visaType, stage, notes,
    documents:   buildDefaultDocs(visaType),
  });
  _v3MigrateCase(c);
  State.cases.push(c);
  activityAdd(c.id, 'note', `Case created from existing client: ${orig.firstName} ${orig.lastName} (${orig.visaType})`);
  Storage.save();
  closeModal();
  toast('New case created');
  navigate('case-detail', c.id);
}

/* ============================================================
   SECTION 4A – renderSidebar OVERRIDE
   Keeps the original rich sidebar; adds alert badge on Dashboard,
   RFE watch badge, and fixes Social Media / Questionnaire links.
   ============================================================ */
(function _v3PatchSidebar() {
  const _origRenderSidebar = (typeof renderSidebar === 'function') ? renderSidebar : null;
  if (!_origRenderSidebar) return;

  renderSidebar = function() {
    let html = _origRenderSidebar();

    // Inject alert badge next to Dashboard nav item
    const alerts = getDashboardAlerts();
    const urgentCount = alerts.filter(a => a.severity === 'critical').length;
    const warnCount   = alerts.filter(a => a.severity === 'warning').length;
    const totalAlerts = urgentCount + warnCount;
    if (totalAlerts > 0) {
      const badgeHtml = `<span class="nav-badge" style="${urgentCount > 0 ? 'background:var(--red-dim);color:var(--red);border-color:rgba(248,113,113,.2)' : 'background:var(--yellow-dim);color:var(--yellow);'}">${totalAlerts}</span>`;
      html = html.replace(/(navigate\('dashboard'\)[^>]*>[\s\S]*?Dashboard\s*<\/button>)/, (m) => m.replace('Dashboard', 'Dashboard ' + badgeHtml));
    }

    // Inject RFE countdown if any cases have RFE due date
    const rfeCases = (State.cases || []).filter(c => c.rfeResponseDue);
    if (rfeCases.length) {
      let rfeMin = null;
      rfeCases.forEach(c => {
        const days = Math.ceil((new Date(c.rfeResponseDue) - new Date()) / 86400000);
        if (days >= 0 && (rfeMin === null || days < rfeMin)) rfeMin = days;
      });
      if (rfeMin !== null) {
        const rfeBadge = `<span class="nav-badge" style="background:rgba(251,146,60,.1);color:#fb923c;border-color:rgba(251,146,60,.2)">RFE ${rfeMin}d</span>`;
        html = html.replace(/(navigate\('cases'[^>]*>[\s\S]*?All Cases)/, (m) => m + ' ' + rfeBadge);
      }
    }

    // Fix Social Media button: replace SOON placeholder with real route
    html = html.replace(
      /onclick="navigate\('social'\)"[\s\S]*?📱 Social Media[\s\S]*?SOON[\s\S]*?<\/button>/,
      `onclick="navigate('social-media')" class="nav-item ${State.view==='social-media'?'active':''}">
          📣 Social Media</button>`
    );

    // Add Questionnaire button after the reports button if not already present
    if (!html.includes("navigate('questionnaire')")) {
      html = html.replace(
        /(navigate\('reports'\)[^>]*>[\s\S]*?📊 Reports[\s\S]*?<\/button>)/,
        `$1
        <button class="nav-item ${State.view==='questionnaire'?'active':''}" onclick="navigate('questionnaire')">
          📋 Questionnaire
        </button>`
      );
    }

    return html;
  };
})();

/* ============================================================
   SECTION 4B – renderMain OVERRIDE + navigate OVERRIDE
   ============================================================ */
(function _v3PatchMain() {
  const _origRenderMain = (typeof renderMain === 'function') ? renderMain : null;

  renderMain = function() {
    switch (State.view) {
      case 'social-media':  return renderSocialMedia();
      case 'questionnaire': return renderQuestionnaire();
      case 'reports':       return renderReports();
      default:
        if (_origRenderMain) return _origRenderMain();
        return '<div class="main-content"><p>View not found.</p></div>';
    }
  };

  const _origNavigate = (typeof navigate === 'function') ? navigate : null;

  navigate = function(view, caseId) {
    // Run v3 migration whenever entering a case
    if (view === 'case-detail' && caseId) {
      const c = State.cases.find(x => x.id === caseId);
      if (c) _v3MigrateCase(c);
    }
    if (_origNavigate) _origNavigate(view, caseId);
  };
})();

/* ============================================================
   SECTION 4C – SOCIAL MEDIA
   ============================================================ */
function renderSocialMedia() {
  const sm = State.socialMedia;
  const activeTab = sm.activeTab || 'assistant';
  const pendingCount = (sm.pending || []).filter(p => p.status !== 'posted').length;
  const accounts = sm.accounts || {};
  const connectedCount = Object.keys(accounts).length;

  const tabs = [
    { id:'assistant', label:'AI Assistant',      icon:'🤖' },
    { id:'pending',   label:'Pending Approval',  icon:'⏳', badge: pendingCount },
    { id:'accounts',  label:'Accounts',           icon:'🔗', badge: connectedCount, badgeStyle:'ok' },
  ];

  const tabBar = tabs.map(t => {
    const badgeHtml = t.badge
      ? `<span style="margin-left:6px;padding:1px 7px;border-radius:20px;font-size:.68rem;font-weight:700;background:${t.badgeStyle==='ok'?'var(--green-dim)':'var(--gold-dim)'};color:${t.badgeStyle==='ok'?'var(--green)':'var(--gold)'};">${t.badge}</span>`
      : '';
    return `<button class="sm-tab-btn${activeTab===t.id?' sm-tab-active':''}" onclick="smSetTab('${t.id}')">${t.icon} ${t.label}${badgeHtml}</button>`;
  }).join('');

  let body = '';
  if (activeTab === 'assistant') body = renderSocialAssistant();
  if (activeTab === 'pending')   body = renderSocialPending();
  if (activeTab === 'accounts')  body = renderSocialAccounts();

  return `<div class="sm-page">
    <div class="sm-page-header">
      <div>
        <h1 class="sm-page-title">Social Media</h1>
        <p class="sm-page-sub">AI drafts content for your review — nothing goes live without your explicit approval</p>
      </div>
    </div>
    <div class="sm-tab-bar">${tabBar}</div>
    <div id="sm-tab-body">${body}</div>
  </div>`;
}

function smSetTab(t) {
  State.socialMedia.activeTab = t;
  const el = document.getElementById('sm-tab-body');
  if (!el) { render(); return; }
  if (t === 'assistant') el.innerHTML = renderSocialAssistant();
  if (t === 'pending')   el.innerHTML = renderSocialPending();
  if (t === 'accounts')  el.innerHTML = renderSocialAccounts();
  // update tab active state
  document.querySelectorAll('.sm-tab-btn').forEach(b => {
    b.classList.toggle('sm-tab-active', b.getAttribute('onclick').includes("'"+t+"'"));
  });
}

function renderSocialAssistant() {
  const msgs = State.socialMedia.messages || [];
  const platformIcons = { facebook:'📘', linkedin:'💼', instagram:'📸', website:'🌐' };

  const history = msgs.map(m => {
    const isUser = m.role === 'user';
    const platIcon = platformIcons[m.platform] || '';
    if (isUser) {
      return `<div class="sm-bubble-row sm-bubble-user">
        <div class="sm-bubble sm-bubble-user-inner">
          ${platIcon ? `<span class="sm-plat-tag">${platIcon} ${escHtml(m.platform||'')}</span>` : ''}
          <div class="sm-bubble-text">${escHtml(m.content)}</div>
        </div>
        <div class="sm-avatar sm-avatar-user">You</div>
      </div>`;
    }
    return `<div class="sm-bubble-row sm-bubble-ai">
      <div class="sm-avatar sm-avatar-ai">AI</div>
      <div class="sm-bubble sm-bubble-ai-inner">
        <div class="sm-bubble-text">${escHtml(m.content)}</div>
        ${m.draftPost ? `
        <div class="sm-draft-card">
          <div class="sm-draft-card-header">
            <span class="sm-draft-for">${platformIcons[m.draftPost.platform]||''} Draft for <strong>${escHtml(m.draftPost.platform)}</strong></span>
            <span class="sm-draft-warning">⚠ Not posted — awaiting your approval</span>
          </div>
          <div class="sm-draft-preview">${escHtml(m.draftPost.text)}</div>
          <div class="sm-draft-btns">
            <button class="btn btn-ghost btn-sm" onclick="discardSocialPost('${m.id}')">🗑 Discard</button>
            <button class="btn btn-gold btn-sm" onclick="approveSocialPost('${m.id}')">✅ Approve &amp; Queue</button>
          </div>
        </div>` : ''}
      </div>
    </div>`;
  }).join('');

  const emptyState = `<div class="sm-empty-state">
    <div class="sm-empty-icon">🤖</div>
    <div class="sm-empty-title">AI Content Assistant</div>
    <div class="sm-empty-sub">Tell the AI what kind of post you need. It will draft content for your review — you approve before anything is queued.</div>
    <div class="sm-suggestions">
      <button class="sm-suggest-btn" onclick="smSuggest('Draft a LinkedIn post celebrating a recent O-1A approval','linkedin')">💼 O-1A win on LinkedIn</button>
      <button class="sm-suggest-btn" onclick="smSuggest('Write an Instagram caption about helping an international artist get their visa','instagram')">📸 Artist visa on Instagram</button>
      <button class="sm-suggest-btn" onclick="smSuggest('Write a Facebook post about our free consultation offer','facebook')">📘 Free consult on Facebook</button>
      <button class="sm-suggest-btn" onclick="smSuggest('Write a blog post about the differences between O-1A and EB-1A visas','website')">🌐 O-1A vs EB-1A blog</button>
    </div>
  </div>`;

  return `<div class="sm-assistant-layout">
    <div class="sm-chat-panel">
      <div class="sm-chat-messages" id="sm-chat-history">${msgs.length ? history : emptyState}</div>
      <div class="sm-composer">
        <div class="sm-composer-inner">
          <div class="sm-composer-top">
            <label class="sm-composer-label">Platform</label>
            <div class="sm-platform-pills">
              <label class="sm-plat-pill"><input type="radio" name="sm-plat" value="facebook" checked> 📘 Facebook</label>
              <label class="sm-plat-pill"><input type="radio" name="sm-plat" value="linkedin"> 💼 LinkedIn</label>
              <label class="sm-plat-pill"><input type="radio" name="sm-plat" value="instagram"> 📸 Instagram</label>
              <label class="sm-plat-pill"><input type="radio" name="sm-plat" value="website"> 🌐 Blog</label>
            </div>
          </div>
          <div class="sm-composer-input-row">
            <textarea id="sm-input" class="sm-textarea" rows="2" placeholder="E.g. Draft a post celebrating our latest EB-1A approval..." onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();socialSendMessage();}"></textarea>
            <button class="sm-send-btn" onclick="socialSendMessage()">
              <span>Send</span><span style="font-size:1rem">↑</span>
            </button>
          </div>
          <div class="sm-composer-hint">Press Enter to send · Shift+Enter for new line</div>
        </div>
      </div>
    </div>
  </div>`;
}

function smSuggest(text, platform) {
  const radios = document.querySelectorAll('input[name="sm-plat"]');
  radios.forEach(r => { r.checked = r.value === platform; });
  const input = document.getElementById('sm-input');
  if (input) { input.value = text; input.focus(); }
}

function socialSendMessage() {
  const input = document.getElementById('sm-input');
  const platRadio = document.querySelector('input[name="sm-plat"]:checked');
  const platform = platRadio ? platRadio.value : 'facebook';
  const text = input ? input.value.trim() : '';
  if (!text) return;
  if (input) input.value = '';

  const userMsg = { id: 'sm-' + Date.now(), role: 'user', content: text, platform };
  State.socialMedia.messages.push(userMsg);
  rerenderSocialAssistant();

  // Show typing indicator then respond
  setTimeout(() => _socialAIResponse(text, platform), 900);
}

function _socialAIResponse(userMsg, platform) {
  const lower = userMsg.toLowerCase();
  const isWin    = lower.includes('approv') || lower.includes('win') || lower.includes('success') || lower.includes('celebrat');
  const isConsult = lower.includes('consult') || lower.includes('free') || lower.includes('offer');
  const isBlog   = platform === 'website';

  const drafts = {
    facebook: isConsult
      ? `📅 Did you know we offer free initial consultations? Whether you're an extraordinary talent, a researcher, or an entrepreneur — our team at Kamkhadze PA is here to guide your immigration journey. Book your free session today! 🔗 [link] #ImmigrationLaw #FreeConsultation`
      : `🎉 Another milestone at Kamkhadze PA! We're proud to have helped yet another talented professional navigate the complex immigration process. Our dedicated team is here for you every step of the way. DM us or visit our website to learn more. #ImmigrationLaw #VisaApproved #KamkhadzePa`,
    linkedin: isWin
      ? `We are proud to share another successful outcome at Kamkhadze PA.\n\nOur client — a distinguished professional in their field — has been approved after a meticulous process of building and presenting their extraordinary ability case.\n\nIf your organization is looking to retain or sponsor exceptional international talent through O-1, EB-1A, or EB-2 NIW pathways, our team brings deep expertise and a track record of results.\n\nFeel free to reach out for a confidential conversation.`
      : `At Kamkhadze PA, we specialize in immigration cases for extraordinary individuals — scientists, artists, executives, and athletes.\n\nNavigating the U.S. immigration system shouldn't be a barrier to talent. Our team works closely with each client to build the strongest possible case.\n\nLearn more about how we can help: [link]`,
    instagram: `✨ Dreams don't stop at borders. 🌍➡🇺🇸\n\nAnother incredible client has received their approval, and we couldn't be prouder. This is why we do what we do.\n\nIf you're ready to take the next step in your U.S. immigration journey, we're here. 💛\n\n#ImmigrationAttorney #O1Visa #EB1A #ExtraordinaryAbility #AmericanDream #KamkhadzePa #VisaApproved`,
    website: isBlog
      ? `## Understanding Your Options: O-1A vs. EB-1A\n\nFor exceptionally talented professionals, two immigration pathways often come up: the O-1A nonimmigrant visa and the EB-1A immigrant visa (green card). While both recognize extraordinary ability, they serve different purposes and have distinct evidentiary standards.\n\n**O-1A** is a temporary work visa, allowing you to live and work in the U.S. while your immigration status is tied to your employer. It's renewable and a great stepping stone.\n\n**EB-1A** leads to a green card, offering permanent residence. It's self-petitioned — meaning you don't need an employer sponsor — but requires a very high level of proof.\n\nAt Kamkhadze PA, we help clients evaluate which path best fits their goals and timeline. Contact us to schedule a consultation.`
      : `## A Message from Kamkhadze PA\n\nEvery case we handle represents a person's dream — a scientist advancing their research, an artist sharing their gift, an entrepreneur building something new. We take that responsibility seriously.\n\nOur firm brings precision, care, and deep expertise to every immigration matter. Whether you're just beginning to explore your options or facing a complex challenge, we're here to help.\n\n[Schedule a consultation](link)`,
  };

  const draft = drafts[platform] || drafts.facebook;
  const aiMsg = {
    id: 'sm-ai-' + Date.now(),
    role: 'ai',
    content: 'Here\'s a draft based on your request. Review it carefully — I will not post or queue anything until you click Approve:',
    draftPost: { platform, text: draft },
  };
  State.socialMedia.messages.push(aiMsg);
  rerenderSocialAssistant();

  // Scroll to bottom
  setTimeout(() => {
    const el = document.getElementById('sm-chat-history');
    if (el) el.scrollTop = el.scrollHeight;
  }, 50);
}

function rerenderSocialAssistant() {
  const el = document.getElementById('sm-tab-body');
  if (el && State.socialMedia.activeTab === 'assistant') {
    el.innerHTML = renderSocialAssistant();
    setTimeout(() => {
      const hist = document.getElementById('sm-chat-history');
      if (hist) hist.scrollTop = hist.scrollHeight;
    }, 30);
  }
}

function approveSocialPost(msgId) {
  const msg = State.socialMedia.messages.find(m => m.id === msgId);
  if (!msg || !msg.draftPost) return;
  if (!State.socialMedia.pending) State.socialMedia.pending = [];
  State.socialMedia.pending.push({
    id: 'pend-' + Date.now(),
    platform: msg.draftPost.platform,
    text: msg.draftPost.text,
    approvedAt: new Date().toISOString(),
    status: 'approved',
  });
  msg.draftPost = null;
  msg.approved = true;
  toast('Post queued — review it in Pending Approval before publishing');
  rerenderSocialAssistant();
}

function discardSocialPost(msgId) {
  const msg = State.socialMedia.messages.find(m => m.id === msgId);
  if (!msg) return;
  msg.draftPost = null;
  msg.discarded = true;
  rerenderSocialAssistant();
}

function renderSocialPending() {
  const pending = (State.socialMedia.pending || []).filter(p => p.status !== 'posted');
  if (!pending.length) return '<p class="v3-empty">No posts pending approval.</p>';
  return `<div class="v3-list">` + pending.map(p => `
    <div class="v3-list-item">
      <div class="v3-li-header">
        <span class="v3-badge v3-badge-platform">${escHtml(p.platform.toUpperCase())}</span>
        <span class="v3-li-date">${p.approvedAt ? new Date(p.approvedAt).toLocaleDateString() : ''}</span>
        <span class="v3-badge ${p.status==='approved'?'v3-badge-warn':'v3-badge-ok'}">${escHtml(p.status)}</span>
      </div>
      <div class="v3-li-body">${escHtml(p.text)}</div>
      <div class="v3-li-actions">
        <button class="btn-sm btn-danger" onclick="removePendingPost('${p.id}')">🗑️ Remove</button>
      </div>
    </div>`).join('') + `</div>`;
}

function removePendingPost(id) {
  State.socialMedia.pending = (State.socialMedia.pending || []).filter(p => p.id !== id);
  smSetTab('pending');
}

function renderSocialAccounts() {
  const accounts = State.socialMedia.accounts || {};
  const platforms = ['facebook','linkedin','instagram','website'];
  const icons = { facebook:'📘', linkedin:'💼', instagram:'📸', website:'🌐' };
  return `<div class="v3-accounts-grid">` + platforms.map(pl => {
    const acc = accounts[pl];
    return `<div class="v3-account-card">
      <div class="v3-account-icon">${icons[pl]}</div>
      <div class="v3-account-name">${pl.charAt(0).toUpperCase()+pl.slice(1)}</div>
      ${acc
        ? `<div class="v3-account-connected">✅ Connected<br><small>${escHtml(acc.handle||acc.url||'')}</small></div>
           <button class="btn-sm btn-danger" onclick="disconnectSocialAccount('${pl}')">Disconnect</button>`
        : `<div class="v3-account-disconnected">Not connected</div>
           <button class="btn-sm btn-primary" onclick="connectSocialAccount('${pl}')">Connect</button>`
      }
    </div>`;
  }).join('') + `</div>`;
}

function connectSocialAccount(platform) {
  const handle = prompt(`Enter your ${platform} page URL or handle:`);
  if (!handle) return;
  if (!State.socialMedia.accounts) State.socialMedia.accounts = {};
  State.socialMedia.accounts[platform] = { handle, connectedAt: new Date().toISOString() };
  toast(`${platform} connected`);
  smSetTab('accounts');
}

function disconnectSocialAccount(platform) {
  if (!confirm(`Disconnect ${platform}?`)) return;
  if (State.socialMedia.accounts) delete State.socialMedia.accounts[platform];
  toast(`${platform} disconnected`);
  smSetTab('accounts');
}

/* ============================================================
   SECTION 4D – REPORTS
   ============================================================ */
function renderReports() {
  const rpt = State.reports || {};
  const activeTab = rpt.activeTab || 'pipeline';
  const tabs = ['pipeline','fees','expiration','activity'];
  const tabLabels = { pipeline:'📊 Pipeline', fees:'💰 Fees & Billing', expiration:'⏰ Expirations', activity:'📋 Activity' };
  const tabBar = tabs.map(t =>
    `<button class="v3-tab-btn${activeTab===t?' active':''}" onclick="rptSetTab('${t}')">${tabLabels[t]}</button>`
  ).join('');

  let body = '';
  if (activeTab === 'pipeline')   body = renderPipelineReport();
  if (activeTab === 'fees')       body = renderFeesReport();
  if (activeTab === 'expiration') body = renderExpirationReport();
  if (activeTab === 'activity')   body = renderActivityReport();

  return `<div class="main-content v3-reports">
    <div class="v3-page-header"><h1>📈 Reports</h1></div>
    <div class="v3-tab-bar">${tabBar}</div>
    <div class="v3-tab-body" id="rpt-tab-body">${body}</div>
  </div>`;
}

function rptSetTab(t) {
  if (!State.reports) State.reports = {};
  State.reports.activeTab = t;
  const el = document.getElementById('rpt-tab-body');
  if (!el) return;
  if (t === 'pipeline')   el.innerHTML = renderPipelineReport();
  if (t === 'fees')       el.innerHTML = renderFeesReport();
  if (t === 'expiration') el.innerHTML = renderExpirationReport();
  if (t === 'activity')   el.innerHTML = renderActivityReport();
}

function renderPipelineReport() {
  const cases = State.cases || [];
  // By stage
  const byStage = {};
  STAGE_ORDER.forEach(s => byStage[s] = []);
  cases.forEach(c => { if (byStage[c.stage] !== undefined) byStage[c.stage].push(c); });
  // By visa type
  const byVisa = {};
  cases.forEach(c => {
    const v = c.visaType || 'Unknown';
    if (!byVisa[v]) byVisa[v] = 0;
    byVisa[v]++;
  });

  const stageRows = STAGE_ORDER.map(s => {
    const list = byStage[s] || [];
    return `<tr>
      <td>${STAGES[s] || s}</td>
      <td class="v3-rpt-count">${list.length}</td>
      <td>${list.map(c => `<span class="v3-name-chip" onclick="navigate('case-detail','${c.id}')">${escHtml(c.firstName)} ${escHtml(c.lastName)}</span>`).join(' ')}</td>
    </tr>`;
  }).join('');

  const visaRows = Object.entries(byVisa).sort((a,b)=>b[1]-a[1]).map(([v,n]) =>
    `<tr><td>${escHtml(v)}</td><td class="v3-rpt-count">${n}</td></tr>`
  ).join('');

  return `<div class="v3-rpt-grid">
    <div class="v3-rpt-card">
      <h3>Cases by Stage (${cases.length} total)</h3>
      <table class="v3-rpt-table"><thead><tr><th>Stage</th><th>#</th><th>Clients</th></tr></thead><tbody>${stageRows}</tbody></table>
    </div>
    <div class="v3-rpt-card">
      <h3>Cases by Visa Type</h3>
      <table class="v3-rpt-table"><thead><tr><th>Visa</th><th>#</th></tr></thead><tbody>${visaRows}</tbody></table>
    </div>
  </div>`;
}

function renderFeesReport() {
  const cases = State.cases || [];
  let totalCharged = 0, totalPaid = 0, totalUnpaid = 0;
  const rows = cases.map(c => {
    _v3MigrateCase(c);
    const bal = getCaseFeeBalance(c);
    totalCharged += bal.totalCharged;
    totalPaid    += bal.totalPaid;
    totalUnpaid  += bal.balance;
    if (!bal.totalCharged) return '';
    return `<tr>
      <td><a href="#" onclick="navigate('case-detail','${c.id}');return false;">${escHtml(c.firstName)} ${escHtml(c.lastName)}</a></td>
      <td>${escHtml(c.visaType||'')}</td>
      <td>$${bal.totalCharged.toLocaleString()}</td>
      <td class="v3-paid">$${bal.totalPaid.toLocaleString()}</td>
      <td class="${bal.balance>0?'v3-unpaid':''}">$${bal.balance.toLocaleString()}</td>
      <td>${bal.overdue && bal.overdue.length ? `<span class="v3-badge v3-badge-crit">${bal.overdue.length} overdue</span>` : ''}</td>
    </tr>`;
  }).filter(Boolean).join('');

  return `<div class="v3-rpt-card">
    <div class="v3-fee-summary-row">
      <div class="v3-fee-stat"><div class="v3-fee-stat-label">Total Charged</div><div class="v3-fee-stat-val">$${totalCharged.toLocaleString()}</div></div>
      <div class="v3-fee-stat"><div class="v3-fee-stat-label">Total Collected</div><div class="v3-fee-stat-val v3-paid">$${totalPaid.toLocaleString()}</div></div>
      <div class="v3-fee-stat"><div class="v3-fee-stat-label">Outstanding</div><div class="v3-fee-stat-val v3-unpaid">$${totalUnpaid.toLocaleString()}</div></div>
    </div>
    <table class="v3-rpt-table">
      <thead><tr><th>Client</th><th>Visa</th><th>Charged</th><th>Paid</th><th>Balance</th><th>Alerts</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="6" class="v3-empty">No fees recorded yet.</td></tr>'}</tbody>
    </table>
  </div>`;
}

function renderExpirationReport() {
  const cases = State.cases || [];
  const today = new Date();
  const rows = cases.map(c => {
    if (!c.statusExpirationDate) return null;
    const expDate = new Date(c.statusExpirationDate);
    const daysLeft = Math.ceil((expDate - today) / 86400000);
    let sev = '';
    if (daysLeft < 0)   sev = 'v3-badge-crit';
    else if (daysLeft <= 30) sev = 'v3-badge-crit';
    else if (daysLeft <= 60) sev = 'v3-badge-warn';
    else sev = 'v3-badge-ok';
    const label = daysLeft < 0 ? 'EXPIRED' : `${daysLeft}d left`;
    return { c, expDate, daysLeft, sev, label };
  }).filter(Boolean).sort((a,b) => a.daysLeft - b.daysLeft);

  const tableRows = rows.map(({c, expDate, sev, label}) =>
    `<tr>
      <td><a href="#" onclick="navigate('case-detail','${c.id}');return false;">${escHtml(c.firstName)} ${escHtml(c.lastName)}</a></td>
      <td>${escHtml(c.visaType||'')}</td>
      <td>${expDate.toLocaleDateString()}</td>
      <td><span class="v3-badge ${sev}">${label}</span></td>
    </tr>`
  ).join('');

  return `<div class="v3-rpt-card">
    <h3>Status Expirations</h3>
    <table class="v3-rpt-table">
      <thead><tr><th>Client</th><th>Visa</th><th>Expiration Date</th><th>Status</th></tr></thead>
      <tbody>${tableRows || '<tr><td colspan="4" class="v3-empty">No expiration dates recorded.</td></tr>'}</tbody>
    </table>
  </div>`;
}

function renderActivityReport() {
  const cases = State.cases || [];
  const allActivities = [];
  cases.forEach(c => {
    _v3MigrateCase(c);
    (c.activityLog || []).forEach(a => {
      allActivities.push({ ...a, caseId: c.id, clientName: `${c.firstName} ${c.lastName}` });
    });
  });
  allActivities.sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));
  const recent = allActivities.slice(0, 100);

  const rows = recent.map(a =>
    `<tr>
      <td>${new Date(a.timestamp).toLocaleDateString()}</td>
      <td><a href="#" onclick="navigate('case-detail','${a.caseId}');return false;">${escHtml(a.clientName)}</a></td>
      <td>${ACTIVITY_ICONS[a.type]||'•'} ${escHtml(a.type.replace(/_/g,' '))}</td>
      <td>${escHtml(a.description||'')}</td>
    </tr>`
  ).join('');

  return `<div class="v3-rpt-card">
    <h3>Recent Activity (last 100 events)</h3>
    <table class="v3-rpt-table">
      <thead><tr><th>Date</th><th>Client</th><th>Type</th><th>Description</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="4" class="v3-empty">No activity recorded yet.</td></tr>'}</tbody>
    </table>
  </div>`;
}

/* ============================================================
   SECTION 4E – USCIS QUESTIONNAIRE
   ============================================================ */
const USCIS_FORMS_LIBRARY = [
  { id:'I-129',  name:'I-129 – Petition for Nonimmigrant Worker',    url:'https://www.uscis.gov/i-129' },
  { id:'I-140',  name:'I-140 – Immigrant Petition for Alien Workers', url:'https://www.uscis.gov/i-140' },
  { id:'I-485',  name:'I-485 – Application to Register Permanent Residence', url:'https://www.uscis.gov/i-485' },
  { id:'I-131',  name:'I-131 – Application for Travel Document',      url:'https://www.uscis.gov/i-131' },
  { id:'I-765',  name:'I-765 – Application for Employment Authorization', url:'https://www.uscis.gov/i-765' },
  { id:'I-539',  name:'I-539 – Application to Extend/Change Nonimmigrant Status', url:'https://www.uscis.gov/i-539' },
  { id:'I-290B', name:'I-290B – Notice of Appeal or Motion',          url:'https://www.uscis.gov/i-290b' },
  { id:'I-907',  name:'I-907 – Request for Premium Processing',       url:'https://www.uscis.gov/i-907' },
];

function renderQuestionnaire() {
  const q = State.questionnaire || {};
  const templates = q.templates || [];
  const activeTab = q.activeTab || 'builder';

  const tabBar = ['builder','library','sent'].map(t =>
    `<button class="v3-tab-btn${activeTab===t?' active':''}" onclick="qSetTab('${t}')">
      ${t==='builder'?'🔨 Builder':t==='library'?'📚 USCIS Forms':'📤 Sent'}
    </button>`
  ).join('');

  let body = '';
  if (activeTab === 'builder') body = renderQBuilder(templates);
  if (activeTab === 'library') body = renderQLibrary();
  if (activeTab === 'sent')    body = renderQSent();

  return `<div class="main-content v3-questionnaire">
    <div class="v3-page-header"><h1>📋 USCIS Questionnaire Builder</h1><p>Build intake forms — clients fill online, answers feed into your filings.</p></div>
    <div class="v3-tab-bar">${tabBar}</div>
    <div class="v3-tab-body" id="q-tab-body">${body}</div>
  </div>`;
}

function qSetTab(t) {
  if (!State.questionnaire) State.questionnaire = { templates:[], sent:[], activeTab:'builder' };
  State.questionnaire.activeTab = t;
  const el = document.getElementById('q-tab-body');
  if (!el) return;
  if (t === 'builder') el.innerHTML = renderQBuilder(State.questionnaire.templates || []);
  if (t === 'library') el.innerHTML = renderQLibrary();
  if (t === 'sent')    el.innerHTML = renderQSent();
}

function renderQBuilder(templates) {
  const cards = templates.map(tpl => `
    <div class="v3-q-card">
      <div class="v3-q-card-header">
        <strong>${escHtml(tpl.name)}</strong>
        <span class="v3-badge v3-badge-ok">${tpl.fields.length} fields</span>
        ${tpl.linkedForm ? `<span class="v3-badge v3-badge-warn">${escHtml(tpl.linkedForm)}</span>` : ''}
      </div>
      <div class="v3-q-card-actions">
        <button class="btn-sm btn-primary" onclick="showSendQuestionnaire('${tpl.id}')">📤 Send to Client</button>
        <button class="btn-sm btn-secondary" onclick="showEditQuestionnaire('${tpl.id}')">✏️ Edit</button>
        <button class="btn-sm btn-danger" onclick="deleteQuestionnaire('${tpl.id}')">🗑️</button>
      </div>
    </div>`).join('');

  return `<div>
    <button class="btn-primary" onclick="showCreateQuestionnaire()" style="margin-bottom:1rem">+ New Questionnaire</button>
    ${cards || '<p class="v3-empty">No questionnaires yet. Create one to get started.</p>'}
  </div>`;
}

function renderQLibrary() {
  const rows = USCIS_FORMS_LIBRARY.map(f =>
    `<tr>
      <td>${escHtml(f.id)}</td>
      <td>${escHtml(f.name)}</td>
      <td><a href="${escAttr(f.url)}" target="_blank" class="v3-link">USCIS ↗</a></td>
      <td><button class="btn-sm btn-primary" onclick="showCreateQuestionnaire('${escAttr(f.id)}')">Build Form</button></td>
    </tr>`
  ).join('');
  return `<table class="v3-rpt-table">
    <thead><tr><th>Form</th><th>Name</th><th>Official Link</th><th>Action</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function renderQSent() {
  const sent = (State.questionnaire && State.questionnaire.sent) ? State.questionnaire.sent : [];
  if (!sent.length) return '<p class="v3-empty">No questionnaires sent yet.</p>';
  return `<table class="v3-rpt-table">
    <thead><tr><th>Sent To</th><th>Form</th><th>Sent At</th><th>Status</th><th>Actions</th></tr></thead>
    <tbody>${sent.map(s => `<tr>
      <td>${escHtml(s.recipientEmail||'')}</td>
      <td>${escHtml(s.formName||'')}</td>
      <td>${s.sentAt ? new Date(s.sentAt).toLocaleDateString() : ''}</td>
      <td><span class="v3-badge ${s.completed?'v3-badge-ok':'v3-badge-warn'}">${s.completed?'Completed':'Pending'}</span></td>
      <td>${s.completed ? `<button class="btn-sm btn-primary" onclick="showQResponses('${s.id}')">View Answers</button>` : ''}</td>
    </tr>`).join('')}</tbody>
  </table>`;
}

function showCreateQuestionnaire(linkedForm) {
  const formOptions = USCIS_FORMS_LIBRARY.map(f =>
    `<option value="${escAttr(f.id)}" ${linkedForm===f.id?'selected':''}>${escHtml(f.id)} – ${escHtml(f.name)}</option>`
  ).join('');

  showModal(`<div class="v3-modal-inner">
    <h2>📋 New Questionnaire</h2>
    <label class="v3-label">Questionnaire Name</label>
    <input id="qf-name" class="v3-input" placeholder="e.g. O-1A Initial Intake">
    <label class="v3-label">Linked USCIS Form (optional)</label>
    <select id="qf-linked" class="v3-select"><option value="">— None —</option>${formOptions}</select>
    <label class="v3-label">Fields</label>
    <div id="qf-fields-wrap"></div>
    <button class="btn-secondary" onclick="v3AddQfField()" style="margin-top:.5rem">+ Add Field</button>
    <div class="v3-modal-footer">
      <button class="btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn-primary" onclick="saveQuestionnaire()">Save</button>
    </div>
  </div>`);
  // Add default fields
  v3AddQfField('Full Legal Name', 'text');
  v3AddQfField('Date of Birth', 'date');
  v3AddQfField('Country of Birth', 'text');
  v3AddQfField('Passport Number', 'text');
  v3AddQfField('Current Immigration Status', 'text');
}

function v3AddQfField(label, type) {
  const wrap = document.getElementById('qf-fields-wrap');
  if (!wrap) return;
  const idx = wrap.children.length;
  const div = document.createElement('div');
  div.className = 'v3-qf-field-row';
  div.innerHTML = `
    <input class="v3-input qf-label" placeholder="Field label" value="${escHtml(label||'')}">
    <select class="v3-select qf-type">
      <option value="text" ${type==='text'?'selected':''}>Text</option>
      <option value="date" ${type==='date'?'selected':''}>Date</option>
      <option value="number" ${type==='number'?'selected':''}>Number</option>
      <option value="yesno" ${type==='yesno'?'selected':''}>Yes/No</option>
      <option value="textarea" ${type==='textarea'?'selected':''}>Long Text</option>
    </select>
    <button class="btn-sm btn-danger" onclick="this.parentElement.remove()">✕</button>`;
  wrap.appendChild(div);
}

function saveQuestionnaire() {
  const name = document.getElementById('qf-name')?.value.trim();
  if (!name) { toast('Please enter a questionnaire name','error'); return; }
  const linkedForm = document.getElementById('qf-linked')?.value || '';
  const fieldRows = document.querySelectorAll('#qf-fields-wrap .v3-qf-field-row');
  const fields = Array.from(fieldRows).map(row => ({
    label: row.querySelector('.qf-label')?.value.trim() || '',
    type:  row.querySelector('.qf-type')?.value || 'text',
    id:    'f-' + Math.random().toString(36).slice(2,8),
  })).filter(f => f.label);

  if (!fields.length) { toast('Add at least one field','error'); return; }
  if (!State.questionnaire) State.questionnaire = { templates:[], sent:[], activeTab:'builder' };
  State.questionnaire.templates.push({
    id: 'qtpl-' + Date.now(),
    name, linkedForm, fields,
    createdAt: new Date().toISOString(),
  });
  closeModal();
  toast('Questionnaire saved');
  qSetTab('builder');
}

function showEditQuestionnaire(tplId) {
  const tpl = (State.questionnaire.templates||[]).find(t => t.id === tplId);
  if (!tpl) return;
  const formOptions = USCIS_FORMS_LIBRARY.map(f =>
    `<option value="${escAttr(f.id)}" ${tpl.linkedForm===f.id?'selected':''}>${escHtml(f.id)} – ${escHtml(f.name)}</option>`
  ).join('');

  showModal(`<div class="v3-modal-inner">
    <h2>✏️ Edit Questionnaire</h2>
    <input type="hidden" id="qe-id" value="${escAttr(tplId)}">
    <label class="v3-label">Name</label>
    <input id="qe-name" class="v3-input" value="${escHtml(tpl.name)}">
    <label class="v3-label">Linked Form</label>
    <select id="qe-linked" class="v3-select"><option value="">— None —</option>${formOptions}</select>
    <label class="v3-label">Fields</label>
    <div id="qf-fields-wrap">${tpl.fields.map(f=>`
      <div class="v3-qf-field-row">
        <input class="v3-input qf-label" value="${escHtml(f.label)}">
        <select class="v3-select qf-type">
          ${['text','date','number','yesno','textarea'].map(t=>`<option value="${t}"${f.type===t?' selected':''}>${t}</option>`).join('')}
        </select>
        <button class="btn-sm btn-danger" onclick="this.parentElement.remove()">✕</button>
      </div>`).join('')}</div>
    <button class="btn-secondary" onclick="v3AddQfField()" style="margin-top:.5rem">+ Add Field</button>
    <div class="v3-modal-footer">
      <button class="btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn-primary" onclick="updateQuestionnaire()">Save Changes</button>
    </div>
  </div>`);
}

function updateQuestionnaire() {
  const id = document.getElementById('qe-id')?.value;
  const tpl = (State.questionnaire.templates||[]).find(t => t.id === id);
  if (!tpl) return;
  tpl.name = document.getElementById('qe-name')?.value.trim() || tpl.name;
  tpl.linkedForm = document.getElementById('qe-linked')?.value || '';
  const fieldRows = document.querySelectorAll('#qf-fields-wrap .v3-qf-field-row');
  tpl.fields = Array.from(fieldRows).map(row => ({
    label: row.querySelector('.qf-label')?.value.trim() || '',
    type:  row.querySelector('.qf-type')?.value || 'text',
    id:    'f-' + Math.random().toString(36).slice(2,8),
  })).filter(f => f.label);
  closeModal();
  toast('Questionnaire updated');
  qSetTab('builder');
}

function deleteQuestionnaire(tplId) {
  if (!confirm('Delete this questionnaire?')) return;
  if (State.questionnaire) {
    State.questionnaire.templates = (State.questionnaire.templates||[]).filter(t => t.id !== tplId);
  }
  qSetTab('builder');
}

function showSendQuestionnaire(tplId) {
  const tpl = (State.questionnaire.templates||[]).find(t => t.id === tplId);
  if (!tpl) return;
  const caseOptions = (State.cases||[]).map(c =>
    `<option value="${escAttr(c.id)}">${escHtml(c.firstName)} ${escHtml(c.lastName)} — ${escHtml(c.email||'')}</option>`
  ).join('');

  showModal(`<div class="v3-modal-inner">
    <h2>📤 Send Questionnaire: ${escHtml(tpl.name)}</h2>
    <label class="v3-label">Send To (select a case/client)</label>
    <select id="qsend-case" class="v3-select">${caseOptions}</select>
    <label class="v3-label">Or enter email directly</label>
    <input id="qsend-email" class="v3-input" placeholder="client@email.com">
    <p class="v3-hint">The client will receive a link to fill out the form. Their answers will be saved here.</p>
    <div class="v3-modal-footer">
      <button class="btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn-primary" onclick="sendQuestionnaire('${escAttr(tplId)}')">Send</button>
    </div>
  </div>`);
}

function sendQuestionnaire(tplId) {
  const tpl = (State.questionnaire.templates||[]).find(t => t.id === tplId);
  if (!tpl) return;
  const caseId = document.getElementById('qsend-case')?.value;
  const manualEmail = document.getElementById('qsend-email')?.value.trim();
  const c = caseId ? State.cases.find(x => x.id === caseId) : null;
  const recipientEmail = manualEmail || (c ? c.email : '');
  const recipientName  = c ? `${c.firstName} ${c.lastName}` : recipientEmail;

  if (!recipientEmail) { toast('Enter an email address','error'); return; }

  if (!State.questionnaire) State.questionnaire = { templates:[], sent:[], activeTab:'builder' };
  const sentEntry = {
    id: 'qs-' + Date.now(),
    tplId, formName: tpl.name,
    caseId: caseId || null,
    recipientEmail,
    recipientName,
    sentAt: new Date().toISOString(),
    completed: false,
    answers: {},
  };
  State.questionnaire.sent.push(sentEntry);
  if (c) activityAdd(c.id, 'note', `Questionnaire sent: ${tpl.name}`, `Sent to ${recipientEmail}`);
  closeModal();
  toast(`Questionnaire sent to ${recipientEmail}`);
  qSetTab('sent');
}

function showQResponses(sentId) {
  const sent = (State.questionnaire && State.questionnaire.sent || []).find(s => s.id === sentId);
  if (!sent) return;
  const tpl = (State.questionnaire.templates||[]).find(t => t.id === sent.tplId);
  if (!tpl) return;
  const rows = tpl.fields.map(f =>
    `<tr><td><strong>${escHtml(f.label)}</strong></td><td>${escHtml(sent.answers[f.id]||'—')}</td></tr>`
  ).join('');
  showModal(`<div class="v3-modal-inner">
    <h2>📋 Responses: ${escHtml(tpl.name)}</h2>
    <p>From: <strong>${escHtml(sent.recipientName||sent.recipientEmail)}</strong></p>
    <table class="v3-rpt-table" style="margin-top:1rem"><tbody>${rows}</tbody></table>
    <div class="v3-modal-footer">
      <button class="btn-primary" onclick="closeModal()">Close</button>
    </div>
  </div>`);
}

/* ============================================================
   SECTION 4F – BOOT INTEGRATION + DASHBOARD PATCH + CSS
   ============================================================ */

// Run migration on all cases at boot
function _v3RunMigration() {
  if (!State || !State.cases) return;
  State.cases.forEach(c => _v3MigrateCase(c));
}

// Patch boot: run migration after Auth.ready
if (typeof Auth !== 'undefined' && Auth.ready && typeof Auth.ready.then === 'function') {
  Auth.ready.then(() => {
    _v3RunMigration();
  }).catch(() => {});
} else {
  // Fallback: wait for DOMContentLoaded
  document.addEventListener('DOMContentLoaded', () => {
    const tryMigrate = () => {
      if (typeof State !== 'undefined' && State.cases) {
        _v3RunMigration();
      } else {
        setTimeout(tryMigrate, 500);
      }
    };
    setTimeout(tryMigrate, 1000);
  });
}

// Patch renderDashboard to inject alerts panel
(function _v3PatchDashboard() {
  const _origRenderDashboard = (typeof renderDashboard === 'function') ? renderDashboard : null;
  if (!_origRenderDashboard) return;

  renderDashboard = function() {
    const original = _origRenderDashboard();
    const alertsHtml = renderAlertsPanel();
    // Inject alerts panel at the top of main-content
    return original.replace(
      /(<div[^>]+class="[^"]*main-content[^"]*"[^>]*>)/,
      `$1${alertsHtml}`
    );
  };
})();

// ── V3 CSS Styles ─────────────────────────────────────────
(function _v3InjectCSS() {
  const style = document.createElement('style');
  style.id = 'v3-styles';
  style.textContent = `
/* ── V3 dark-theme styles (uses existing CSS variables) ── */

/* Badges */
.v3-badge { display:inline-block; padding:2px 9px; border-radius:20px; font-size:.7rem; font-weight:600; letter-spacing:.04em; }
.v3-badge-crit { background:var(--red-dim); color:var(--red); border:1px solid rgba(248,113,113,.2); }
.v3-badge-warn { background:var(--yellow-dim); color:var(--yellow); border:1px solid rgba(251,191,36,.2); }
.v3-badge-ok   { background:var(--green-dim); color:var(--green); border:1px solid rgba(74,222,128,.2); }
.v3-badge-rfe  { background:rgba(251,146,60,.1); color:#fb923c; border:1px solid rgba(251,146,60,.2); }
.v3-badge-platform { background:var(--gold-dim); color:var(--gold); border:1px solid var(--border); }
.v3-badge-blue { background:var(--blue-dim); color:var(--blue); border:1px solid rgba(96,165,250,.2); }

/* Sidebar extras */
.sidebar-user { display:flex; align-items:center; gap:.5rem; padding:.6rem 1rem; background:var(--surface); border-radius:var(--radius); margin:.5rem .75rem; font-size:.82rem; color:var(--text-2); border:1px solid var(--border-2); }
.sidebar-avatar { font-size:1rem; }
.v3-sidebar-rfe { padding:.4rem 1.25rem; font-size:.78rem; color:var(--yellow); opacity:.85; }

/* Alerts panel */
.v3-alerts-panel { margin:0 0 1.5rem; }
.v3-alert { display:flex; align-items:flex-start; gap:.75rem; padding:.7rem 1rem; border-radius:var(--radius); margin-bottom:.5rem; font-size:.85rem; color:var(--text-2); }
.v3-alert-crit { background:var(--red-dim); border-left:3px solid var(--red); }
.v3-alert-warn { background:var(--yellow-dim); border-left:3px solid var(--yellow); }
.v3-alert-info { background:var(--blue-dim); border-left:3px solid var(--blue); }
.v3-alert a { color:var(--gold-light); font-weight:600; text-decoration:none; cursor:pointer; }
.v3-alert a:hover { text-decoration:underline; }
.v3-no-alerts { padding:.7rem 1rem; background:var(--green-dim); border-radius:var(--radius); color:var(--green); font-size:.85rem; border:1px solid rgba(74,222,128,.2); }

/* Tab bars */
.v3-tab-bar { display:flex; gap:.4rem; margin-bottom:1.25rem; flex-wrap:wrap; border-bottom:1px solid var(--border-2); padding-bottom:.5rem; }
.v3-tab-btn { padding:.4rem 1rem; border:1px solid var(--border-2); border-radius:20px; background:transparent; color:var(--text-3); cursor:pointer; font-size:.82rem; font-family:var(--font-sans); transition:all .15s; }
.v3-tab-btn.active { background:var(--gold-dim); color:var(--gold-light); border-color:var(--border); }
.v3-tab-btn:hover:not(.active) { background:var(--surface-2); color:var(--text-2); border-color:var(--border-2); }

/* Fee stat cards */
.v3-fee-stat-cards { display:flex; gap:1rem; flex-wrap:wrap; margin-bottom:1.5rem; }
.v3-fee-stat-card { flex:1; min-width:140px; background:var(--surface); border:1px solid var(--border-2); border-radius:var(--radius-lg); padding:1.1rem 1.25rem; transition:border-color .2s; }
.v3-fee-stat-card:hover { border-color:var(--border); }
.v3-fee-stat-label { font-size:.72rem; font-weight:600; letter-spacing:.1em; text-transform:uppercase; color:var(--text-3); }
.v3-fee-stat-amount { font-family:var(--font-serif); font-size:1.8rem; font-weight:600; margin-top:.2rem; color:var(--gold-light); }
.v3-fee-stat-card.paid .v3-fee-stat-amount { color:var(--green); }
.v3-fee-stat-card.unpaid .v3-fee-stat-amount { color:var(--red); }

/* Fee list */
.v3-fee-list { display:flex; flex-direction:column; gap:.5rem; margin-top:1rem; }
.v3-fee-item { background:var(--surface-2); border:1px solid var(--border-2); border-radius:var(--radius); padding:.85rem 1.1rem; display:flex; align-items:center; gap:1rem; flex-wrap:wrap; transition:border-color .15s; }
.v3-fee-item:hover { border-color:var(--border); }
.v3-fee-item-info { flex:1; }
.v3-fee-item-desc { font-weight:500; color:var(--text); font-size:.88rem; }
.v3-fee-item-meta { font-size:.78rem; color:var(--text-3); margin-top:.2rem; }
.v3-fee-item-amount { font-size:1rem; font-weight:600; color:var(--text); }
.v3-fee-status { padding:2px 9px; border-radius:20px; font-size:.72rem; font-weight:600; letter-spacing:.04em; }
.v3-fee-status.paid { background:var(--green-dim); color:var(--green); border:1px solid rgba(74,222,128,.2); }
.v3-fee-status.pending { background:var(--yellow-dim); color:var(--yellow); border:1px solid rgba(251,191,36,.2); }
.v3-fee-status.overdue { background:var(--red-dim); color:var(--red); border:1px solid rgba(248,113,113,.2); }

/* Invoice */
.v3-invoice-box { border:1px solid var(--border-2); border-radius:var(--radius-lg); padding:1.5rem; background:var(--surface); margin-top:1.5rem; }
.v3-invoice-header { display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:1rem; margin-bottom:1.5rem; }
.v3-invoice-title { font-family:var(--font-serif); font-size:1.5rem; font-weight:500; color:var(--white); }
.v3-invoice-number { color:var(--text-3); font-size:.85rem; }
.v3-invoice-table { width:100%; border-collapse:collapse; margin:.75rem 0; }
.v3-invoice-table th { text-align:left; font-size:.72rem; font-weight:600; text-transform:uppercase; letter-spacing:.1em; color:var(--text-3); padding:.5rem .75rem; border-bottom:2px solid var(--border-2); }
.v3-invoice-table td { padding:.6rem .75rem; border-bottom:1px solid var(--border-2); color:var(--text-2); font-size:.88rem; }
.v3-invoice-total { text-align:right; font-size:1.05rem; font-weight:600; color:var(--gold-light); margin-top:.75rem; }

/* Activity log */
.v3-activity-feed { display:flex; flex-direction:column; }
.v3-activity-item { display:flex; gap:1rem; padding:.75rem 0; border-bottom:1px solid var(--border-2); }
.v3-activity-item:last-child { border-bottom:none; }
.v3-activity-icon { width:34px; height:34px; border-radius:50%; background:var(--surface-2); border:1px solid var(--border-2); display:flex; align-items:center; justify-content:center; font-size:.95rem; flex-shrink:0; }
.v3-activity-body { flex:1; min-width:0; }
.v3-activity-desc { font-size:.85rem; font-weight:500; color:var(--text); }
.v3-activity-meta { font-size:.75rem; color:var(--text-3); margin-top:.15rem; }
.v3-activity-detail { font-size:.8rem; color:var(--text-2); margin-top:.3rem; background:var(--bg-2); border-radius:var(--radius); padding:.35rem .6rem; border:1px solid var(--border-2); }

/* Communication log */
.v3-comm-list { display:flex; flex-direction:column; gap:.5rem; }
.v3-comm-item { background:var(--surface-2); border:1px solid var(--border-2); border-radius:var(--radius); padding:.85rem 1.1rem; transition:border-color .15s; }
.v3-comm-item:hover { border-color:var(--border); }
.v3-comm-header { display:flex; align-items:center; gap:.75rem; margin-bottom:.35rem; flex-wrap:wrap; }
.v3-comm-type { font-size:.72rem; font-weight:600; padding:2px 9px; border-radius:20px; letter-spacing:.04em; }
.v3-comm-type.call { background:var(--blue-dim); color:var(--blue); border:1px solid rgba(96,165,250,.2); }
.v3-comm-type.zoom { background:rgba(168,85,247,.1); color:#c084fc; border:1px solid rgba(168,85,247,.2); }
.v3-comm-type.email { background:var(--green-dim); color:var(--green); border:1px solid rgba(74,222,128,.2); }
.v3-comm-notes { font-size:.83rem; color:var(--text-2); line-height:1.55; }

/* Consultation tab */
.v3-consult-list { display:flex; flex-direction:column; gap:.5rem; }
.v3-consult-item { background:var(--surface-2); border:1px solid var(--border-2); border-radius:var(--radius); padding:.9rem 1.1rem; transition:border-color .15s; }
.v3-consult-item:hover { border-color:var(--border); }
.v3-consult-header { display:flex; align-items:center; gap:.75rem; margin-bottom:.4rem; flex-wrap:wrap; }
.v3-consult-date { font-weight:600; font-size:.88rem; color:var(--text); }
.v3-consult-type { font-size:.72rem; padding:2px 9px; border-radius:20px; background:var(--gold-dim); color:var(--gold); border:1px solid var(--border); }
.v3-consult-notes { font-size:.83rem; color:var(--text-2); line-height:1.55; }
.v3-consult-fee { font-size:.8rem; color:var(--green); font-weight:600; }

/* Key dates panel */
.v3-key-dates { background:var(--surface); border:1px solid var(--border-2); border-radius:var(--radius-lg); padding:1.1rem 1.25rem; margin-bottom:1.25rem; }
.v3-key-dates h4 { margin:0 0 .75rem; font-size:.72rem; font-weight:600; text-transform:uppercase; letter-spacing:.1em; color:var(--text-3); }
.v3-key-dates-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(175px,1fr)); gap:.6rem; }
.v3-kd-item { background:var(--surface-2); border:1px solid var(--border-2); border-radius:var(--radius); padding:.6rem .8rem; }
.v3-kd-label { font-size:.7rem; font-weight:600; letter-spacing:.08em; text-transform:uppercase; color:var(--text-3); }
.v3-kd-value { font-weight:500; font-size:.88rem; color:var(--text-2); margin-top:.2rem; }
.v3-kd-item.urgent { border-color:rgba(248,113,113,.3); }
.v3-kd-item.urgent .v3-kd-value { color:var(--red); }
.v3-kd-item.warning { border-color:rgba(251,191,36,.3); }
.v3-kd-item.warning .v3-kd-value { color:var(--yellow); }

/* RFE countdown */
.v3-rfe-countdown { background:var(--yellow-dim); border:1px solid rgba(251,191,36,.25); border-radius:var(--radius-lg); padding:1rem 1.25rem; margin-bottom:1.25rem; display:flex; align-items:center; gap:1rem; }
.v3-rfe-days { font-family:var(--font-serif); font-size:2.2rem; font-weight:600; color:var(--yellow); }
.v3-rfe-label { font-size:.85rem; color:var(--text-2); }
.v3-rfe-days.urgent { color:var(--red); }

/* Multi-case client panel */
.v3-client-cases-panel { background:var(--gold-dim); border:1px solid var(--border); border-radius:var(--radius-lg); padding:1rem 1.25rem; margin-bottom:1.25rem; }
.v3-client-cases-panel h4 { margin:0 0 .6rem; font-size:.78rem; font-weight:600; letter-spacing:.08em; text-transform:uppercase; color:var(--gold); }
.v3-case-chip { display:inline-flex; align-items:center; gap:.4rem; padding:.25rem .75rem; border-radius:20px; background:var(--surface); border:1px solid var(--border-2); font-size:.8rem; color:var(--text-2); cursor:pointer; margin:.2rem; transition:all .15s; }
.v3-case-chip:hover { border-color:var(--border); color:var(--text); background:var(--surface-2); }
.v3-case-chip.current { background:var(--gold-dim); color:var(--gold-light); border-color:var(--border); cursor:default; }

/* Social Media — full redesign */
.sm-page { display:flex; flex-direction:column; gap:0; height:100%; }
.sm-page-header { margin-bottom:1.25rem; }
.sm-page-title { font-family:var(--font-serif); font-size:1.7rem; font-weight:400; color:var(--white); margin:0 0 .25rem; }
.sm-page-sub { font-size:.83rem; color:var(--text-3); margin:0; }

/* Tab bar */
.sm-tab-bar { display:flex; gap:.35rem; margin-bottom:1.5rem; border-bottom:1px solid var(--border-2); padding-bottom:.75rem; }
.sm-tab-btn { padding:.4rem 1.1rem; border-radius:20px; background:transparent; border:1px solid var(--border-2); color:var(--text-3); font-size:.82rem; font-family:var(--font-sans); cursor:pointer; transition:all .15s; white-space:nowrap; }
.sm-tab-btn:hover { background:var(--surface-2); color:var(--text-2); border-color:var(--border); }
.sm-tab-active { background:var(--gold-dim) !important; color:var(--gold-light) !important; border-color:var(--border) !important; }

/* Assistant layout */
.sm-assistant-layout { display:flex; flex-direction:column; gap:0; }
.sm-chat-panel { display:flex; flex-direction:column; gap:0; background:var(--surface); border:1px solid var(--border-2); border-radius:var(--radius-lg); overflow:hidden; }

/* Messages area */
.sm-chat-messages { padding:1.25rem; min-height:220px; max-height:420px; overflow-y:auto; display:flex; flex-direction:column; gap:1rem; }

/* Empty state */
.sm-empty-state { display:flex; flex-direction:column; align-items:center; padding:2.5rem 1rem; text-align:center; }
.sm-empty-icon { font-size:2.5rem; margin-bottom:.75rem; opacity:.7; }
.sm-empty-title { font-family:var(--font-serif); font-size:1.2rem; font-weight:400; color:var(--text-2); margin-bottom:.35rem; }
.sm-empty-sub { font-size:.83rem; color:var(--text-3); max-width:440px; line-height:1.6; margin-bottom:1.25rem; }
.sm-suggestions { display:flex; gap:.5rem; flex-wrap:wrap; justify-content:center; }
.sm-suggest-btn { padding:.35rem .85rem; border:1px solid var(--border-2); border-radius:20px; background:var(--surface-2); color:var(--text-2); font-size:.78rem; font-family:var(--font-sans); cursor:pointer; transition:all .15s; }
.sm-suggest-btn:hover { border-color:var(--border); color:var(--gold-light); background:var(--gold-dim); }

/* Chat bubbles */
.sm-bubble-row { display:flex; gap:.75rem; align-items:flex-end; }
.sm-bubble-user { flex-direction:row-reverse; }
.sm-avatar { width:28px; height:28px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:.62rem; font-weight:700; letter-spacing:.04em; flex-shrink:0; }
.sm-avatar-user { background:var(--gold-dim); color:var(--gold); border:1px solid var(--border); }
.sm-avatar-ai { background:var(--surface-2); color:var(--text-3); border:1px solid var(--border-2); }
.sm-bubble { max-width:76%; border-radius:var(--radius-lg); padding:.7rem 1rem; font-size:.85rem; line-height:1.6; }
.sm-bubble-user-inner { background:var(--gold-dim); border:1px solid var(--border); color:var(--text); border-bottom-right-radius:4px; }
.sm-bubble-ai-inner { background:var(--surface-2); border:1px solid var(--border-2); color:var(--text-2); border-bottom-left-radius:4px; }
.sm-plat-tag { display:inline-block; font-size:.7rem; font-weight:600; background:var(--surface-3); color:var(--text-3); padding:1px 7px; border-radius:8px; margin-bottom:.35rem; }
.sm-bubble-text { white-space:pre-wrap; }

/* Draft card inside AI bubble */
.sm-draft-card { margin-top:.85rem; background:var(--bg-2); border:1px solid var(--border); border-radius:var(--radius); overflow:hidden; }
.sm-draft-card-header { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:.5rem; padding:.6rem .85rem; border-bottom:1px solid var(--border-2); background:var(--surface-3); }
.sm-draft-for { font-size:.78rem; font-weight:600; color:var(--gold); }
.sm-draft-warning { font-size:.72rem; color:var(--yellow); opacity:.8; }
.sm-draft-preview { padding:.75rem .85rem; font-size:.82rem; color:var(--text-2); white-space:pre-wrap; line-height:1.6; max-height:160px; overflow-y:auto; }
.sm-draft-btns { display:flex; gap:.5rem; padding:.6rem .85rem; border-top:1px solid var(--border-2); justify-content:flex-end; }

/* Composer */
.sm-composer { border-top:1px solid var(--border-2); background:var(--surface-2); padding:1rem 1.25rem; }
.sm-composer-inner { display:flex; flex-direction:column; gap:.65rem; }
.sm-composer-top { display:flex; align-items:center; gap:.75rem; flex-wrap:wrap; }
.sm-composer-label { font-size:.7rem; font-weight:600; text-transform:uppercase; letter-spacing:.1em; color:var(--text-3); white-space:nowrap; }
.sm-platform-pills { display:flex; gap:.4rem; flex-wrap:wrap; }
.sm-plat-pill { display:flex; align-items:center; gap:.35rem; padding:.25rem .65rem; border-radius:20px; border:1px solid var(--border-2); background:var(--surface); color:var(--text-2); font-size:.78rem; font-family:var(--font-sans); cursor:pointer; transition:all .15s; user-select:none; }
.sm-plat-pill:has(input:checked) { background:var(--gold-dim); border-color:var(--border); color:var(--gold-light); }
.sm-plat-pill input { display:none; }
.sm-composer-input-row { display:flex; gap:.65rem; align-items:flex-end; }
.sm-textarea { flex:1; background:var(--bg-2); border:1px solid var(--border-2); border-radius:var(--radius); padding:.65rem .85rem; font-size:.88rem; font-family:var(--font-sans); color:var(--text); resize:none; outline:none; transition:border-color .2s; line-height:1.55; min-height:52px; }
.sm-textarea:focus { border-color:var(--gold); }
.sm-textarea::placeholder { color:var(--text-3); }
.sm-send-btn { display:flex; align-items:center; gap:.4rem; padding:.65rem 1.1rem; background:var(--gold); color:var(--bg); border:none; border-radius:var(--radius); font-size:.85rem; font-weight:600; font-family:var(--font-sans); cursor:pointer; flex-shrink:0; transition:all .15s; align-self:flex-end; height:40px; }
.sm-send-btn:hover { background:var(--gold-light); transform:translateY(-1px); }
.sm-composer-hint { font-size:.7rem; color:var(--text-3); }

/* Accounts grid */
.v3-accounts-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(200px,1fr)); gap:1rem; }
.v3-account-card { background:var(--surface); border:1px solid var(--border-2); border-radius:var(--radius-lg); padding:1.5rem 1.25rem; text-align:center; display:flex; flex-direction:column; align-items:center; gap:.5rem; transition:border-color .2s; }
.v3-account-card:hover { border-color:var(--border); }
.v3-account-icon { font-size:2.2rem; margin-bottom:.25rem; }
.v3-account-name { font-weight:600; color:var(--text); font-size:.9rem; }
.v3-account-connected { font-size:.78rem; color:var(--green); }
.v3-account-disconnected { font-size:.78rem; color:var(--text-3); }

/* Reports */
.v3-rpt-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(360px,1fr)); gap:1.25rem; }
.v3-rpt-card { background:var(--surface); border:1px solid var(--border-2); border-radius:var(--radius-lg); padding:1.25rem; }
.v3-rpt-card h3 { margin:0 0 1rem; font-size:.88rem; font-weight:600; letter-spacing:.06em; text-transform:uppercase; color:var(--text-3); }
.v3-rpt-table { width:100%; border-collapse:collapse; font-size:.83rem; }
.v3-rpt-table th { text-align:left; padding:.45rem .75rem; border-bottom:2px solid var(--border-2); font-size:.7rem; font-weight:600; text-transform:uppercase; letter-spacing:.1em; color:var(--text-3); }
.v3-rpt-table td { padding:.45rem .75rem; border-bottom:1px solid var(--border-2); color:var(--text-2); }
.v3-rpt-table tr:last-child td { border-bottom:none; }
.v3-rpt-count { font-weight:700; font-size:1rem; color:var(--gold-light); }
.v3-name-chip { display:inline-block; background:var(--surface-2); border:1px solid var(--border-2); border-radius:4px; padding:1px 7px; font-size:.75rem; color:var(--text-2); cursor:pointer; margin:1px; transition:all .12s; }
.v3-name-chip:hover { border-color:var(--border); color:var(--text); }
.v3-paid { color:var(--green); font-weight:600; }
.v3-unpaid { color:var(--red); font-weight:600; }
.v3-fee-summary-row { display:flex; gap:1.5rem; flex-wrap:wrap; margin-bottom:1rem; padding:.75rem; background:var(--surface-2); border-radius:var(--radius); border:1px solid var(--border-2); }
.v3-fee-stat { }
.v3-fee-stat-label { font-size:.72rem; font-weight:600; text-transform:uppercase; letter-spacing:.08em; color:var(--text-3); }
.v3-fee-stat-val { font-family:var(--font-serif); font-size:1.4rem; font-weight:500; color:var(--gold-light); }

/* Questionnaire */
.v3-q-card { background:var(--surface-2); border:1px solid var(--border-2); border-radius:var(--radius); padding:.9rem 1.1rem; margin-bottom:.5rem; transition:border-color .15s; }
.v3-q-card:hover { border-color:var(--border); }
.v3-q-card-header { display:flex; align-items:center; gap:.75rem; flex-wrap:wrap; margin-bottom:.6rem; }
.v3-q-card-actions { display:flex; gap:.5rem; flex-wrap:wrap; }
.v3-qf-field-row { display:flex; gap:.5rem; align-items:center; margin-bottom:.4rem; }
.v3-qf-field-row .v3-input { flex:1; }
.v3-link { color:var(--gold); }
.v3-link:hover { color:var(--gold-light); }
.v3-hint { font-size:.8rem; color:var(--text-3); margin-top:.4rem; }
.v3-empty { color:var(--text-3); font-style:italic; padding:.4rem 0; font-size:.85rem; }
.v3-list { display:flex; flex-direction:column; gap:.5rem; }
.v3-list-item { background:var(--surface-2); border:1px solid var(--border-2); border-radius:var(--radius); padding:.9rem 1.1rem; transition:border-color .15s; }
.v3-list-item:hover { border-color:var(--border); }
.v3-li-header { display:flex; align-items:center; gap:.75rem; flex-wrap:wrap; margin-bottom:.4rem; }
.v3-li-date { font-size:.78rem; color:var(--text-3); }
.v3-li-body { font-size:.85rem; color:var(--text-2); white-space:pre-wrap; line-height:1.55; }
.v3-li-actions { display:flex; gap:.5rem; margin-top:.6rem; }

/* Modal inner */
.v3-modal-inner { padding:.25rem; }
.v3-modal-inner h2 { margin:0 0 1.25rem; font-family:var(--font-serif); font-size:1.4rem; font-weight:400; color:var(--white); }
.v3-label { display:block; font-size:.72rem; font-weight:600; letter-spacing:.1em; text-transform:uppercase; color:var(--text-3); margin:.85rem 0 .3rem; }
.v3-input { width:100%; padding:.55rem .75rem; border:1px solid var(--border-2); border-radius:var(--radius); font-size:.88rem; font-family:var(--font-sans); color:var(--text); background:var(--bg-2); box-sizing:border-box; outline:none; transition:border-color .2s; }
.v3-input:focus { border-color:var(--gold); }
.v3-input::placeholder { color:var(--text-3); }
.v3-select { width:100%; padding:.55rem .75rem; border:1px solid var(--border-2); border-radius:var(--radius); font-size:.88rem; font-family:var(--font-sans); color:var(--text-2); background:var(--bg-2); box-sizing:border-box; outline:none; transition:border-color .2s; cursor:pointer; }
.v3-select:focus { border-color:var(--gold); }
.v3-textarea { width:100%; padding:.55rem .75rem; border:1px solid var(--border-2); border-radius:var(--radius); font-size:.85rem; font-family:var(--font-sans); color:var(--text-2); background:var(--bg-2); resize:vertical; box-sizing:border-box; outline:none; transition:border-color .2s; line-height:1.6; }
.v3-textarea:focus { border-color:var(--gold); }
.v3-modal-footer { display:flex; gap:.75rem; justify-content:flex-end; margin-top:1.5rem; padding-top:1rem; border-top:1px solid var(--border-2); }

/* Stage confirm modal */
.v3-stage-confirm { text-align:center; padding:.5rem 0; }
.v3-stage-confirm .v3-stage-arrow { font-size:1.75rem; margin:1rem 0; color:var(--text-3); }
.v3-stage-confirm .v3-stage-names { display:flex; align-items:center; justify-content:center; gap:1rem; font-size:.95rem; font-weight:500; color:var(--text); }
.v3-stage-confirm .v3-stage-names .arrow { color:var(--text-3); }

/* v3 Buttons (extend existing .btn system) */
.btn-sm { padding:.3rem .8rem; font-size:.78rem; }
.btn-primary { background:var(--gold); color:var(--bg); border:none; }
.btn-primary:hover { background:var(--gold-light); transform:translateY(-1px); }
.btn-secondary { background:transparent; color:var(--text-2); border:1px solid var(--border-2); }
.btn-secondary:hover { background:var(--surface); border-color:var(--border); color:var(--text); }
.btn-success { background:var(--green-dim); color:var(--green); border:1px solid rgba(74,222,128,.2); }
.btn-success:hover { background:rgba(74,222,128,.18); }
.btn-danger { background:var(--red-dim); color:var(--red); border:1px solid rgba(248,113,113,.2); }
.btn-danger:hover { background:rgba(248,113,113,.18); }

/* Layout fix: v3 full-page views go inside .content which already has padding */
.v3-social, .v3-reports, .v3-questionnaire { }
  `;
  document.head.appendChild(style);
})();

// ── END OF V3 ──────────────────────────────────────────────
console.log('[v3] Case Manager v3 loaded ✓');
