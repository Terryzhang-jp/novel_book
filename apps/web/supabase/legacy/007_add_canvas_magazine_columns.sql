-- Migration 007: Add magazine mode columns to canvas_projects
-- This adds the columns needed for magazine-style canvas editing

-- Add is_magazine_mode column (default true for new projects)
ALTER TABLE canvas_projects
ADD COLUMN IF NOT EXISTS is_magazine_mode BOOLEAN DEFAULT true;

-- Add current_page_index column (tracks which page user is editing)
ALTER TABLE canvas_projects
ADD COLUMN IF NOT EXISTS current_page_index INTEGER DEFAULT 0;

-- Add pages column (stores magazine pages as JSONB array)
ALTER TABLE canvas_projects
ADD COLUMN IF NOT EXISTS pages JSONB DEFAULT '[]'::jsonb;

-- Update existing projects to have magazine mode enabled if they have pages
UPDATE canvas_projects
SET is_magazine_mode = true
WHERE pages IS NOT NULL AND jsonb_array_length(pages) > 0;
