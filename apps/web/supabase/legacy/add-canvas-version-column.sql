-- Migration: Add version column to canvas_projects table
-- Purpose: Enable optimistic locking for concurrent edit detection
-- Run this in Supabase SQL Editor

-- Step 1: Add the version column with default value
ALTER TABLE canvas_projects 
ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

-- Step 2: Create an index for faster version lookups during updates
CREATE INDEX IF NOT EXISTS idx_canvas_projects_version 
ON canvas_projects(id, version);

-- Step 3: Verify the column was added
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'canvas_projects' AND column_name = 'version';

-- Expected result:
-- column_name | data_type | column_default
-- version     | integer   | 1
