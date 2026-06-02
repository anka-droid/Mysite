-- ============================================================
--  Kamkhadze PA — Database Schema
--  Run once:  psql $DATABASE_URL -f db/schema.sql
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─────────────────────────────────────────────────────────────
--  USERS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username          VARCHAR(100) UNIQUE NOT NULL,
  password_hash     VARCHAR(255),
  display_name      VARCHAR(255),
  role              VARCHAR(50) NOT NULL DEFAULT 'attorney',
  status            VARCHAR(20) NOT NULL DEFAULT 'active',

  invite_token      VARCHAR(255) UNIQUE,
  invite_expires_at TIMESTAMPTZ,
  invited_by        UUID REFERENCES users(id) ON DELETE SET NULL,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
--  PASSWORD RESET TOKENS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token       VARCHAR(255) UNIQUE NOT NULL,
  used        BOOLEAN NOT NULL DEFAULT FALSE,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
--  CASES
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cases (
  id                 VARCHAR(100) PRIMARY KEY,
  first_name         VARCHAR(255),
  last_name          VARCHAR(255),
  email              VARCHAR(255),
  phone              VARCHAR(100),
  nationality        VARCHAR(100),
  company            VARCHAR(255),
  location           VARCHAR(255),
  case_type          VARCHAR(100),
  visa_type          VARCHAR(100),
  stage              VARCHAR(100) NOT NULL DEFAULT 'Inquiry',
  filing_date        DATE,
  ra_date            DATE,
  receipt            VARCHAR(100),
  expiration         DATE,
  priority_date      DATE,
  officer            VARCHAR(255),
  legal_fee          NUMERIC(10,2),
  filing_fees        NUMERIC(10,2),
  retainer_amount    NUMERIC(10,2),
  filing_fees_amount NUMERIC(10,2),
  notes              TEXT,
  email_log          JSONB NOT NULL DEFAULT '[]',
  documents          JSONB NOT NULL DEFAULT '[]',
  consultation       JSONB NOT NULL DEFAULT '{}',
  custom_fields      JSONB NOT NULL DEFAULT '{}',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cases_stage     ON cases(stage);
CREATE INDEX IF NOT EXISTS idx_cases_visa_type ON cases(visa_type);
CREATE INDEX IF NOT EXISTS idx_cases_last_name ON cases(last_name);

-- ─────────────────────────────────────────────────────────────
--  EMAILS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS emails (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id    VARCHAR(100) REFERENCES cases(id) ON DELETE SET NULL,
  case_tag   VARCHAR(255),
  direction  VARCHAR(10) NOT NULL DEFAULT 'sent',
  from_email VARCHAR(255),
  to_email   VARCHAR(255),
  subject    VARCHAR(500),
  body       TEXT,
  preview    VARCHAR(200),
  unread     BOOLEAN NOT NULL DEFAULT FALSE,
  sent_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_emails_case_id ON emails(case_id);
CREATE INDEX IF NOT EXISTS idx_emails_sent_at ON emails(sent_at DESC);

-- ─────────────────────────────────────────────────────────────
--  ZOOM MEETINGS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS zoom_meetings (
  id          VARCHAR(100) PRIMARY KEY,
  case_id     VARCHAR(100) REFERENCES cases(id) ON DELETE SET NULL,
  client_name VARCHAR(255),
  topic       VARCHAR(500),
  date        DATE,
  time        VARCHAR(20),
  duration    INTEGER NOT NULL DEFAULT 60,
  timezone    VARCHAR(100) NOT NULL DEFAULT 'America/New_York',
  link        VARCHAR(500),
  status      VARCHAR(50) NOT NULL DEFAULT 'Scheduled',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_zoom_case_id ON zoom_meetings(case_id);
CREATE INDEX IF NOT EXISTS idx_zoom_date    ON zoom_meetings(date);

-- ─────────────────────────────────────────────────────────────
--  FILES  (Document Vault)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS files (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id      VARCHAR(100) REFERENCES cases(id) ON DELETE SET NULL,
  client_name  VARCHAR(255),
  name         VARCHAR(500) NOT NULL,
  folder       VARCHAR(100) NOT NULL DEFAULT '01_Personal_Documents',
  size         BIGINT,
  mime_type    VARCHAR(100),
  status       VARCHAR(50) NOT NULL DEFAULT 'Uploaded',
  storage_path VARCHAR(1000),
  uploaded_by  VARCHAR(255),
  uploaded_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_files_case_id ON files(case_id);
CREATE INDEX IF NOT EXISTS idx_files_folder  ON files(folder);

-- ─────────────────────────────────────────────────────────────
--  Auto-update updated_at trigger
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'cases_set_updated_at') THEN
    CREATE TRIGGER cases_set_updated_at BEFORE UPDATE ON cases
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'users_set_updated_at') THEN
    CREATE TRIGGER users_set_updated_at BEFORE UPDATE ON users
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;
