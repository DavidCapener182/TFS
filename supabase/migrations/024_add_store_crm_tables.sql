-- Store CRM tables for richer store relationship management.
-- Adds contacts, notes, and an interaction tracker (calls/emails/audit/FRA updates).

CREATE TABLE IF NOT EXISTS fa_store_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES fa_stores(id) ON DELETE CASCADE,
  contact_name TEXT NOT NULL,
  job_title TEXT,
  email TEXT,
  phone TEXT,
  preferred_method TEXT CHECK (preferred_method IN ('phone', 'email', 'either')),
  is_primary BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_by_user_id UUID NOT NULL REFERENCES fa_profiles(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fa_store_contacts_contact_name_not_blank CHECK (char_length(trim(contact_name)) > 0)
);

CREATE TABLE IF NOT EXISTS fa_store_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES fa_stores(id) ON DELETE CASCADE,
  note_type TEXT NOT NULL DEFAULT 'general'
    CHECK (note_type IN ('general', 'contact', 'audit', 'fra', 'other')),
  title TEXT,
  body TEXT NOT NULL,
  created_by_user_id UUID NOT NULL REFERENCES fa_profiles(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fa_store_notes_body_not_blank CHECK (char_length(trim(body)) > 0)
);

CREATE TABLE IF NOT EXISTS fa_store_contact_tracker (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES fa_stores(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES fa_store_contacts(id) ON DELETE SET NULL,
  interaction_type TEXT NOT NULL
    CHECK (interaction_type IN ('phone_call', 'email', 'meeting', 'visit', 'audit_update', 'fra_update', 'other')),
  subject TEXT NOT NULL,
  details TEXT,
  outcome TEXT,
  interaction_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  follow_up_date DATE,
  created_by_user_id UUID NOT NULL REFERENCES fa_profiles(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fa_store_contact_tracker_subject_not_blank CHECK (char_length(trim(subject)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_store_contacts_store ON fa_store_contacts(store_id);
CREATE INDEX IF NOT EXISTS idx_store_contacts_primary ON fa_store_contacts(store_id, is_primary);

CREATE INDEX IF NOT EXISTS idx_store_notes_store ON fa_store_notes(store_id);
CREATE INDEX IF NOT EXISTS idx_store_notes_created_at ON fa_store_notes(created_at);

CREATE INDEX IF NOT EXISTS idx_store_tracker_store ON fa_store_contact_tracker(store_id);
CREATE INDEX IF NOT EXISTS idx_store_tracker_contact ON fa_store_contact_tracker(contact_id);
CREATE INDEX IF NOT EXISTS idx_store_tracker_type ON fa_store_contact_tracker(interaction_type);
CREATE INDEX IF NOT EXISTS idx_store_tracker_interaction_at ON fa_store_contact_tracker(interaction_at);

CREATE TRIGGER fa_store_contacts_updated_at
  BEFORE UPDATE ON fa_store_contacts
  FOR EACH ROW EXECUTE FUNCTION fa_update_updated_at();

CREATE TRIGGER fa_store_notes_updated_at
  BEFORE UPDATE ON fa_store_notes
  FOR EACH ROW EXECUTE FUNCTION fa_update_updated_at();

CREATE TRIGGER fa_store_contact_tracker_updated_at
  BEFORE UPDATE ON fa_store_contact_tracker
  FOR EACH ROW EXECUTE FUNCTION fa_update_updated_at();

ALTER TABLE fa_store_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE fa_store_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE fa_store_contact_tracker ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access to store contacts"
  ON fa_store_contacts FOR ALL
  USING (fa_get_user_role(auth.uid()) = 'admin');

CREATE POLICY "Ops can manage store contacts"
  ON fa_store_contacts FOR ALL
  USING (fa_get_user_role(auth.uid()) = 'ops');

CREATE POLICY "Readonly can view store contacts"
  ON fa_store_contacts FOR SELECT
  USING (fa_get_user_role(auth.uid()) = 'readonly');

CREATE POLICY "Client can view store contacts"
  ON fa_store_contacts FOR SELECT
  USING (fa_get_user_role(auth.uid()) = 'client');

CREATE POLICY "Admin full access to store notes"
  ON fa_store_notes FOR ALL
  USING (fa_get_user_role(auth.uid()) = 'admin');

CREATE POLICY "Ops can manage store notes"
  ON fa_store_notes FOR ALL
  USING (fa_get_user_role(auth.uid()) = 'ops');

CREATE POLICY "Readonly can view store notes"
  ON fa_store_notes FOR SELECT
  USING (fa_get_user_role(auth.uid()) = 'readonly');

CREATE POLICY "Client can view store notes"
  ON fa_store_notes FOR SELECT
  USING (fa_get_user_role(auth.uid()) = 'client');

CREATE POLICY "Admin full access to store contact tracker"
  ON fa_store_contact_tracker FOR ALL
  USING (fa_get_user_role(auth.uid()) = 'admin');

CREATE POLICY "Ops can manage store contact tracker"
  ON fa_store_contact_tracker FOR ALL
  USING (fa_get_user_role(auth.uid()) = 'ops');

CREATE POLICY "Readonly can view store contact tracker"
  ON fa_store_contact_tracker FOR SELECT
  USING (fa_get_user_role(auth.uid()) = 'readonly');

CREATE POLICY "Client can view store contact tracker"
  ON fa_store_contact_tracker FOR SELECT
  USING (fa_get_user_role(auth.uid()) = 'client');
