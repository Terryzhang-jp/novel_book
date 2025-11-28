-- Migration: Add decorations column to documents table
-- Created: 2025-11-24
-- Purpose: Support journal/scrapbook decoration elements

-- Add decorations column (nullable, defaults to empty array)
ALTER TABLE documents
ADD COLUMN IF NOT EXISTS decorations JSONB DEFAULT '[]';

-- Add index for faster queries (optional, for future optimization)
CREATE INDEX IF NOT EXISTS idx_documents_decorations 
ON documents USING GIN (decorations);

-- Add comment for documentation
COMMENT ON COLUMN documents.decorations IS 'Journal decoration elements (stickers, text boxes, shapes, drawings)';
