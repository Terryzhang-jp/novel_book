-- Migration: Add photo editing support
-- Date: 2025-11-07
-- Description: Adds fields to track original photos and edit history

-- Add original_file_url field (stores original photo before editing)
ALTER TABLE photos
ADD COLUMN IF NOT EXISTS original_file_url TEXT;

-- Add edited field (boolean, default false)
ALTER TABLE photos
ADD COLUMN IF NOT EXISTS edited BOOLEAN DEFAULT false;

-- Add edited_at field (timestamp, nullable)
ALTER TABLE photos
ADD COLUMN IF NOT EXISTS edited_at TIMESTAMP WITH TIME ZONE;

-- Create index for efficient querying of edited photos
CREATE INDEX IF NOT EXISTS idx_photos_edited
ON photos(user_id, edited)
WHERE edited = true;

-- Add comments to document the fields
COMMENT ON COLUMN photos.original_file_url IS 'URL of the original photo before any edits (null if never edited)';
COMMENT ON COLUMN photos.edited IS 'Whether the photo has been edited';
COMMENT ON COLUMN photos.edited_at IS 'Timestamp when the photo was last edited';
