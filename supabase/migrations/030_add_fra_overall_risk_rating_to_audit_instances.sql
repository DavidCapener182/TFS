ALTER TABLE fa_audit_instances
ADD COLUMN IF NOT EXISTS fra_overall_risk_rating TEXT;

ALTER TABLE fa_audit_instances
DROP CONSTRAINT IF EXISTS fa_audit_instances_fra_overall_risk_rating_check;

ALTER TABLE fa_audit_instances
ADD CONSTRAINT fa_audit_instances_fra_overall_risk_rating_check
CHECK (
  fra_overall_risk_rating IS NULL
  OR fra_overall_risk_rating IN ('Tolerable', 'Moderate', 'Substantial', 'Intolerable')
);

COMMENT ON COLUMN fa_audit_instances.fra_overall_risk_rating IS
'Overall Fire Risk Assessment rating for SafeHub FRA instances. Kept separate from overall_score, which remains a numeric percentage.';

UPDATE fa_audit_instances AS ai
SET fra_overall_risk_rating = latest_rating.rating
FROM LATERAL (
  SELECT candidate.rating
  FROM (
    SELECT
      COALESCE(
        ar.response_json ->> 'riskRatingOverall',
        ar.response_json ->> 'actionPlanLevel',
        ar.response_json ->> 'overallRiskRating',
        ar.response_json ->> 'overall_risk_rating',
        ar.response_json ->> 'overallRisk',
        ar.response_json ->> 'overall_risk',
        ar.response_json -> 'fra_extracted_data' ->> 'riskRatingOverall',
        ar.response_json -> 'fra_extracted_data' ->> 'actionPlanLevel',
        ar.response_json -> 'fra_extracted_data' ->> 'overallRiskRating',
        ar.response_json -> 'fra_extracted_data' ->> 'overall_risk_rating',
        ar.response_json -> 'fra_extracted_data' ->> 'overallRisk',
        ar.response_json -> 'fra_extracted_data' ->> 'overall_risk',
        ar.response_json -> 'fra_custom_data' ->> 'riskRatingOverall',
        ar.response_json -> 'fra_custom_data' ->> 'actionPlanLevel',
        ar.response_json -> 'fra_custom_data' ->> 'overallRiskRating',
        ar.response_json -> 'fra_custom_data' ->> 'overall_risk_rating',
        ar.response_json -> 'fra_custom_data' ->> 'overallRisk',
        ar.response_json -> 'fra_custom_data' ->> 'overall_risk'
      ) AS rating,
      ar.created_at
    FROM fa_audit_responses AS ar
    WHERE ar.audit_instance_id = ai.id
  ) AS candidate
  WHERE candidate.rating IN ('Tolerable', 'Moderate', 'Substantial', 'Intolerable')
  ORDER BY candidate.created_at DESC
  LIMIT 1
) AS latest_rating
WHERE latest_rating.rating IS NOT NULL;
