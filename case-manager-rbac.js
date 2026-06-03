/* ============================================================
   Kamkhadze PA — Role-Based Access Control (RBAC) Layer
   Requires: case-manager-auth.js, case-manager.js loaded first
   ============================================================ */

const RBAC = (() => {
  // ---- Storage Keys ----
  const ROLES_KEY       = 'km_roles_v1';          // encrypted role config (reserved for future multi-user sync)
  const USER_ROLE_KEY   = 'km_user_role_v1';      // plain JSON: { username, role }
  const STAFF_KEY       = 'km_staff_v1';          // plain JSON array of staff members
  const ASSIGNMENTS_KEY = 'km_case_assignments_v1'; // plain JSON object: { caseId: { attorney, cm } }

  // ---- Role Constants ----
  const ROLES = {
    MA: 'managing_attorney',
    AA: 'associate_attorney',
    CM: 'case_manager',
  };

  // ---- Role Display Labels ----
  const ROLE_LABELS = {
    managing_attorney:  'Managing Attorney',
    associate_attorney: 'Associate Attorney',
    case_manager:       'Case Manager',
  };

  // ---- Role Badge Colors ----
  const ROLE_COLORS = {
    managing_attorney:  '#4f46e5',  // indigo
    associate_attorney: '#0891b2',  // cyan
    case_manager:       '#059669',  // emerald
  };

  // ---- Permission Matrix ----
  const PERMISSIONS = {
    managing_attorney: {
      view_all_cases:  true,
      view_billing:    true,
      manage_users:    true,
      reassign_cases:  true,
      view_reports:    true,
      edit_cases:      true,
      view_financials: true,
      send_emails:     true,
      generate_docs:   true,
    },
    associate_attorney: {
      view_all_cases:  false,
      view_billing:    false,
      manage_users:    false,
      reassign_cases:  false,
      view_reports:    true,   // own cases only
      edit_cases:      true,
      view_financials: true,
      send_emails:     true,
      generate_docs:   true,
    },
    case_manager: {
      view_all_cases:  false,
      view_billing:    false,
      manage_users:    false,
      reassign_cases:  false,
      view_reports:    true,   // own cases only
      edit_cases:      true,   // limited — UI enforces further restrictions
      view_financials: false,
      send_emails:     true,
      generate_docs:   true,
    },
  };

  // ---- Internal Helpers ----

  function _readStaff() {
    try {
      return JSON.parse(localStorage.getItem(STAFF_KEY) || '[]');
    } catch {
      return [];
    }
  }

  function _writeStaff(staff) {
    localStorage.setItem(STAFF_KEY, JSON.stringify(staff));
  }

  function _readAssignments() {
    try {
      return JSON.parse(localStorage.getItem(ASSIGNMENTS_KEY) || '{}');
    } catch {
      return {};
    }
  }

  function _writeAssignments(assignments) {
    localStorage.setItem(ASSIGNMENTS_KEY, JSON.stringify(assignments));
  }

  function _currentUsername() {
    // Auth.username is set after login
    return (typeof Auth !== 'undefined' && Auth.username) ? Auth.username : '';
  }

  // ---- Public API ----

  /**
   * Returns the current user's role string.
   * If no role is stored, defaults to managing_attorney (first user is always MA).
   */
  function getRole() {
    try {
      const raw = localStorage.getItem(USER_ROLE_KEY);
      if (!raw) return ROLES.MA;
      const config = JSON.parse(raw);
      const username = _currentUsername();
      // Validate stored username matches current session user
      if (username && config.username && config.username !== username) {
        return ROLES.MA; // fallback — may be a different user's session
      }
      return config.role || ROLES.MA;
    } catch {
      return ROLES.MA;
    }
  }

  /**
   * Returns true if the current role has the given permission.
   * @param {string} permission
   */
  function can(permission) {
    const role = getRole();
    const matrix = PERMISSIONS[role];
    if (!matrix) return false;
    // Unknown permissions default to false (deny-by-default)
    return matrix[permission] === true;
  }

  /**
   * Returns the staff list from km_staff_v1.
   * @returns {Array<{id: string, name: string, role: string, email: string}>}
   */
  function getStaff() {
    return _readStaff();
  }

  /**
   * Saves (creates or updates) a staff member.
   * Matches by id; inserts if not found.
   * @param {{ id: string, name: string, role: string, email: string }} staff
   */
  function saveStaff(staff) {
    if (!staff || !staff.id) {
      staff = Object.assign({ id: (typeof uuid === 'function' ? uuid() : Date.now().toString(36)) }, staff);
    }
    const list = _readStaff();
    const idx = list.findIndex(s => s.id === staff.id);
    if (idx >= 0) {
      list[idx] = Object.assign(list[idx], staff);
    } else {
      list.push(staff);
    }
    _writeStaff(list);
    return staff;
  }

  /**
   * Returns cases visible to the given username based on their role.
   * Managing attorneys see all cases; others see only assigned cases.
   * @param {string} [username] - defaults to current user
   * @returns {Array} filtered cases array
   */
  function getVisibleCases(username) {
    const uname = username || _currentUsername();
    const role = getRole();
    const allCases = (typeof State !== 'undefined' && Array.isArray(State.cases)) ? State.cases : [];

    if (role === ROLES.MA) {
      return allCases;
    }

    const assignments = _readAssignments();
    return allCases.filter(c => {
      const a = assignments[c.id];
      if (!a) return false;
      return a.attorney === uname || a.cm === uname;
    });
  }

  /**
   * Assigns a case to an attorney and/or case manager.
   * Only managing_attorney can reassign; others can only be assigned by MA.
   * @param {string} caseId
   * @param {string} attorneyUsername
   * @param {string} cmUsername
   */
  function assignCase(caseId, attorneyUsername, cmUsername) {
    const assignments = _readAssignments();
    assignments[caseId] = {
      attorney: attorneyUsername || '',
      cm: cmUsername || '',
      assignedAt: new Date().toISOString(),
    };
    _writeAssignments(assignments);
  }

  /**
   * Sets the role for a given username and persists to km_user_role_v1.
   * Called during setup or by a managing_attorney.
   * @param {string} username
   * @param {string} role - one of the ROLES values
   */
  function setUserRole(username, role) {
    if (!Object.values(ROLES).includes(role)) {
      console.warn('RBAC.setUserRole: unknown role', role);
      return;
    }
    localStorage.setItem(USER_ROLE_KEY, JSON.stringify({ username, role }));
  }

  /**
   * Renders the user management panel HTML.
   * Should only be called / shown when RBAC.can('manage_users') is true.
   * @returns {string} HTML string
   */
  function renderUserManagement() {
    const staff = _readStaff();
    const assignments = _readAssignments();
    const allCases = (typeof State !== 'undefined' && Array.isArray(State.cases)) ? State.cases : [];

    // Count assigned cases per username
    function countAssigned(username) {
      return Object.values(assignments).filter(
        a => a.attorney === username || a.cm === username
      ).length;
    }

    const staffRows = staff.length === 0
      ? `<tr><td colspan="5" style="text-align:center;color:#9ca3af;padding:1.5rem;">No team members added yet.</td></tr>`
      : staff.map(s => {
          const badge = roleBadge(s.role);
          const count = countAssigned(s.email || s.name);
          return `
          <tr data-staff-id="${_esc(s.id)}">
            <td style="padding:0.75rem 1rem;font-weight:500;">${_esc(s.name)}</td>
            <td style="padding:0.75rem 1rem;">${badge}</td>
            <td style="padding:0.75rem 1rem;color:#6b7280;font-size:0.875rem;">${_esc(s.email || '')}</td>
            <td style="padding:0.75rem 1rem;text-align:center;">
              <span style="background:#eff6ff;color:#2563eb;border-radius:9999px;padding:0.15rem 0.6rem;font-size:0.8rem;font-weight:600;">${count}</span>
            </td>
            <td style="padding:0.75rem 1rem;text-align:right;">
              <button
                onclick="RBAC._editStaffModal('${_esc(s.id)}')"
                style="background:none;border:1px solid #d1d5db;border-radius:6px;padding:0.3rem 0.75rem;cursor:pointer;font-size:0.8rem;color:#374151;"
              >Edit</button>
              <button
                onclick="RBAC._removeStaff('${_esc(s.id)}')"
                style="background:none;border:1px solid #fca5a5;border-radius:6px;padding:0.3rem 0.75rem;cursor:pointer;font-size:0.8rem;color:#dc2626;margin-left:0.25rem;"
              >Remove</button>
            </td>
          </tr>`;
        }).join('');

    return `
<div class="panel" id="rbac-user-mgmt-panel">
  <div class="panel-title" style="display:flex;align-items:center;justify-content:space-between;">
    <span>Team Members</span>
    <button
      onclick="RBAC._addStaffModal()"
      style="background:#4f46e5;color:#fff;border:none;border-radius:8px;padding:0.4rem 1rem;cursor:pointer;font-size:0.85rem;font-weight:600;"
    >+ Add Staff</button>
  </div>
  <div style="overflow-x:auto;">
    <table style="width:100%;border-collapse:collapse;">
      <thead>
        <tr style="border-bottom:1px solid #e5e7eb;text-align:left;">
          <th style="padding:0.6rem 1rem;font-size:0.8rem;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Name</th>
          <th style="padding:0.6rem 1rem;font-size:0.8rem;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Role</th>
          <th style="padding:0.6rem 1rem;font-size:0.8rem;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Email</th>
          <th style="padding:0.6rem 1rem;font-size:0.8rem;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;text-align:center;">Assigned Cases</th>
          <th style="padding:0.6rem 1rem;"></th>
        </tr>
      </thead>
      <tbody>
        ${staffRows}
      </tbody>
    </table>
  </div>
</div>`;
  }

  /**
   * Returns an HTML badge for a given role.
   * @param {string} role
   * @returns {string} HTML string
   */
  function roleBadge(role) {
    const label = ROLE_LABELS[role] || role || 'Unknown';
    const color = ROLE_COLORS[role] || '#6b7280';
    // Lighten color for background by using opacity
    return `<span class="rbac-role-badge" style="
      display:inline-block;
      background:${color}1a;
      color:${color};
      border:1px solid ${color}33;
      border-radius:9999px;
      padding:0.15rem 0.65rem;
      font-size:0.75rem;
      font-weight:600;
      white-space:nowrap;
      letter-spacing:0.02em;
    ">${_esc(label)}</span>`;
  }

  /**
   * Renders role settings HTML for the settings page.
   * Shows current role, and if MA, shows full team management.
   * @returns {string} HTML string
   */
  function renderRoleSettings() {
    const role = getRole();
    const username = _currentUsername();
    const label = ROLE_LABELS[role] || role;

    let teamSection = '';
    if (role === ROLES.MA) {
      teamSection = `
      <div style="margin-top:1.5rem;">
        ${renderUserManagement()}
      </div>`;
    }

    return `
<div class="panel" id="rbac-role-settings">
  <div class="panel-title">Access &amp; Role</div>
  <div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:0.5rem;">
    <span style="color:#374151;font-size:0.95rem;">Your current role:</span>
    ${roleBadge(role)}
  </div>
  <p style="color:#6b7280;font-size:0.85rem;margin:0 0 0.25rem;">
    Logged in as <strong>${_esc(username)}</strong>.
    ${role === ROLES.MA
      ? 'As Managing Attorney, you have full system access including billing, reports, and user management.'
      : role === ROLES.AA
        ? 'As Associate Attorney, you can view and edit your assigned cases, draft documents, and log time. Billing administration is restricted.'
        : 'As Case Manager, you can manage communications, track documents, and log time for your assigned cases.'}
  </p>
  ${role === ROLES.MA ? `
  <div style="margin-top:1rem;padding:0.75rem 1rem;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;font-size:0.85rem;color:#15803d;">
    <strong>Managing Attorney privileges active.</strong> You can assign roles to team members below.
  </div>` : ''}
  ${teamSection}
</div>`;
  }

  // ---- Escape helper (prevent XSS in HTML templates) ----
  function _esc(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // ---- Modal helpers (exposed on RBAC for onclick handlers) ----

  function _addStaffModal() {
    _openStaffModal(null);
  }

  function _editStaffModal(id) {
    const staff = _readStaff();
    const member = staff.find(s => s.id === id);
    if (!member) return;
    _openStaffModal(member);
  }

  function _removeStaff(id) {
    if (!confirm('Remove this team member? Their case assignments will be preserved.')) return;
    const staff = _readStaff().filter(s => s.id !== id);
    _writeStaff(staff);
    // Re-render if the panel is in the DOM
    _refreshUserMgmtPanel();
    if (typeof toast === 'function') toast('Team member removed', 'info');
  }

  function _openStaffModal(member) {
    // Remove any existing modal
    const existing = document.getElementById('rbac-staff-modal');
    if (existing) existing.remove();

    const isEdit = !!member;
    const m = member || { id: '', name: '', role: ROLES.AA, email: '' };

    const roleOptions = Object.values(ROLES).map(r =>
      `<option value="${r}" ${r === m.role ? 'selected' : ''}>${ROLE_LABELS[r]}</option>`
    ).join('');

    const modal = document.createElement('div');
    modal.id = 'rbac-staff-modal';
    modal.style.cssText = `
      position:fixed;inset:0;z-index:9999;
      display:flex;align-items:center;justify-content:center;
      background:rgba(0,0,0,0.4);backdrop-filter:blur(2px);
    `;
    modal.innerHTML = `
      <div style="background:#fff;border-radius:12px;padding:1.75rem;width:100%;max-width:420px;box-shadow:0 20px 60px rgba(0,0,0,0.2);">
        <h3 style="margin:0 0 1.25rem;font-size:1.1rem;font-weight:700;color:#111827;">
          ${isEdit ? 'Edit Team Member' : 'Add Team Member'}
        </h3>
        <div style="margin-bottom:1rem;">
          <label style="display:block;font-size:0.85rem;font-weight:600;color:#374151;margin-bottom:0.35rem;">Full Name</label>
          <input id="rbac-staff-name" type="text" value="${_esc(m.name)}" placeholder="Jane Smith"
            style="width:100%;padding:0.55rem 0.75rem;border:1px solid #d1d5db;border-radius:8px;font-size:0.9rem;box-sizing:border-box;">
        </div>
        <div style="margin-bottom:1rem;">
          <label style="display:block;font-size:0.85rem;font-weight:600;color:#374151;margin-bottom:0.35rem;">Email</label>
          <input id="rbac-staff-email" type="email" value="${_esc(m.email)}" placeholder="jane@firm.com"
            style="width:100%;padding:0.55rem 0.75rem;border:1px solid #d1d5db;border-radius:8px;font-size:0.9rem;box-sizing:border-box;">
        </div>
        <div style="margin-bottom:1.5rem;">
          <label style="display:block;font-size:0.85rem;font-weight:600;color:#374151;margin-bottom:0.35rem;">Role</label>
          <select id="rbac-staff-role"
            style="width:100%;padding:0.55rem 0.75rem;border:1px solid #d1d5db;border-radius:8px;font-size:0.9rem;box-sizing:border-box;background:#fff;">
            ${roleOptions}
          </select>
        </div>
        <div style="display:flex;gap:0.75rem;justify-content:flex-end;">
          <button onclick="RBAC._closeStaffModal()"
            style="background:none;border:1px solid #d1d5db;border-radius:8px;padding:0.5rem 1.1rem;cursor:pointer;font-size:0.9rem;color:#374151;">
            Cancel
          </button>
          <button onclick="RBAC._saveStaffModal('${_esc(m.id)}')"
            style="background:#4f46e5;color:#fff;border:none;border-radius:8px;padding:0.5rem 1.25rem;cursor:pointer;font-size:0.9rem;font-weight:600;">
            ${isEdit ? 'Save Changes' : 'Add Member'}
          </button>
        </div>
      </div>`;

    // Close on backdrop click
    modal.addEventListener('click', e => { if (e.target === modal) _closeStaffModal(); });
    document.body.appendChild(modal);

    // Focus name field
    setTimeout(() => {
      const nameField = document.getElementById('rbac-staff-name');
      if (nameField) nameField.focus();
    }, 50);
  }

  function _closeStaffModal() {
    const modal = document.getElementById('rbac-staff-modal');
    if (modal) modal.remove();
  }

  function _saveStaffModal(existingId) {
    const nameEl  = document.getElementById('rbac-staff-name');
    const emailEl = document.getElementById('rbac-staff-email');
    const roleEl  = document.getElementById('rbac-staff-role');

    if (!nameEl || !emailEl || !roleEl) return;

    const name  = nameEl.value.trim();
    const email = emailEl.value.trim();
    const role  = roleEl.value;

    if (!name) {
      if (typeof toast === 'function') toast('Name is required', 'warn');
      nameEl.focus();
      return;
    }

    const member = {
      id:   existingId || (typeof uuid === 'function' ? uuid() : Date.now().toString(36)),
      name,
      email,
      role,
    };

    saveStaff(member);
    _closeStaffModal();
    _refreshUserMgmtPanel();

    if (typeof toast === 'function') toast(existingId ? 'Team member updated' : 'Team member added', 'success');
  }

  function _refreshUserMgmtPanel() {
    const panel = document.getElementById('rbac-user-mgmt-panel');
    if (panel) {
      const temp = document.createElement('div');
      temp.innerHTML = renderUserManagement();
      const newPanel = temp.firstElementChild;
      if (newPanel) panel.replaceWith(newPanel);
    }
  }

  // ---- Sidebar Role Badge Injection ----
  /**
   * Injects the role badge into the sidebar, under the username display.
   * Safe to call multiple times (idempotent).
   */
  function _injectSidebarBadge() {
    // Remove stale badge first
    const existing = document.getElementById('rbac-sidebar-badge');
    if (existing) existing.remove();

    // Common sidebar username selectors — adjust if case-manager.js uses different markup
    const usernameEl = document.querySelector(
      '.sidebar-username, .sidebar .user-name, #sidebar-username, [data-sidebar-username]'
    );

    if (!usernameEl) return;

    const role = getRole();
    const badge = document.createElement('span');
    badge.id = 'rbac-sidebar-badge';
    badge.style.cssText = 'display:block;margin-top:0.3rem;';
    badge.innerHTML = roleBadge(role);
    usernameEl.insertAdjacentElement('afterend', badge);
  }

  // ---- Render Patch ----
  // After the global render() runs, inject the sidebar badge.
  function _patchRender() {
    if (typeof window.render !== 'function') return;
    const _origRender = window.render;
    window.render = function(...args) {
      const result = _origRender.apply(this, args);
      // Use microtask so DOM is fully updated before we query it
      Promise.resolve().then(() => _injectSidebarBadge());
      return result;
    };
  }

  // ---- Bootstrap ----
  function _init() {
    // If no role is set for the current user, set them as managing_attorney
    const raw = localStorage.getItem(USER_ROLE_KEY);
    if (!raw) {
      const username = _currentUsername();
      if (username) {
        setUserRole(username, ROLES.MA);
      }
      // If Auth isn't ready yet, wait
      if (typeof Auth !== 'undefined' && typeof Auth.ready !== 'undefined') {
        Auth.ready.then(() => {
          const u = _currentUsername();
          if (u && !localStorage.getItem(USER_ROLE_KEY)) {
            setUserRole(u, ROLES.MA);
          }
        }).catch(() => {});
      }
    }
    _patchRender();
  }

  // Run init after the current script finishes loading
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _init);
  } else {
    _init();
  }

  // ---- Public Surface ----
  return {
    ROLES,
    ROLE_LABELS,

    getRole,
    can,
    getStaff,
    saveStaff,
    getVisibleCases,
    assignCase,
    setUserRole,
    renderUserManagement,
    roleBadge,
    renderRoleSettings,

    // Internal helpers exposed for onclick= handlers in rendered HTML
    _addStaffModal,
    _editStaffModal,
    _removeStaff,
    _closeStaffModal,
    _saveStaffModal,
    _refreshUserMgmtPanel,
    _injectSidebarBadge,
  };
})();

// ---- navigate() patch: enforce access control ----
// Wraps the global navigate() to block restricted views.
(function _patchNavigate() {
  function _applyPatch() {
    if (typeof window.navigate !== 'function') return;
    const _origNavigate = window.navigate;
    window.navigate = function(view, ...args) {
      if (view === 'reports' && !RBAC.can('view_reports')) {
        if (typeof toast === 'function') toast('Access restricted to your assigned cases', 'warn');
        return;
      }
      if (view === 'billing' && !RBAC.can('view_billing')) {
        if (typeof toast === 'function') toast('Billing access is restricted to Managing Attorney', 'warn');
        return;
      }
      if (view === 'users' && !RBAC.can('manage_users')) {
        if (typeof toast === 'function') toast('User management is restricted to Managing Attorney', 'warn');
        return;
      }
      return _origNavigate(view, ...args);
    };
  }

  // navigate() may not be defined yet at parse time; patch after DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _applyPatch);
  } else {
    _applyPatch();
  }
})();
