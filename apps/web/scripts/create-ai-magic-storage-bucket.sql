-- Migration: Create ai-magic-images Storage bucket
-- Purpose: Store AI Magic generated images in Supabase Storage instead of database
-- Run this in Supabase SQL Editor

-- Step 1: Create the storage bucket (if not exists)
-- Note: This needs to be done in Supabase Dashboard > Storage > New bucket
-- Bucket name: ai-magic-images
-- Public: Yes (for easy access)

-- Step 2: Set up storage policies for the bucket
-- Allow authenticated users to upload to their own folder
INSERT INTO storage.policies (name, bucket_id, definition)
SELECT 
  'authenticated users can upload to own folder',
  'ai-magic-images',
  '(bucket_id = ''ai-magic-images'' AND auth.uid()::text = (storage.foldername(name))[1])'
WHERE NOT EXISTS (
  SELECT 1 FROM storage.policies 
  WHERE name = 'authenticated users can upload to own folder' 
  AND bucket_id = 'ai-magic-images'
);

-- Alternative: Run these RLS policies manually in Supabase Dashboard > Storage > Policies
-- 
-- For ai-magic-images bucket:
-- 1. Allow public read access:
--    SELECT: true
-- 
-- 2. Allow authenticated users to upload:
--    INSERT: auth.uid()::text = (storage.foldername(name))[1]

-- IMPORTANT: If the SQL above doesn't work, create the bucket manually:
-- 1. Go to Supabase Dashboard > Storage
-- 2. Click "New bucket"
-- 3. Name: ai-magic-images
-- 4. Make it public
-- 5. Click "Create bucket"
