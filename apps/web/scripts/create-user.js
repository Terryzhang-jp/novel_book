#!/usr/bin/env node

/**
 * Create User Script
 *
 * 直接在 Supabase 数据库中创建用户
 */

const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

// 手动加载 .env.local（尝试多个位置）
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
  console.error('   Please ensure .env.local contains:');
  console.error('   - NEXT_PUBLIC_SUPABASE_URL');
  console.error('   - SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function createUser(email, password, name) {
  try {
    console.log(`\n🔨 Creating user: ${email}`);

    // 检查用户是否已存在
    const { data: existingUser } = await supabase
      .from('users')
      .select('id, email')
      .eq('email', email)
      .single();

    if (existingUser) {
      console.log(`⚠️  User already exists: ${email}`);
      console.log(`   User ID: ${existingUser.id}`);
      return existingUser;
    }

    // 生成密码哈希
    const passwordHash = await bcrypt.hash(password, 10);

    // 创建用户
    const userId = uuidv4();
    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from('users')
      .insert({
        id: userId,
        email,
        password_hash: passwordHash,
        name: name || null,
        require_password_change: true, // 管理员创建的用户需要首次登录修改密码
        created_at: now,
        updated_at: now,
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    console.log(`✅ User created successfully!`);
    console.log(`   User ID: ${data.id}`);
    console.log(`   Email: ${data.email}`);
    console.log(`   Name: ${data.name || 'Not set'}`);
    console.log(`   ⚠️  User must change password on first login`);

    return data;
  } catch (error) {
    console.error(`❌ Error creating user:`, error.message);
    throw error;
  }
}

// 从命令行参数读取或使用默认值
const email = process.argv[2] || 'terrywang.0915@gmail.com';
const password = process.argv[3] || 'Qazxsw123';
const name = process.argv[4] || 'Terry Wang';

createUser(email, password, name)
  .then(() => {
    console.log('\n✅ Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Failed:', error.message);
    process.exit(1);
  });
