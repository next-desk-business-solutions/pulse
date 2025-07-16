-- Create engagements table
CREATE TABLE IF NOT EXISTS engagements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    person_id UUID NOT NULL,
    post_url VARCHAR(500),
    post_body TEXT,
    reply TEXT,
    engagement_type VARCHAR(50) NOT NULL DEFAULT 'POST_ENGAGEMENT',
    issue_id VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
    
    -- Foreign key constraint
    CONSTRAINT fk_person
        FOREIGN KEY(person_id) 
        REFERENCES people(id)
        ON DELETE CASCADE
);

-- Create index on person_id for better query performance
CREATE INDEX idx_engagements_person_id ON engagements(person_id);

-- Create index on post_url for uniqueness and query performance (automatically created by UNIQUE constraint)
-- CREATE INDEX idx_engagements_post_url ON engagements(post_url);

-- Create index on issue_id for better query performance
CREATE INDEX idx_engagements_issue_id ON engagements(issue_id);

-- Create index on created_at for time-based queries
CREATE INDEX idx_engagements_created_at ON engagements(created_at);

-- Set table owner
ALTER TABLE engagements OWNER TO pulse;