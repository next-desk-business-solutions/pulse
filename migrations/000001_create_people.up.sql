-- Create people table
CREATE TABLE IF NOT EXISTS people (
    id UUID PRIMARY KEY,
    linkedin_url VARCHAR(255) UNIQUE NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    phase VARCHAR(50) DEFAULT 'NEW',
    created_at TIMESTAMPTZ DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
    phase_updated_at TIMESTAMPTZ DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
);

-- Set table owner
ALTER TABLE people OWNER TO pulse;