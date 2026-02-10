-- Store-level actions generated from audit tracker flagged items
-- Keeps audit follow-up tasks tied directly to a store (without requiring an incident).

CREATE TABLE IF NOT EXISTS fa_store_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES fa_stores(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  source_flagged_item TEXT,
  priority fa_action_priority NOT NULL DEFAULT 'medium',
  due_date DATE NOT NULL,
  status fa_action_status NOT NULL DEFAULT 'open',
  ai_generated BOOLEAN NOT NULL DEFAULT true,
  created_by_user_id UUID NOT NULL REFERENCES fa_profiles(id) ON DELETE RESTRICT,
  completed_at TIMESTAMPTZ,
  completion_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_store_actions_store ON fa_store_actions(store_id);
CREATE INDEX IF NOT EXISTS idx_store_actions_status ON fa_store_actions(status);
CREATE INDEX IF NOT EXISTS idx_store_actions_due_date ON fa_store_actions(due_date);
CREATE INDEX IF NOT EXISTS idx_store_actions_priority ON fa_store_actions(priority);

ALTER TABLE fa_store_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access to store actions"
  ON fa_store_actions FOR ALL
  USING (fa_get_user_role(auth.uid()) = 'admin');

CREATE POLICY "Ops can manage store actions"
  ON fa_store_actions FOR ALL
  USING (fa_get_user_role(auth.uid()) = 'ops');

CREATE POLICY "Readonly can view store actions"
  ON fa_store_actions FOR SELECT
  USING (fa_get_user_role(auth.uid()) = 'readonly');

CREATE POLICY "Client can view store actions"
  ON fa_store_actions FOR SELECT
  USING (fa_get_user_role(auth.uid()) = 'client');

CREATE TRIGGER fa_store_actions_updated_at
  BEFORE UPDATE ON fa_store_actions
  FOR EACH ROW EXECUTE FUNCTION fa_update_updated_at();
