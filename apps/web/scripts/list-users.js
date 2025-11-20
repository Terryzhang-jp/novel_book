#!/usr/bin/env node

/**
 * 列出所有Supabase用户详细信息
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

async function listUsers() {
  console.log('\n👥 Supabase 用户列表\n');

  const { data: users, error } = await supabase
    .from('users')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('❌ 查询失败:', error.message);
    process.exit(1);
  }

  console.log(`📊 总用户数: ${users.length}\n`);
  console.log('─'.repeat(100));

  users.forEach((user, index) => {
    console.log(`\n${index + 1}. 用户信息:`);
    console.log(`   📧 邮箱:      ${user.email}`);
    console.log(`   👤 用户名:    ${user.name || '未设置'}`);
    console.log(`   🆔 ID:        ${user.id}`);
    console.log(`   📅 创建时间:  ${new Date(user.created_at).toLocaleString('zh-CN')}`);
    console.log(`   🔄 更新时间:  ${new Date(user.updated_at).toLocaleString('zh-CN')}`);

    // 检查该用户的文档数量
    supabase
      .from('documents')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .then(({ count }) => {
        console.log(`   📄 文档数:    ${count || 0}`);
      });

    // 检查该用户的照片数量
    supabase
      .from('photos')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .then(({ count }) => {
        console.log(`   📷 照片数:    ${count || 0}`);
      });
  });

  console.log('\n' + '─'.repeat(100) + '\n');
}

listUsers()
  .catch((error) => {
    console.error('\n❌ 失败:', error.message);
    process.exit(1);
  });
