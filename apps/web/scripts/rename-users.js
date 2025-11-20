#!/usr/bin/env node

/**
 * 重命名用户 - 使用邮箱@前面的部分作为用户名
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

async function renameUser(userId, email, oldName) {
  // 从邮箱提取用户名（@前面的部分）
  const newName = email.split('@')[0];

  console.log(`\n📝 更新用户: ${email}`);
  console.log(`   旧名称: ${oldName}`);
  console.log(`   新名称: ${newName}`);

  const { error } = await supabase
    .from('users')
    .update({
      name: newName,
      updated_at: new Date().toISOString()
    })
    .eq('id', userId);

  if (error) {
    console.error(`   ❌ 更新失败:`, error.message);
    return false;
  } else {
    console.log(`   ✅ 更新成功`);
    return true;
  }
}

async function main() {
  console.log('\n🚀 开始重命名用户...\n');
  console.log('═'.repeat(70));

  // 要重命名的用户列表
  const usersToRename = [
    {
      id: 'b7828b9e-84e4-49b5-868a-9654487a9af2',
      email: 'liboxian1016@gmail.com',
      oldName: 'Terry Wang'
    },
    {
      id: 'f25b855e-31fa-4f22-872f-a78d8266a19a',
      email: 'linereus39@mail.com',
      oldName: 'User 2'
    },
    {
      id: '4eb13361-b961-4d0e-9368-61dfac36e993',
      email: 'antinoise1222@gmail.com',
      oldName: 'User 3'
    },
    {
      id: '7ee2c0fb-43e2-453c-b1b0-4f874bf9dbe7',
      email: 'zoeweiyi61@gmail.com',
      oldName: 'User 4'
    },
    {
      id: 'bef7cc01-c059-4696-a56b-0c7a4716d016',
      email: 'fuukagei@gmail.com',
      oldName: 'User 5'
    }
  ];

  let successCount = 0;
  for (const user of usersToRename) {
    const success = await renameUser(user.id, user.email, user.oldName);
    if (success) successCount++;
  }

  console.log('\n' + '═'.repeat(70));
  console.log(`\n✅ 重命名完成！成功更新 ${successCount}/${usersToRename.length} 个用户\n`);

  // 显示更新后的用户列表
  console.log('📋 更新后的用户列表:\n');

  const { data: users } = await supabase
    .from('users')
    .select('email, name')
    .in('id', usersToRename.map(u => u.id))
    .order('email');

  users.forEach(user => {
    console.log(`   ${user.name.padEnd(20)} <- ${user.email}`);
  });

  console.log('');
}

main()
  .catch((error) => {
    console.error('\n❌ 操作失败:', error.message);
    process.exit(1);
  });
