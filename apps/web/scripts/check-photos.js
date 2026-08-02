#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load env
const envPath = path.join(__dirname, '../.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach(line => {
    const match = line.match(/^([^=:#]+)=(.*)$/);
    if (match) {
      process.env[match[1].trim()] = match[2].trim();
    }
  });
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

async function checkPhotos() {
  const { data: photos, error } = await supabase
    .from('photos')
    .select('id, file_name, file_url, is_public')
    .limit(5);

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('Sample photos from database:\n');
  photos.forEach((photo, i) => {
    console.log(`--- Photo ${i + 1} ---`);
    console.log('file_name:', photo.file_name);
    console.log('file_url:', photo.file_url);
    console.log('is_public:', photo.is_public);
    console.log('');
  });
}

checkPhotos();
