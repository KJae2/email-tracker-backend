-- ============================================================
-- EMAIL TRACKER SCHEMA v2
-- Run this ONCE in Supabase > SQL Editor > New Query > Run
-- ============================================================

CREATE TABLE IF NOT EXISTS email_events (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tracking_id     TEXT NOT NULL,
  recipient_email TEXT DEFAULT 'unknown',
  subject         TEXT DEFAULT 'unknown',
  event_type      TEXT DEFAULT 'open',
  user_agent      TEXT DEFAULT 'unknown',
  ip_address      TEXT DEFAULT 'unknown',
  device_type     TEXT DEFAULT 'unknown',
  os_name         TEXT DEFAULT 'unknown',
  browser_name    TEXT DEFAULT 'unknown',
  city            TEXT DEFAULT 'unknown',
  country         TEXT DEFAULT 'unknown',
  opened_at       TIMESTAMPTZ DEFAULT NOW(),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_events_tracking ON email_events (tracking_id);
CREATE INDEX IF NOT EXISTS idx_events_recipient ON email_events (recipient_email);
CREATE INDEX IF NOT EXISTS idx_events_dedup ON email_events (tracking_id, ip_address, opened_at);

ALTER TABLE email_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service key full access" ON email_events;
DROP POLICY IF EXISTS "Anon read access" ON email_events;

CREATE POLICY "Service key full access"
  ON email_events FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Anon read access"
  ON email_events FOR SELECT USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE email_events;

-- ============================================================
-- DONE. You should see "Success. No rows returned."
-- ============================================================
