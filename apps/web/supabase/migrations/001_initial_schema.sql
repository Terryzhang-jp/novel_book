-- Travel Creation Database Schema
-- Migration 001: Initial Schema

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- USERS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT,
  profile JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for email lookup
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- ============================================================================
-- DOCUMENTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content JSONB NOT NULL DEFAULT '{}'::jsonb,
  images TEXT[] DEFAULT ARRAY[]::TEXT[],
  tags TEXT[] DEFAULT ARRAY[]::TEXT[],
  preview TEXT,
  is_public BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for documents
CREATE INDEX IF NOT EXISTS idx_documents_user_id ON documents(user_id);
CREATE INDEX IF NOT EXISTS idx_documents_created_at ON documents(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_documents_updated_at ON documents(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_documents_is_public ON documents(is_public);

-- ============================================================================
-- PHOTOS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS photos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  original_name TEXT NOT NULL,
  file_url TEXT NOT NULL,

  -- EXIF metadata
  metadata JSONB DEFAULT '{}'::jsonb,

  -- Location (can be from EXIF or manual)
  location_id UUID,

  -- Category
  category TEXT NOT NULL CHECK (category IN ('time-location', 'time-only', 'location-only', 'neither')),

  -- Optional fields
  title TEXT,
  description JSONB,
  tags TEXT[] DEFAULT ARRAY[]::TEXT[],

  -- Public/Private
  is_public BOOLEAN DEFAULT TRUE,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for photos
CREATE INDEX IF NOT EXISTS idx_photos_user_id ON photos(user_id);
CREATE INDEX IF NOT EXISTS idx_photos_category ON photos(category);
CREATE INDEX IF NOT EXISTS idx_photos_is_public ON photos(is_public);
CREATE INDEX IF NOT EXISTS idx_photos_created_at ON photos(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_photos_location_id ON photos(location_id);

-- GiST index for location queries (if we add geography column later)
-- CREATE INDEX idx_photos_location ON photos USING GIST ((metadata->'location'));

-- ============================================================================
-- LOCATIONS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS locations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  coordinates JSONB NOT NULL,
  address JSONB,
  place_id TEXT,
  category TEXT,
  notes TEXT,
  usage_count INT DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for locations
CREATE INDEX IF NOT EXISTS idx_locations_user_id ON locations(user_id);
CREATE INDEX IF NOT EXISTS idx_locations_usage_count ON locations(usage_count DESC);

-- Foreign key for photos -> locations
ALTER TABLE photos
  ADD CONSTRAINT fk_photos_location
  FOREIGN KEY (location_id)
  REFERENCES locations(id)
  ON DELETE SET NULL;

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE locations ENABLE ROW LEVEL SECURITY;

-- Users: Can only read their own data
CREATE POLICY "Users can view own profile"
  ON users FOR SELECT
  USING (auth.uid()::text = id::text);

CREATE POLICY "Users can update own profile"
  ON users FOR UPDATE
  USING (auth.uid()::text = id::text);

-- Documents: Users can CRUD their own documents
CREATE POLICY "Users can view own documents"
  ON documents FOR SELECT
  USING (auth.uid()::text = user_id::text);

CREATE POLICY "Users can create own documents"
  ON documents FOR INSERT
  WITH CHECK (auth.uid()::text = user_id::text);

CREATE POLICY "Users can update own documents"
  ON documents FOR UPDATE
  USING (auth.uid()::text = user_id::text);

CREATE POLICY "Users can delete own documents"
  ON documents FOR DELETE
  USING (auth.uid()::text = user_id::text);

-- Public documents can be viewed by anyone
CREATE POLICY "Public documents are viewable by everyone"
  ON documents FOR SELECT
  USING (is_public = true);

-- Photos: Users can CRUD their own photos
CREATE POLICY "Users can view own photos"
  ON photos FOR SELECT
  USING (auth.uid()::text = user_id::text);

CREATE POLICY "Users can create own photos"
  ON photos FOR INSERT
  WITH CHECK (auth.uid()::text = user_id::text);

CREATE POLICY "Users can update own photos"
  ON photos FOR UPDATE
  USING (auth.uid()::text = user_id::text);

CREATE POLICY "Users can delete own photos"
  ON photos FOR DELETE
  USING (auth.uid()::text = user_id::text);

-- Public photos can be viewed by anyone
CREATE POLICY "Public photos are viewable by everyone"
  ON photos FOR SELECT
  USING (is_public = true);

-- Locations: Users can CRUD their own locations
CREATE POLICY "Users can view own locations"
  ON locations FOR SELECT
  USING (auth.uid()::text = user_id::text);

CREATE POLICY "Users can create own locations"
  ON locations FOR INSERT
  WITH CHECK (auth.uid()::text = user_id::text);

CREATE POLICY "Users can update own locations"
  ON locations FOR UPDATE
  USING (auth.uid()::text = user_id::text);

CREATE POLICY "Users can delete own locations"
  ON locations FOR DELETE
  USING (auth.uid()::text = user_id::text);

-- ============================================================================
-- TRIGGERS FOR UPDATED_AT
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_documents_updated_at
  BEFORE UPDATE ON documents
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_photos_updated_at
  BEFORE UPDATE ON photos
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_locations_updated_at
  BEFORE UPDATE ON locations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- STORAGE BUCKETS (Run this in Supabase Dashboard → Storage)
-- ============================================================================

-- Create storage bucket for photos
-- Bucket name: 'photos'
-- Public: true
-- File size limit: 10 MB
-- Allowed MIME types: image/jpeg, image/png, image/gif, image/webp

-- Storage policies will be:
-- 1. Users can upload to their own folder: photos/{user_id}/*
-- 2. Everyone can read public photos
-- 3. Users can delete their own photos

-- Note: You need to create the bucket manually in Supabase Dashboard
-- Then apply these policies in the Storage settings
