/**
 * 用户数据迁移脚本
 *
 * 将现有 users 表数据迁移到 Better Auth 的 user + account 表
 *
 * 运行方式:
 * 1. 确保已在 Supabase 执行 001_better_auth_tables.sql
 * 2. 设置环境变量 DATABASE_URL
 * 3. 运行: npx tsx scripts/migrate-users-to-better-auth.ts
 */

import { config } from "dotenv";
import { resolve } from "path";

// 加载 .env.local
config({ path: resolve(process.cwd(), ".env.local") });

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

// 从环境变量获取配置
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing required environment variables:");
  console.error("- NEXT_PUBLIC_SUPABASE_URL");
  console.error("- SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface OldUser {
  id: string;
  email: string;
  password_hash: string;
  name: string | null;
  require_password_change: boolean;
  security_question: string | null;
  security_answer_hash: string | null;
  created_at: string;
  updated_at: string;
}

async function migrateUsers() {
  console.log("Starting user migration to Better Auth...\n");

  // 1. 检查 Better Auth 表是否存在
  const { error: tableCheckError } = await supabase
    .from("user")
    .select("id")
    .limit(1);

  if (tableCheckError && tableCheckError.code === "42P01") {
    console.error("Error: Better Auth tables do not exist.");
    console.error("Please run the SQL migration first:");
    console.error("  scripts/migrations/001_better_auth_tables.sql");
    process.exit(1);
  }

  // 2. 获取所有现有用户
  const { data: oldUsers, error: fetchError } = await supabase
    .from("users")
    .select("*");

  if (fetchError) {
    console.error("Error fetching users:", fetchError.message);
    process.exit(1);
  }

  if (!oldUsers || oldUsers.length === 0) {
    console.log("No users to migrate.");
    return;
  }

  console.log(`Found ${oldUsers.length} users to migrate.\n`);

  let successCount = 0;
  let skipCount = 0;
  let errorCount = 0;

  for (const oldUser of oldUsers as OldUser[]) {
    console.log(`Migrating user: ${oldUser.email}...`);

    try {
      // 检查用户是否已存在于新表
      const { data: existingUser } = await supabase
        .from("user")
        .select("id")
        .eq("id", oldUser.id)
        .single();

      if (existingUser) {
        console.log(`  - Skipped (already exists)`);
        skipCount++;
        continue;
      }

      // 3. 插入到 user 表
      const { error: userInsertError } = await supabase.from("user").insert({
        id: oldUser.id,
        name: oldUser.name,
        email: oldUser.email,
        email_verified: true, // 假设已验证
        image: null,
        created_at: oldUser.created_at,
        updated_at: oldUser.updated_at,
        // 自定义字段
        require_password_change: oldUser.require_password_change || false,
        security_question: oldUser.security_question,
        security_answer_hash: oldUser.security_answer_hash,
      });

      if (userInsertError) {
        throw new Error(`User insert failed: ${userInsertError.message}`);
      }

      // 4. 插入到 account 表 (存储密码)
      const { error: accountInsertError } = await supabase
        .from("account")
        .insert({
          id: randomUUID(),
          user_id: oldUser.id,
          account_id: oldUser.email,
          provider_id: "credential",
          password: oldUser.password_hash, // bcrypt hash 直接迁移
          created_at: oldUser.created_at,
          updated_at: oldUser.updated_at,
        });

      if (accountInsertError) {
        // 回滚: 删除刚插入的 user
        await supabase.from("user").delete().eq("id", oldUser.id);
        throw new Error(`Account insert failed: ${accountInsertError.message}`);
      }

      console.log(`  - Success`);
      successCount++;
    } catch (error) {
      console.error(`  - Error: ${(error as Error).message}`);
      errorCount++;
    }
  }

  // 5. 输出统计
  console.log("\n========================================");
  console.log("Migration Complete!");
  console.log("========================================");
  console.log(`Total users:     ${oldUsers.length}`);
  console.log(`Migrated:        ${successCount}`);
  console.log(`Skipped:         ${skipCount}`);
  console.log(`Errors:          ${errorCount}`);
  console.log("========================================\n");

  if (errorCount > 0) {
    console.log("Some users failed to migrate. Please check the errors above.");
    process.exit(1);
  }
}

// 运行迁移
migrateUsers().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
