const router = require('express').Router();
const { v4: uuid } = require('uuid');
const pool   = require('../db/pool');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

const EXTRA_FIELDS = [
  'uscisReceiptNumber','consulateCase','consulateName',
  'retainerPaid','retainerDate','filingFeesPaid',
  'consultationDate','consultationTime','consultationDuration',
  'consultationNotes','consultationConfirmed',
  'rfeDate','rfeDueDate','statusExpiration','filingDeadline',
  'approvalDate','dropboxLink','petition','exhibits',
  'statusHistory','emailLog',
  'communications','additionalFees',
];

function rowToCase(r) {
  const extra = r.custom_fields || {};
  return {
    id:                 r.id,
    firstName:          r.first_name,
    lastName:           r.last_name,
    email:              r.email,
    phone:              r.phone,
    nationality:        r.nationality,
    company:            r.company,
    location:           r.location,
    caseType:           r.case_type,
    visaType:           r.visa_type,
    stage:              r.stage,
    filingDate:         r.filing_date,
    raDate:             r.ra_date,
    receipt:            r.receipt,
    expiration:         r.expiration,
    priorityDate:       r.priority_date,
    officer:            r.officer,
    legalFee:           r.legal_fee,
    filingFees:         r.filing_fees,
    retainerAmount:     r.retainer_amount,
    filingFeesAmount:   r.filing_fees_amount,
    notes:              r.notes,
    emailLog:           extra.emailLog    || r.email_log    || [],
    documents:          r.documents      || [],
    consultation:       r.consultation   || {},
    createdAt:          r.created_at,
    updatedAt:          r.updated_at,
    ...Object.fromEntries(
      EXTRA_FIELDS
        .filter(k => extra[k] !== undefined)
        .map(k => [k, extra[k]])
    ),
  };
}

function caseToParams(c, id) {
  const customFields = { ...(c.customFields || {}) };
  EXTRA_FIELDS.forEach(k => {
    if (c[k] !== undefined) customFields[k] = c[k];
  });

  return [
    id,
    c.firstName        || null,
    c.lastName         || null,
    c.email            || null,
    c.phone            || null,
    c.nationality      || null,
    c.company          || null,
    c.location         || null,
    c.caseType         || null,
    c.visaType         || null,
    c.stage            || 'lead',
    c.filingDate       || null,
    c.raDate           || null,
    c.uscisReceiptNumber || c.receipt || null,
    c.statusExpiration || c.expiration || null,
    c.priorityDate     || null,
    c.officer          || null,
    c.legalFee         != null ? c.legalFee         : null,
    c.filingFees       != null ? c.filingFees       : null,
    c.retainerAmount   != null ? c.retainerAmount   : null,
    c.filingFeesAmount != null ? c.filingFeesAmount : null,
    c.notes            || null,
    JSON.stringify(c.emailLog    || []),
    JSON.stringify(c.documents   || []),
    JSON.stringify(c.consultation || {}),
    JSON.stringify(customFields),
  ];
}

// ─── GET /api/cases ───────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM cases ORDER BY updated_at DESC');
    res.json(rows.map(rowToCase));
  } catch (err) {
    console.error('GET /cases:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── POST /api/cases ──────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  const id = req.body.id || uuid();
  const params = caseToParams(req.body, id);
  try {
    const { rows } = await pool.query(`
      INSERT INTO cases (
        id, first_name, last_name, email, phone, nationality, company, location,
        case_type, visa_type, stage,
        filing_date, ra_date, receipt, expiration, priority_date, officer,
        legal_fee, filing_fees, retainer_amount, filing_fees_amount,
        notes, email_log, documents, consultation, custom_fields
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,
        $9,$10,$11,
        $12,$13,$14,$15,$16,$17,
        $18,$19,$20,$21,
        $22,$23,$24,$25,$26
      )
      ON CONFLICT (id) DO UPDATE SET
        first_name=$2, last_name=$3, email=$4, phone=$5, nationality=$6, company=$7, location=$8,
        case_type=$9, visa_type=$10, stage=$11,
        filing_date=$12, ra_date=$13, receipt=$14, expiration=$15, priority_date=$16, officer=$17,
        legal_fee=$18, filing_fees=$19, retainer_amount=$20, filing_fees_amount=$21,
        notes=$22, email_log=$23, documents=$24, consultation=$25, custom_fields=$26,
        updated_at=NOW()
      RETURNING *
    `, params);
    res.status(201).json(rowToCase(rows[0]));
  } catch (err) {
    console.error('POST /cases:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── POST /api/cases/bulk ─────────────────────────────────────────────────────
router.post('/bulk', async (req, res) => {
  const cases = req.body.cases;
  if (!Array.isArray(cases) || cases.length === 0) {
    return res.status(400).json({ error: 'cases array required' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const saved = [];
    for (const c of cases) {
      const id = c.id || uuid();
      const params = caseToParams(c, id);
      const { rows } = await client.query(`
        INSERT INTO cases (
          id, first_name, last_name, email, phone, nationality, company, location,
          case_type, visa_type, stage,
          filing_date, ra_date, receipt, expiration, priority_date, officer,
          legal_fee, filing_fees, retainer_amount, filing_fees_amount,
          notes, email_log, documents, consultation, custom_fields
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,
          $9,$10,$11,
          $12,$13,$14,$15,$16,$17,
          $18,$19,$20,$21,
          $22,$23,$24,$25,$26
        )
        ON CONFLICT (id) DO UPDATE SET
          first_name=$2, last_name=$3, email=$4, phone=$5, nationality=$6, company=$7, location=$8,
          case_type=$9, visa_type=$10, stage=$11,
          filing_date=$12, ra_date=$13, receipt=$14, expiration=$15, priority_date=$16, officer=$17,
          legal_fee=$18, filing_fees=$19, retainer_amount=$20, filing_fees_amount=$21,
          notes=$22, email_log=$23, documents=$24, consultation=$25, custom_fields=$26,
          updated_at=NOW()
        RETURNING *
      `, params);
      saved.push(rowToCase(rows[0]));
    }
    await client.query('COMMIT');
    res.json({ imported: saved.length, cases: saved });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('POST /cases/bulk:', err.message);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

// ─── GET /api/cases/:id ───────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM cases WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Case not found' });
    res.json(rowToCase(rows[0]));
  } catch (err) {
    console.error('GET /cases/:id:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── PUT /api/cases/:id ───────────────────────────────────────────────────────
router.put('/:id', async (req, res) => {
  const params = caseToParams(req.body, req.params.id);
  try {
    const { rows } = await pool.query(`
      UPDATE cases SET
        first_name=$2, last_name=$3, email=$4, phone=$5, nationality=$6, company=$7, location=$8,
        case_type=$9, visa_type=$10, stage=$11,
        filing_date=$12, ra_date=$13, receipt=$14, expiration=$15, priority_date=$16, officer=$17,
        legal_fee=$18, filing_fees=$19, retainer_amount=$20, filing_fees_amount=$21,
        notes=$22, email_log=$23, documents=$24, consultation=$25, custom_fields=$26,
        updated_at=NOW()
      WHERE id=$1 RETURNING *
    `, params);
    if (!rows[0]) return res.status(404).json({ error: 'Case not found' });
    res.json(rowToCase(rows[0]));
  } catch (err) {
    console.error('PUT /cases/:id:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── DELETE /api/cases/:id ────────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM cases WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /cases/:id:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
