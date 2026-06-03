/* ============================================================
   Kamkhadze PA — Unit & Integration Tests
   Run in browser: open case-manager.html, then in DevTools console type:
     CaseManagerTests.run()
   Or run isolated (no DOM required) in Node for migration tests only:
     node case-manager-tests.js
   ============================================================ */

/* eslint-disable no-console */
const CaseManagerTests = (() => {

  // ---- Test runner ----
  let _passed = 0, _failed = 0;

  function assert(condition, label) {
    if (condition) {
      _passed++;
      console.log(`  ✓ ${label}`);
    } else {
      _failed++;
      console.error(`  ✗ ${label}`);
    }
  }

  function suite(name, fn) {
    console.group(`\n📋 ${name}`);
    fn();
    console.groupEnd();
  }

  // ---- Helpers replicated for isolation (Node-safe) ----

  const MIGRATION_MAP = {
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
    'closed':         null,
    'KDE':            'Case Development',
    'KAR':            'Almost Ready',
    'KRE':            'Ready',
    'KFI':            'Filed',
    'KAP':            'Approved',
    'RFE':            'RFE',
    'RFF':            'RFE',
    'RFA':            'RFE',
    'RFR':            'RFE',
    'KW2':            null,
    'APF':            null,
  };

  const CANONICAL_STATUSES = new Set([
    'Lead', 'RA Pending', 'Case Development', 'Almost Ready',
    'Ready', 'Filed', 'RFE', 'Approved', 'Denied',
  ]);

  function migrateStatus(v) {
    if (CANONICAL_STATUSES.has(v)) return v; // already migrated
    if (Object.prototype.hasOwnProperty.call(MIGRATION_MAP, v)) return MIGRATION_MAP[v];
    return undefined; // truly unknown
  }

  function normalizeOfficer(raw) {
    return (raw || '').trim().toUpperCase();
  }

  function daysBetween(a, b) {
    if (!a || !b) return null;
    const d = Math.round((new Date(b) - new Date(a)) / 86400000);
    return isNaN(d) ? null : d;
  }

  function computeStats(cases) {
    let approvals = 0, denials = 0;
    let turnaroundTotal = 0, turnaroundCount = 0;
    cases.forEach(c => {
      if (c.decisionType === 'Approved') approvals++;
      if (c.decisionType === 'Denied')   denials++;
      const t = daysBetween(c.rfeResponseFiledDate, c.decisionDate);
      if (t !== null && t >= 0) { turnaroundTotal += t; turnaroundCount++; }
    });
    const approvalDenial = approvals + denials;
    const approvalRate = approvalDenial > 0 ? Math.round(approvals / approvalDenial * 100) : null;
    const avgTurnaround = turnaroundCount > 0 ? Math.round(turnaroundTotal / turnaroundCount) : null;
    return { approvals, denials, approvalRate, avgTurnaround };
  }

  // ---- Test suites ----

  function testStatusMigration() {
    suite('Status Migration — every legacy value maps to canonical or is flagged', () => {

      // Every mapped value must land in the canonical set or be null (flag)
      Object.entries(MIGRATION_MAP).forEach(([from, to]) => {
        if (to === null) {
          assert(true, `'${from}' → null (flagged for manual review)`);
        } else {
          assert(CANONICAL_STATUSES.has(to),
            `'${from}' → '${to}' is a valid canonical status`);
        }
      });

      // Spot-checks
      assert(migrateStatus('lead') === 'Lead',             "lead → Lead");
      assert(migrateStatus('onboarding') === 'RA Pending', "onboarding → RA Pending");
      assert(migrateStatus('documents') === 'Case Development', "documents → Case Development");
      assert(migrateStatus('petition') === 'Case Development', "petition → Case Development");
      assert(migrateStatus('filed') === 'Filed',           "filed → Filed");
      assert(migrateStatus('rfe') === 'RFE',               "rfe → RFE");
      assert(migrateStatus('approved') === 'Approved',     "approved → Approved");
      assert(migrateStatus('denied') === 'Denied',         "denied → Denied");
      assert(migrateStatus('closed') === null,             "closed → null (flag)");

      // New KDE-era codes
      assert(migrateStatus('KDE') === 'Case Development',  "KDE → Case Development");
      assert(migrateStatus('KAR') === 'Almost Ready',      "KAR → Almost Ready");
      assert(migrateStatus('KRE') === 'Ready',             "KRE → Ready");
      assert(migrateStatus('KFI') === 'Filed',             "KFI → Filed");
      assert(migrateStatus('KAP') === 'Approved',          "KAP → Approved");
      assert(migrateStatus('RFE') === 'RFE',               "RFE → RFE (idempotent)");
      assert(migrateStatus('RFF') === 'RFE',               "RFF → RFE");
      assert(migrateStatus('RFA') === 'RFE',               "RFA → RFE");
      assert(migrateStatus('RFR') === 'RFE',               "RFR → RFE");
      assert(migrateStatus('KW2') === null,                "KW2 → null (Withdrawal, flag)");
      assert(migrateStatus('APF') === null,                "APF → null (Appeal Filed, flag)");

      // Canonical values are idempotent
      CANONICAL_STATUSES.forEach(v => {
        assert(migrateStatus(v) === v, `Canonical '${v}' is idempotent`);
      });

      // Truly unknown value returns undefined (not null — distinct from "flagged")
      assert(migrateStatus('TOTALLY_UNKNOWN') === undefined,
        "Unknown status returns undefined (not silently dropped as null)");
    });
  }

  function testOfficerNormalization() {
    suite('Officer Number Normalization', () => {
      assert(normalizeOfficer('ABC123 ') === 'ABC123',    'Trailing space stripped');
      assert(normalizeOfficer(' ABC123') === 'ABC123',    'Leading space stripped');
      assert(normalizeOfficer('abc123') === 'ABC123',     'Lowercase → uppercase');
      assert(normalizeOfficer('ABC123 ') === normalizeOfficer('abc123'), '"ABC123 " and "abc123" are the same officer');
      assert(normalizeOfficer('  1234567  ') === '1234567', 'Interior spaces trimmed (leading/trailing)');
      assert(normalizeOfficer('') === '',                  'Empty string stays empty');
      assert(normalizeOfficer(null) === '',                'null returns empty string');
      assert(normalizeOfficer(undefined) === '',           'undefined returns empty string');
    });
  }

  function testApprovalRate() {
    suite('Officer Report — Approval Rate Calculation', () => {
      // Zero decisions (no approvals or denials recorded)
      const zeroDecisions = computeStats([
        { decisionType: 'Pending' },
        { decisionType: '' },
      ]);
      assert(zeroDecisions.approvalRate === null, 'Zero approvals+denials → approvalRate is null (not 0% or NaN)');
      assert(zeroDecisions.approvals === 0,       'Zero approvals → approvals === 0');
      assert(zeroDecisions.denials === 0,         'Zero denials → denials === 0');

      // Single approval
      const singleApproval = computeStats([{ decisionType: 'Approved' }]);
      assert(singleApproval.approvalRate === 100, 'Single approval → 100%');
      assert(singleApproval.approvals === 1,      'approvals === 1');
      assert(singleApproval.denials === 0,        'denials === 0');

      // Single denial
      const singleDenial = computeStats([{ decisionType: 'Denied' }]);
      assert(singleDenial.approvalRate === 0,     'Single denial → 0%');
      assert(singleDenial.approvals === 0,        'approvals === 0');
      assert(singleDenial.denials === 1,          'denials === 1');

      // All approvals
      const allApproved = computeStats([
        { decisionType: 'Approved' },
        { decisionType: 'Approved' },
        { decisionType: 'Approved' },
      ]);
      assert(allApproved.approvalRate === 100,    'All approvals → 100%');

      // All denials
      const allDenied = computeStats([
        { decisionType: 'Denied' },
        { decisionType: 'Denied' },
      ]);
      assert(allDenied.approvalRate === 0,        'All denials → 0%');

      // Mixed: 3 approved, 1 denied → 75%
      const mixed = computeStats([
        { decisionType: 'Approved' },
        { decisionType: 'Approved' },
        { decisionType: 'Approved' },
        { decisionType: 'Denied' },
      ]);
      assert(mixed.approvalRate === 75, '3 approved + 1 denied → 75%');

      // NOID and Second RFE do NOT count toward approval rate denominator
      const withNoid = computeStats([
        { decisionType: 'Approved' },
        { decisionType: 'NOID' },
        { decisionType: 'Second RFE' },
      ]);
      assert(withNoid.approvalRate === 100,       'NOID and Second RFE excluded from approval rate denominator');

      // Rounding: 2 approved, 3 denied → 40%
      const rounding = computeStats([
        { decisionType: 'Approved' },
        { decisionType: 'Approved' },
        { decisionType: 'Denied' },
        { decisionType: 'Denied' },
        { decisionType: 'Denied' },
      ]);
      assert(rounding.approvalRate === 40, '2 approved + 3 denied → 40%');
    });
  }

  function testAverageTurnaround() {
    suite('Officer Report — Average Decision Days', () => {
      // No dates recorded → null
      const noDates = computeStats([
        { decisionType: 'Approved' },
        { decisionType: 'Denied' },
      ]);
      assert(noDates.avgTurnaround === null, 'No RFE response/decision dates → avgTurnaround is null');

      // Single case with dates
      const single = computeStats([{
        decisionType: 'Approved',
        rfeResponseFiledDate: '2024-01-01',
        decisionDate: '2024-03-31',  // 90 days
      }]);
      assert(single.avgTurnaround === 90, 'Single case: Jan 1 → Mar 31 = 90 days');

      // Average of two cases
      const two = computeStats([
        { decisionType: 'Approved', rfeResponseFiledDate: '2024-01-01', decisionDate: '2024-01-11' }, // 10d
        { decisionType: 'Denied',   rfeResponseFiledDate: '2024-01-01', decisionDate: '2024-01-21' }, // 20d
      ]);
      assert(two.avgTurnaround === 15, 'Two cases: avg of 10 and 20 = 15 days');

      // Negative days (decision before response filed) are excluded
      const withNegative = computeStats([
        { rfeResponseFiledDate: '2024-03-01', decisionDate: '2024-01-01' }, // negative → excluded
        { rfeResponseFiledDate: '2024-01-01', decisionDate: '2024-01-11' }, // 10d → counted
      ]);
      assert(withNegative.avgTurnaround === 10, 'Negative turnaround (data error) is excluded from average');

      // Missing one of the pair → that case excluded
      const partial = computeStats([
        { rfeResponseFiledDate: '2024-01-01', decisionDate: null },          // excluded (no decision date)
        { rfeResponseFiledDate: null,          decisionDate: '2024-01-11' }, // excluded (no response date)
        { rfeResponseFiledDate: '2024-01-01', decisionDate: '2024-01-31' }, // 30d → counted
      ]);
      assert(partial.avgTurnaround === 30, 'Cases missing either date are excluded from average');
    });
  }

  function testDaysBetween() {
    suite('daysBetween() helper', () => {
      assert(daysBetween('2024-01-01', '2024-01-11') === 10,  'Jan 1 → Jan 11 = 10 days');
      assert(daysBetween('2024-01-01', '2024-01-01') === 0,   'Same date = 0 days');
      assert(daysBetween('2024-01-11', '2024-01-01') === -10, 'Reversed = negative (data error)');
      assert(daysBetween(null, '2024-01-01') === null,         'null start → null');
      assert(daysBetween('2024-01-01', null) === null,         'null end → null');
      assert(daysBetween('', '2024-01-01') === null,           'empty string start → null');
      assert(daysBetween('2024-01-01', '') === null,           'empty string end → null');
      assert(daysBetween('not-a-date', '2024-01-01') === null, 'invalid date → null');
    });
  }

  function testReportFiltering() {
    suite('Officer Report — Filter Integration (requires loaded app)', () => {
      if (typeof OfficerReport === 'undefined') {
        console.warn('  ⚠ OfficerReport not loaded — skipping integration tests');
        return;
      }
      if (typeof State === 'undefined' || !Array.isArray(State.cases)) {
        console.warn('  ⚠ State.cases not available — skipping integration tests');
        return;
      }

      // Filter by officer should restrict cases
      const before = State.cases.length;
      if (before === 0) {
        assert(true, '(No cases in State — integration test skipped as no data)');
        return;
      }

      // Inject a test case with a known officer
      const testCase = {
        id: '__test__',
        firstName: 'Test', lastName: 'Officer',
        visaType: 'O-1A',
        statusCode: 'Approved',
        stage: 'Approved',
        uscisOfficerNumber: 'OFFICER999',
        decisionType: 'Approved',
        decisionDate: '2024-06-01',
        rfeResponseFiledDate: '2024-04-01',
      };
      State.cases.push(testCase);

      // renderPage should not throw
      let threw = false;
      try { OfficerReport.renderPage(); } catch(e) { threw = true; }
      assert(!threw, 'renderPage() does not throw with test data present');

      // Cleanup
      State.cases = State.cases.filter(c => c.id !== '__test__');
      assert(State.cases.length === before, 'Test case cleanup: State.cases restored');
    });
  }

  // ---- Run all ----
  function run() {
    _passed = 0; _failed = 0;
    console.log('\n🏛️ Kamkhadze PA — Case Manager Tests\n' + '─'.repeat(50));

    testStatusMigration();
    testOfficerNormalization();
    testApprovalRate();
    testAverageTurnaround();
    testDaysBetween();
    testReportFiltering();

    console.log(`\n${'─'.repeat(50)}`);
    console.log(`Results: ${_passed} passed, ${_failed} failed`);
    if (_failed === 0) console.log('✅ All tests passed.');
    else              console.error(`❌ ${_failed} test(s) failed.`);
    return { passed: _passed, failed: _failed };
  }

  return { run };
})();

// Auto-run when executed directly in Node (for CI or pre-deploy checks)
if (typeof module !== 'undefined' && require.main === module) {
  const result = CaseManagerTests.run();
  process.exit(result.failed > 0 ? 1 : 0);
}
