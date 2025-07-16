-- Drop indexes first
DROP INDEX IF EXISTS idx_engagements_created_at;
DROP INDEX IF EXISTS idx_engagements_issue_id;
DROP INDEX IF EXISTS idx_engagements_person_id;

-- Drop engagements table
DROP TABLE IF EXISTS engagements;