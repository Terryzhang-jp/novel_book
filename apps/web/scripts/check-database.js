#!/usr/bin/env node

/**
 * 检查 Supabase 数据库状态
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// 加载 .env.local
const possibleEnvPaths = [
  path.join(__dirname, '../.env.local'),
  path.join(__dirname, '../../../.env.local'),
];

for (const envPath of possibleEnvPaths) {
  if (fs.existsSync(envPath)) {
    console.log(`📄 Loading environment from: ${envPath}`);
    const envContent = fs.readFileSync(envPath, 'utf-8');
    envContent.split('\n').forEach(line => {
      const match = line.match(/^([^=:#]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        const value = match[2].trim();
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    });
    break;
  }
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Error: Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function checkDatabase() {
  console.log('\n🔍 Checking Supabase database...\n');

  // 检查 users 表
  console.log('📊 Checking users table...');
  const { data: users, error: usersError } = await supabase
    .from('users')
    .select('id, email')
    .limit(5);

  if (usersError) {
    console.log('❌ users table does not exist or has error:', usersError.message);
  } else {
    console.log(`✅ users table exists, found ${users.length} users`);
    users.forEach(user => {
      console.log(`   - ${user.email}`);
    });
  }

  // 检查 documents 表
  console.log('\n📊 Checking documents table...');
  const { data: docs, error: docsError } = await supabase
    .from('documents')
    .select('id')
    .limit(1);

  if (docsError) {
    console.log('❌ documents table does not exist or has error:', docsError.message);
  } else {
    console.log('✅ documents table exists');
  }

  // 检查 photos 表
  console.log('\n📊 Checking photos table...');
  const { data: photos, error: photosError } = await supabase
    .from('photos')
    .select('id')
    .limit(1);

  if (photosError) {
    console.log('❌ photos table does not exist or has error:', photosError.message);
  } else {
    console.log('✅ photos table exists');
  }

  // 检查 locations 表
  console.log('\n📊 Checking locations table...');
  const { data: locations, error: locationsError } = await supabase
    .from('locations')
    .select('id')
    .limit(1);

  if (locationsError) {
    console.log('❌ locations table does not exist or has error:', locationsError.message);
  } else {
    console.log('✅ locations table exists');
  }

  console.log('\n✅ Database check complete!');
}

checkDatabase()
  .catch((error) => {
    console.error('\n❌ Failed:', error.message);
    process.exit(1);
  });
