-- Migration 002: Add Location Sharing Support
-- Adds is_public field to locations table and creates RLS policies for public locations

-- ============================================================================
-- ADD is_public COLUMN TO LOCATIONS TABLE
-- ============================================================================

-- Add is_public column (default to FALSE for existing locations)
ALTER TABLE locations
ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT FALSE;

-- Create index for public locations
CREATE INDEX IF NOT EXISTS idx_locations_is_public ON locations(is_public);

-- ============================================================================
-- UPDATE ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Drop existing restrictive policy (if exists)
DROP POLICY IF EXISTS "Users can view own locations" ON locations;

-- Create new policy: Users can view their own locations
CREATE POLICY "Users can view own locations"
  ON locations FOR SELECT
  USING (auth.uid()::text = user_id::text);

-- Create new policy: Anyone can view public locations
CREATE POLICY "Public locations are viewable by everyone"
  ON locations FOR SELECT
  USING (is_public = true);

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON COLUMN locations.is_public IS 'Whether this location is shared with all users (true) or private (false)';
COMMENT ON INDEX idx_locations_is_public IS 'Index for filtering public/private locations';
