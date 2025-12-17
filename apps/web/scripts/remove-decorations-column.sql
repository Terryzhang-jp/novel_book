-- Migration: Remove decorations column from documents table
-- Created: 2025-12-16
-- Purpose: Remove unused journal/scrapbook decoration feature

-- Drop the index first
DROP INDEX IF EXISTS idx_documents_decorations;

-- Remove decorations column
ALTER TABLE documents DROP COLUMN IF EXISTS decorations;
