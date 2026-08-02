#!/usr/bin/env node

/**
 * 列出所有Supabase用户详细信息（包含文档和照片统计）
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

async function listUsersDetailed() {
  console.log('\n👥 Supabase 用户详细信息\n');

  const { data: users, error } = await supabase
    .from('users')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('❌ 查询失败:', error.message);
    process.exit(1);
  }

  console.log(`📊 总用户数: ${users.length}\n`);
  console.log('═'.repeat(100));

  for (const [index, user] of users.entries()) {
    // 查询文档数
    const { count: docCount } = await supabase
      .from('documents')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id);

    // 查询照片数
    const { count: photoCount } = await supabase
      .from('photos')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id);

    console.log(`\n${index + 1}. ${user.name || '未命名用户'}`);
    console.log(`   📧 邮箱:      ${user.email}`);
    console.log(`   🆔 ID:        ${user.id}`);
    console.log(`   📅 创建时间:  ${new Date(user.created_at).toLocaleString('zh-CN')}`);
    console.log(`   🔄 更新时间:  ${new Date(user.updated_at).toLocaleString('zh-CN')}`);
    console.log(`   📄 文档数:    ${docCount || 0}`);
    console.log(`   📷 照片数:    ${photoCount || 0}`);
  }

  console.log('\n' + '═'.repeat(100));

  // 统计汇总
  const totalDocs = await supabase.from('documents').select('*', { count: 'exact', head: true });
  const totalPhotos = await supabase.from('photos').select('*', { count: 'exact', head: true });

  console.log('\n📊 数据统计汇总:');
  console.log(`   总用户数:  ${users.length}`);
  console.log(`   总文档数:  ${totalDocs.count || 0}`);
  console.log(`   总照片数:  ${totalPhotos.count || 0}`);
  console.log('');
}

listUsersDetailed()
  .catch((error) => {
    console.error('\n❌ 失败:', error.message);
    process.exit(1);
  });
