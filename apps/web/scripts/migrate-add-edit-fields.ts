/**
 * Migration Script: Add photo editing fields to photos table
 *
 * Run with: npx tsx apps/web/scripts/migrate-add-edit-fields.ts
 */

import dotenv from 'dotenv';
import { Client } from 'pg';
import fs from 'fs';
import path from 'path';

// Load environment variables from .env.local
dotenv.config({ path: path.join(__dirname, '../.env.local') });

async function runMigration() {
  console.log('🚀 Starting migration: Add photo editing fields...\n');

  // Extract project ref from Supabase URL
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const dbPassword = process.env.SUPABASE_DB_PASSWORD;

  if (!supabaseUrl || !dbPassword) {
    console.error('❌ Missing required environment variables');
    console.error('   NEXT_PUBLIC_SUPABASE_URL:', !!supabaseUrl);
    console.error('   SUPABASE_DB_PASSWORD:', !!dbPassword);
    process.exit(1);
  }

  // Extract project ref from URL (e.g., https://abc123.supabase.co -> abc123)
  const projectRef = supabaseUrl.replace('https://', '').replace('.supabase.co', '');

  // URL encode the password (in case it contains special characters)
  const encodedPassword = encodeURIComponent(dbPassword);

  // Construct PostgreSQL connection string (using pooler in session mode)
  // Format: postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres
  const connectionString = `postgresql://postgres.${projectRef}:${encodedPassword}@aws-0-us-east-1.pooler.supabase.com:5432/postgres`;

  console.log(`📡 Connecting to database via pooler: aws-0-us-east-1.pooler.supabase.com\n`);

  const client = new Client({
    connectionString,
    ssl: {
      rejectUnauthorized: false
    }
  });

  try {
    // Connect to database
    await client.connect();
    console.log('✅ Connected to database\n');

    // Read the migration SQL file
    const migrationPath = path.join(__dirname, '../supabase/migrations/005_add_photo_edit_fields.sql');
    const sql = fs.readFileSync(migrationPath, 'utf-8');

    console.log('📄 Migration SQL:');
    console.log('─'.repeat(50));
    console.log(sql);
    console.log('─'.repeat(50));
    console.log('');

    // Split SQL into individual statements and execute
    console.log('⏳ Executing migration...\n');
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    for (const statement of statements) {
      try {
        console.log(`  Executing: ${statement.substring(0, 60)}...`);
        await client.query(statement);
        console.log(`  ✅ Success\n`);
      } catch (error: any) {
        // Ignore "already exists" errors
        if (error.message.includes('already exists')) {
          console.log(`  ⚠️  Already exists (skipping)\n`);
        } else {
          console.error(`  ❌ Failed: ${error.message}\n`);
        }
      }
    }

    console.log('✅ Migration completed successfully!\n');
    console.log('📊 Verifying changes...');

    // Verify the columns were added
    const result = await client.query(`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_name = 'photos'
      AND column_name IN ('original_file_url', 'edited', 'edited_at')
      ORDER BY column_name;
    `);

    console.log('✅ Columns verified:');
    for (const row of result.rows) {
      console.log(`   - ${row.column_name}: ${row.data_type}${row.column_default ? ` (default: ${row.column_default})` : ''}`);
    }

    console.log('\n✨ Migration complete! The photos table now supports photo editing.');

  } catch (error) {
    console.error('❌ Migration failed:');
    console.error(error);
    process.exit(1);
  } finally {
    await client.end();
    process.exit(0);
  }
}

runMigration();
