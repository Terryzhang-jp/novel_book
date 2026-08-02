-- Migration 003: Add require_password_change field to users table
-- This field tracks whether a user needs to change their password on next login

ALTER TABLE users
ADD COLUMN IF NOT EXISTS require_password_change BOOLEAN DEFAULT true;

-- Set existing users to not require password change
UPDATE users
SET require_password_change = false
WHERE require_password_change IS NULL;

-- Make the column NOT NULL after setting defaults
ALTER TABLE users
ALTER COLUMN require_password_change SET NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN users.require_password_change IS 'Whether the user must change their password on next login (true for new accounts created by admin)';
