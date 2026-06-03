# Security Architecture — Kamkhadze PA Case Manager

## Classification
This system stores attorney-client privileged communications, personally identifiable information (PII),
financial data (retainers, invoices), USCIS case details, and immigration strategy documents.
All security measures are **non-negotiable** and must be preserved in any code change.

---

## Encryption at Rest

**Algorithm:** AES-256-GCM (authenticated encryption)  
**Key Derivation:** PBKDF2-SHA256 with 600,000 iterations  
**Salt:** 16 bytes cryptographically random, unique per account  
**IV:** 12 bytes cryptographically random, unique per ciphertext  

All case data is encrypted before writing to `localStorage`:
```
plaintext → PBKDF2(password, salt, 600000) → AES-256-GCM key → encrypt → base64 blob
```
The encryption key is **never stored** — it exists only in `sessionStorage` during active sessions
and is re-derived from the user's password on every login.

**SECURITY: `km_cases_enc_v1`** — AES-256-GCM encrypted case blob. Never readable without password.  
**SECURITY: `km_auth_v1`** — PBKDF2 salt + AES-GCM encrypted verifier. No password stored.  
**SECURITY: `km_session_v1`** — Encrypted session key in `sessionStorage`. Auto-cleared on tab close.

Non-sensitive operational data (time logs, team chat, UI state) is stored unencrypted in localStorage.
These contain no PII — only timestamps, action labels, and usernames.

---

## Encryption in Transit

- All traffic served over HTTPS (GitHub Pages enforces HTTPS)
- Supabase cloud sync uses TLS 1.2+ (enforced by Supabase infrastructure)
- No plain HTTP fallback is configured or permitted
- API keys and tokens transmitted only via HTTPS headers; never in URL parameters

---

## Row-Level Security (Supabase)

The `km_sync` table requires the following RLS policy (run in Supabase SQL Editor):

```sql
-- Enable RLS
ALTER TABLE km_sync ENABLE ROW LEVEL SECURITY;

-- Users can only read/write their own rows
CREATE POLICY "user_own_rows" ON km_sync
  FOR ALL USING (username = current_setting('app.username', true));

-- Anon access restricted to auth_config slot only for account recovery
CREATE POLICY "anon_auth_config_read" ON km_sync
  FOR SELECT USING (slot = 'auth_config');
```

**SECURITY:** Without these policies, any authenticated Supabase user could query other users' encrypted blobs.
Even with access, blobs are AES-256-GCM encrypted and unreadable without the account password.

---

## Session Management

- **Session duration:** 30 minutes of inactivity before automatic logout
- **Session key:** Stored in `sessionStorage` (not `localStorage`) — cleared automatically when browser tab closes
- **Re-authentication:** Required after session expiry or manual logout
- **Lockout:** 5 failed login attempts → 5-minute lockout (`km_lockout_v1`)
- **Idle detection:** Mouse/keyboard/touch events reset the 30-minute timer

**SECURITY: `storeSession()`** — Wraps the AES key in another AES-GCM layer before storing in sessionStorage.

---

## Role-Based Access Control

| Role               | All Cases | Billing | User Mgmt | Reassign | Reports | Edit Cases |
|--------------------|-----------|---------|-----------|----------|---------|------------|
| Managing Attorney  | ✓         | ✓       | ✓         | ✓        | ✓       | ✓          |
| Associate Attorney | Own only  | ✗       | ✗         | ✗        | Own     | ✓          |
| Case Manager       | Own only  | ✗       | ✗         | ✗        | Own     | Limited    |

Role enforcement is in `case-manager-rbac.js`. Roles are stored in `km_user_role_v1` (localStorage).
**SECURITY:** Role assignments are NOT encrypted since they contain only usernames and role strings.
Critical financial operations check `RBAC.can('view_billing')` before rendering.

---

## Data Masking (Planned / Implement Before Production)

Fields requiring masking for non-authorized roles:
- `retainerAmount`, `filingFeesAmount` — visible to Managing Attorney only
- `uscisReceiptNumber` — mask as `***XXXX` for Case Manager role
- `email`, `phone` — full access for attorney roles, masked for read-only roles

