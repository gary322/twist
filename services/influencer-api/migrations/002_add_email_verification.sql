-- Add email verification fields to influencers table
ALTER TABLE influencers
ADD COLUMN email_verified BOOLEAN DEFAULT false,
ADD COLUMN email_verified_at TIMESTAMP;

-- Add index for email lookup
CREATE INDEX idx_influencers_email ON influencers(email);

-- Add index for username lookup
CREATE INDEX idx_influencers_username ON influencers(username);