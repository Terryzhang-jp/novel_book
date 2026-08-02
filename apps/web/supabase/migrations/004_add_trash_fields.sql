-- Migration: Add trash bin functionality to photos
-- Date: 2025-11-06
-- Description: Adds trashed and trashed_at fields to support photo trash bin feature

-- Add trashed field (boolean, default false)
ALTER TABLE photos
ADD COLUMN IF NOT EXISTS trashed BOOLEAN DEFAULT false;

-- Add trashed_at field (timestamp, nullable)
ALTER TABLE photos
ADD COLUMN IF NOT EXISTS trashed_at TIMESTAMP WITH TIME ZONE;

-- Create index for efficient querying of non-trashed photos
-- This is the most common query pattern (showing gallery photos)
CREATE INDEX IF NOT EXISTS idx_photos_trashed
ON photos(user_id, trashed)
WHERE trashed = false;

-- Create index for efficient querying of trashed photos
-- Used when displaying trash bin
CREATE INDEX IF NOT EXISTS idx_photos_trashed_at
ON photos(user_id, trashed_at)
WHERE trashed = true;

-- Add comment to document the fields
COMMENT ON COLUMN photos.trashed IS 'Whether the photo is in the trash bin';
COMMENT ON COLUMN photos.trashed_at IS 'Timestamp when the photo was moved to trash';
