-- Add short summary label for store actions.
-- This is used by newsletter H&S priorities so we display concise themes instead of full question text.

ALTER TABLE public.fa_store_actions
ADD COLUMN IF NOT EXISTS priority_summary TEXT;

CREATE INDEX IF NOT EXISTS idx_store_actions_priority_summary
  ON public.fa_store_actions(priority_summary);

UPDATE public.fa_store_actions AS actions
SET priority_summary = CASE
  WHEN source_text ~* '(contractor|visitor|permit[[:space:]-]*to[[:space:]-]*work|sign[[:space:]-]*in|sign[[:space:]-]*out)' THEN 'Contractor and visitor controls'
  WHEN source_text ~* '(training|induction|onboarding|toolbox|refresher|competenc)' THEN 'Training and refresher completion'
  WHEN source_text ~* '(housekeeping|stock[[:space:]]*room|stockroom|walkway|trip|slip|obstruction|clutter|access route)' THEN 'Housekeeping and safe access'
  WHEN source_text ~* '(fire[[:space:]]*door|escape route|emergency exit|fire exit|intumescent|evac)' THEN 'Fire door and escape route controls'
  WHEN source_text ~* '(coshh|hazardous substance|chemical|data sheet|sds)' THEN 'COSHH and hazardous substances'
  WHEN source_text ~* '(ladder|step stool|stepladder|working at height|equipment register)' THEN 'Work-at-height equipment checks'
  ELSE 'General H&S control gaps'
END
FROM (
  SELECT
    id,
    concat_ws(' ', coalesce(title, ''), coalesce(source_flagged_item, ''), coalesce(description, '')) AS source_text
  FROM public.fa_store_actions
) AS derived
WHERE actions.id = derived.id
  AND coalesce(btrim(actions.priority_summary), '') = '';
