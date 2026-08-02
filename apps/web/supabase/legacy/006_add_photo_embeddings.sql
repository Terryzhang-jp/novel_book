-- Migration: Add photo embeddings table for persistent storage
-- Date: 2025-12-17
-- Description: Stores photo embeddings for visualization in gallery explore

-- Create photo_embeddings table
CREATE TABLE IF NOT EXISTS photo_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    photo_id UUID NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vector FLOAT8[] NOT NULL,
    dimension INTEGER NOT NULL DEFAULT 512,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Ensure unique embedding per photo
    UNIQUE(photo_id)
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_photo_embeddings_user_id 
ON photo_embeddings(user_id);

CREATE INDEX IF NOT EXISTS idx_photo_embeddings_photo_id 
ON photo_embeddings(photo_id);

-- Add comments
COMMENT ON TABLE photo_embeddings IS 'Stores photo embeddings for visualization';
COMMENT ON COLUMN photo_embeddings.vector IS 'Embedding vector from Vertex AI multimodal model';
COMMENT ON COLUMN photo_embeddings.dimension IS 'Dimension of the embedding (128, 256, 512, or 1408)';
