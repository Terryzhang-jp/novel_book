-- Migration 008: Add thumbnail_url column to photos table
-- Thumbnails are smaller versions of photos for faster gallery loading

-- Add thumbnail_url column
ALTER TABLE photos
ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;

-- Add index for faster queries
CREATE INDEX IF NOT EXISTS idx_photos_thumbnail ON photos(thumbnail_url) WHERE thumbnail_url IS NOT NULL;