Implementation: Wrap `infoRow()` calls with `RBAC.can('view_financials')` checks.

---

## Audit Log (Planned / Implement Before Production)

Every action should append to `km_audit_log_v1` (encrypted):
```javascript
{
  ts: ISO timestamp,
  user: Auth.username,
  action: 'case_viewed' | 'case_edited' | 'email_sent' | 'doc_generated' | 'login' | 'logout',
  caseId: string | null,
  detail: string
}
```
The time tracking system (`case-manager-time.js`) serves as a partial audit log for billable actions.
A full audit log for login/access events is planned for Phase 2.

---

## API Key Protection

**Current state (client-side only):** API keys for Dropbox, Zoom, and Google Calendar are stored in
`localStorage` under `km_dropbox_app_key`, `km_zoom_client_id` etc. This is acceptable for a
single-attorney system but must be upgraded before multi-user production deployment.

**Production recommendation:** Move all API keys to a server-side proxy (Cloudflare Worker, Vercel Edge Function).
The client calls your proxy endpoint; the proxy attaches the API key and forwards the request.
This prevents any API key from appearing in the browser.

**SECURITY: API Key Locations to Audit Before Production:**
- `km_supabase_anon_key` — Supabase anon key (hardcoded in `case-manager-auth.js` and `case-manager-supabase.js`)
  → Acceptable: anon key is public by design; RLS policies control actual data access
- `km_dropbox_app_key` — Dropbox OAuth app key (stored in localStorage)
  → Move to server-side before multi-user deployment
- `km_zoom_client_id` — Zoom OAuth client ID (stored in localStorage)
  → Move to server-side before multi-user deployment
- `km_outlook_client_id` — Azure app client ID (stored in localStorage)
  → Move to server-side before multi-user deployment

---

## No Third-Party Analytics

- No Google Analytics, Mixpanel, Hotjar, or any tracking scripts on case management pages
- The only external resources loaded are: Google Fonts (CSS/fonts), SheetJS CDN (XLSX parsing)
- Supabase telemetry is infrastructure-level only; no user behavior data is sent to Supabase
- GitHub Pages does not inject any tracking scripts

---

## Third-Party Libraries

| Library     | Version | Source                    | Purpose                    | Audit Status  |
|-------------|---------|---------------------------|----------------------------|---------------|
| SheetJS     | 0.18.5  | cdnjs.cloudflare.com      | Excel import                | SHA pinning recommended |
| Google Fonts| —       | fonts.googleapis.com      | Typography                  | No data access |

**Recommendation:** Add Subresource Integrity (SRI) hash to the SheetJS CDN tag:
```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"
  integrity="sha512-[SRI_HASH]" crossorigin="anonymous"></script>
```

---

## Backup File Security

Backup files (`.kmbak`) are AES-256-GCM encrypted with the user's account password.
- Safe to store in Google Drive, Dropbox, email — unreadable without the password
- File format: `KMBAK_V1:{base64_iv}{base64_ciphertext}`
- No metadata or plaintext information leaks outside the encrypted payload

---

## Known Limitations (Address Before Production Multi-User Deployment)

1. **Single-key encryption:** All users on the same account share the same AES key. Multi-user
   deployment requires per-user key derivation (currently implemented via username-scoped PBKDF2).

2. **Client-side RBAC:** Role enforcement is in JavaScript. A determined attacker with local access
   could bypass role checks via browser console. Server-side enforcement required for true security.

3. **No certificate pinning:** Browser-level HTTPS enforcement only; no additional pinning.

4. **Session storage:** Session key survives navigation within a tab. Cross-tab sessions share
   localStorage but not sessionStorage — each tab requires re-authentication after timeout.

5. **Audit log incomplete:** Time tracking logs billable actions but not all access events.
   Full audit trail (including read access) required for compliance with some bar association rules.

---

## Security Contact

Security issues should be reported to: **anka@esq.mba**

Do not open public GitHub issues for security vulnerabilities.

---

*Last reviewed: 2026-06-03*  
*System: Kamkhadze PA Case Manager v2.0*
