/**
 * Test Supabase Connection
 *
 * Run this script to verify your Supabase setup:
 * node scripts/test-supabase-connection.js
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Read .env.local file
const envPath = path.join(__dirname, '../../../.env.local');
const envFile = fs.readFileSync(envPath, 'utf8');

// Parse environment variables
const env = {};
envFile.split('\n').forEach(line => {
  const match = line.match(/^([^=:#]+)=(.*)$/);
  if (match) {
    const key = match[1].trim();
    const value = match[2].trim();
    env[key] = value;
  }
});

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceKey = env.SUPABASE_SERVICE_ROLE_KEY;

console.log('🔍 Testing Supabase Connection...\n');

// Test 1: Environment Variables
console.log('✅ Step 1: Checking environment variables');
console.log('   NEXT_PUBLIC_SUPABASE_URL:', supabaseUrl ? '✓ Set' : '✗ Missing');
console.log('   NEXT_PUBLIC_SUPABASE_ANON_KEY:', supabaseAnonKey ? '✓ Set' : '✗ Missing');
console.log('   SUPABASE_SERVICE_ROLE_KEY:', supabaseServiceKey ? '✓ Set' : '✗ Missing');

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('\n❌ Missing required environment variables!');
  process.exit(1);
}

// Test 2: Connection with Anon Key
async function testConnection() {
  console.log('\n✅ Step 2: Testing connection with anon key');

  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  try {
    // Try to query a table (will fail if tables don't exist, but connection works)
    const { data, error } = await supabase.from('users').select('count');

    if (error) {
      if (error.message.includes('relation') || error.message.includes('does not exist')) {
        console.log('   ⚠️  Connection OK, but tables not created yet');
        console.log('   → Run the SQL migration in Supabase Dashboard');
      } else {
        console.error('   ❌ Connection error:', error.message);
      }
    } else {
      console.log('   ✓ Connection successful!');
      console.log('   → Database is ready');
    }
  } catch (err) {
    console.error('   ❌ Unexpected error:', err.message);
  }

  // Test 3: Storage
  console.log('\n✅ Step 3: Testing storage access');

  try {
    const { data: buckets, error: storageError } = await supabase.storage.listBuckets();

    if (storageError) {
      console.error('   ❌ Storage error:', storageError.message);
    } else {
      console.log('   ✓ Storage accessible');
      console.log('   → Buckets:', buckets.map(b => b.name).join(', ') || 'None');

      const hasPhotosBucket = buckets.some(b => b.name === 'photos');
      if (!hasPhotosBucket) {
        console.log('   ⚠️  "photos" bucket not found');
        console.log('   → Create it in Supabase Dashboard → Storage');
      } else {
        console.log('   ✓ "photos" bucket exists');
      }
    }
  } catch (err) {
    console.error('   ❌ Storage test failed:', err.message);
  }
}

// Test 4: Admin Client
async function testAdminConnection() {
  if (!supabaseServiceKey) {
    console.log('\n⚠️  Skipping admin connection test (service key not set)');
    return;
  }

  console.log('\n✅ Step 4: Testing admin connection (service role)');

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  try {
    const { data, error } = await supabaseAdmin.from('users').select('count');

    if (error) {
      if (error.message.includes('relation') || error.message.includes('does not exist')) {
        console.log('   ⚠️  Admin connection OK, but tables not created yet');
      } else {
        console.error('   ❌ Admin connection error:', error.message);
      }
    } else {
      console.log('   ✓ Admin connection successful!');
      console.log('   ⚠️  Remember: Admin client bypasses RLS!');
    }
  } catch (err) {
    console.error('   ❌ Unexpected error:', err.message);
  }
}

// Run tests
(async () => {
  await testConnection();
  await testAdminConnection();

  console.log('\n' + '='.repeat(50));
  console.log('📋 Next Steps:');
  console.log('='.repeat(50));
  console.log('1. Create database tables:');
  console.log('   → Supabase Dashboard → SQL Editor');
  console.log('   → Run: supabase/migrations/001_initial_schema.sql');
  console.log('');
  console.log('2. Create storage bucket:');
  console.log('   → Supabase Dashboard → Storage');
  console.log('   → Create bucket: "photos" (public)');
  console.log('');
  console.log('3. Read the guide:');
  console.log('   → apps/web/supabase/README.md');
  console.log('='.repeat(50) + '\n');
})();
