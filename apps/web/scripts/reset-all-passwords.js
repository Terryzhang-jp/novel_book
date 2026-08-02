#!/usr/bin/env node

/**
 * Reset All Passwords Script
 *
 * 重置所有用户密码为指定值
 */

const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

// Load env
const envPath = path.join(__dirname, '../.env.local');
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
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Error: Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function resetAllPasswords() {
  // 不再提供默认密码 —— 此前默认值是一个弱口令，不带参数运行会把
  // 所有用户的密码统一重置成它。必须显式传入。
  const newPassword = process.argv[2];
  if (!newPassword || newPassword.length < 12) {
    console.error('用法: node scripts/reset-all-passwords.js <新密码>（至少 12 位）');
    process.exit(1);
  }
  const passwordHash = await bcrypt.hash(newPassword, 10);

  console.log(`\n🔑 Resetting all passwords to: ${newPassword}\n`);

  const { data: users, error: fetchError } = await supabase
    .from('users')
    .select('id, email');

  if (fetchError) {
    console.error('Failed to fetch users:', fetchError);
    return;
  }

  console.log(`Found ${users.length} users:\n`);

  for (const user of users) {
    const { error } = await supabase
      .from('users')
      .update({ password_hash: passwordHash, require_password_change: false })
      .eq('id', user.id);

    if (error) {
      console.log(`❌ ${user.email}: Failed - ${error.message}`);
    } else {
      console.log(`✅ ${user.email}: Password reset`);
    }
  }

  console.log('\n✅ All passwords reset complete!');
}

resetAllPasswords()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Error:', err);
    process.exit(1);
  });
