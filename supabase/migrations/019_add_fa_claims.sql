-- Add fa_claims table for insurance claims (from FAHS transfer)
-- Supports Claims & RIDDOR section of the incidents dashboard

CREATE TABLE fa_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_no TEXT NOT NULL UNIQUE,
  incident_id UUID REFERENCES fa_incidents(id) ON DELETE SET NULL,
  store_id UUID NOT NULL REFERENCES fa_stores(id) ON DELETE RESTRICT,
  received_date DATE NOT NULL,
  claimant_type TEXT NOT NULL, -- 'Employee', 'Public', 'Contractor'
  allegation TEXT NOT NULL,
  insurer_notified BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'Open', -- 'Open', 'Closed'
  estimated_exposure NUMERIC,
  evidence_cctv BOOLEAN NOT NULL DEFAULT false,
  evidence_photos BOOLEAN NOT NULL DEFAULT false,
  evidence_statements BOOLEAN NOT NULL DEFAULT false,
  evidence_ra_sop BOOLEAN NOT NULL DEFAULT false,
  next_action TEXT,
  owner TEXT,
  due_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_claims_store_id ON fa_claims(store_id);
CREATE INDEX idx_claims_incident_id ON fa_claims(incident_id);
CREATE INDEX idx_claims_status ON fa_claims(status);
CREATE INDEX idx_claims_received_date ON fa_claims(received_date);

-- Add source reference for imported incidents (preserves FAHS id e.g. DEC-025 for linking claims)
ALTER TABLE fa_incidents ADD COLUMN IF NOT EXISTS source_reference TEXT;
CREATE INDEX IF NOT EXISTS idx_incidents_source_reference ON fa_incidents(source_reference);

-- RLS
ALTER TABLE fa_claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access to claims"
  ON fa_claims FOR ALL
  USING (
    EXISTS (SELECT 1 FROM fa_profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

CREATE POLICY "Ops can manage claims"
  ON fa_claims FOR ALL
  USING (
    EXISTS (SELECT 1 FROM fa_profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'ops'))
  );

CREATE POLICY "Readonly can view claims"
  ON fa_claims FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM fa_profiles p WHERE p.id = auth.uid())
  );

CREATE POLICY "Client can view claims"
  ON fa_claims FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM fa_profiles p WHERE p.id = auth.uid() AND p.role = 'client')
  );
