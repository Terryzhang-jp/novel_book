#!/usr/bin/env node

/**
 * 删除指定用户的所有内容（文档和照片）
 *
 * ⚠️ 这是**运维脚本，不是产品功能**（ADR-007 实现要求 5）。
 *
 * 它删的是遗留表里的内容行，**不碰账号本身**：不改 user.status、
 * 不撤销 session、不写 account_events 审计、不清对象存储。
 *
 * 用户发起的「删除我的账号」走的是完全另一条路径 ——
 * 状态机 + 30 天冷静期 + 审计 + 级联，入口是：
 *
 *     pnpm account <status|disable|restore|finalize|run-due>
 *
 * 想删 user 行的话这个脚本也做不到：数据库的 trg_guard_user_delete
 * 会拒绝任何没有经过删除流程的 DELETE。
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

async function deleteUserContent(userId, userEmail) {
  console.log(`\n🗑️  删除用户内容: ${userEmail}`);
  console.log(`   用户ID: ${userId}`);

  // 查询当前数据
  const { count: docCount } = await supabase
    .from('documents')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);

  const { count: photoCount } = await supabase
    .from('photos')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);

  console.log(`   📄 待删除文档: ${docCount || 0}篇`);
  console.log(`   📷 待删除照片: ${photoCount || 0}张`);

  if ((docCount || 0) === 0 && (photoCount || 0) === 0) {
    console.log(`   ✅ 该用户没有任何内容，跳过删除`);
    return;
  }

  // 删除文档
  if (docCount > 0) {
    const { error: docError } = await supabase
      .from('documents')
      .delete()
      .eq('user_id', userId);

    if (docError) {
      console.error(`   ❌ 删除文档失败:`, docError.message);
    } else {
      console.log(`   ✅ 已删除 ${docCount} 篇文档`);
    }
  }

  // 删除照片
  if (photoCount > 0) {
    const { error: photoError } = await supabase
      .from('photos')
      .delete()
      .eq('user_id', userId);

    if (photoError) {
      console.error(`   ❌ 删除照片失败:`, photoError.message);
    } else {
      console.log(`   ✅ 已删除 ${photoCount} 张照片`);
    }
  }

  console.log(`   ✅ 用户内容删除完成\n`);
}

async function main() {
  console.log('\n🚀 开始删除指定用户的内容...\n');
  console.log('═'.repeat(60));

  // 要删除内容的用户列表
  const usersToClean = [
    {
      id: '00000000-0000-0000-0000-000000000001',
      email: 'admin@example.com'
    },
    {
      id: '7d4d8643-3714-4f4b-9bb2-e62776b62ced',
      email: 'user@example.com'
    }
  ];

  for (const user of usersToClean) {
    await deleteUserContent(user.id, user.email);
  }

  console.log('═'.repeat(60));
  console.log('\n✅ 所有操作完成！\n');

  // 显示最终统计
  const { count: totalDocs } = await supabase
    .from('documents')
    .select('*', { count: 'exact', head: true });

  const { count: totalPhotos } = await supabase
    .from('photos')
    .select('*', { count: 'exact', head: true });

  console.log('📊 数据库当前状态:');
  console.log(`   总文档数: ${totalDocs || 0}篇`);
  console.log(`   总照片数: ${totalPhotos || 0}张\n`);
}

main()
  .catch((error) => {
    console.error('\n❌ 操作失败:', error.message);
    process.exit(1);
  });
