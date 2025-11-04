#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// 加载环境变量
const envPath = path.join(__dirname, '../.env.local');
if (fs.existsSync(envPath)) {
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
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkMigration() {
  console.log('🔍 Checking if require_password_change column exists...\n');

  // 测试字段是否存在
  const { data, error } = await supabase
    .from('users')
    .select('id, email, require_password_change')
    .limit(1);

  if (error) {
    if (error.message.includes('require_password_change') || error.code === '42703') {
      console.log('❌ Column does not exist.\n');
      console.log('Please run this SQL in your Supabase SQL Editor:\n');
      console.log('-------------------------------------------');
      const sqlPath = path.join(__dirname, '../supabase/migrations/003_add_require_password_change.sql');
      console.log(fs.readFileSync(sqlPath, 'utf-8'));
      console.log('-------------------------------------------\n');
      process.exit(1);
    } else {
      console.error('❌ Unexpected error:', error.message);
      process.exit(1);
    }
  } else {
    console.log('✅ Column require_password_change exists!');
    console.log('   Migration has been applied successfully.\n');
    process.exit(0);
  }
}

checkMigration();
