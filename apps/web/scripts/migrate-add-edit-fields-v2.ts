/**
 * Migration Script: Add photo editing fields to photos table (using Supabase client)
 *
 * Run with: npx tsx apps/web/scripts/migrate-add-edit-fields-v2.ts
 */

import dotenv from 'dotenv';
import { supabaseAdmin } from '../lib/supabase/admin';
import fs from 'fs';
import path from 'path';

// Load environment variables from .env.local
dotenv.config({ path: path.join(__dirname, '../.env.local') });

async function runMigration() {
  console.log('🚀 Starting migration: Add photo editing fields...\n');

  try {
    // Read the migration SQL file
    const migrationPath = path.join(__dirname, '../supabase/migrations/005_add_photo_edit_fields.sql');
    const sql = fs.readFileSync(migrationPath, 'utf-8');

    console.log('📄 Migration SQL:');
    console.log('─'.repeat(50));
    console.log(sql);
    console.log('─'.repeat(50));
    console.log('');

    // Split SQL into individual statements and execute
    console.log('⏳ Executing migration statements...\n');
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--') && !s.startsWith('COMMENT'));

    for (const statement of statements) {
      try {
        console.log(`  Executing: ${statement.substring(0, 60)}...`);

        // Use Supabase's rpc to execute raw SQL
        const { data, error } = await supabaseAdmin.rpc('exec', {
          sql: statement
        });

        if (error) {
          // Check if it's an "already exists" error
          if (error.message.includes('already exists') || error.message.includes('does not exist')) {
            console.log(`  ⚠️  Already exists or not applicable (skipping)\n`);
          } else {
            console.error(`  ❌ Error: ${error.message}\n`);
          }
        } else {
          console.log(`  ✅ Success\n`);
        }
      } catch (error: any) {
        console.error(`  ❌ Exception: ${error.message}\n`);
      }
    }

    console.log('✅ Migration completed!\n');
    console.log('📊 Verifying changes...');

    // Verify the columns were added by trying to select them
    const { data: photos, error: verifyError } = await supabaseAdmin
      .from('photos')
      .select('id, original_file_url, edited, edited_at')
      .limit(1);

    if (verifyError) {
      console.log('⚠️  Could not verify columns:');
      console.log(`   Error: ${verifyError.message}`);
      console.log('\n⚠️  You may need to run the SQL manually in Supabase dashboard:');
      console.log('   1. Go to https://supabase.com/dashboard/project/nncrmixivirswjmkprpf/sql');
      console.log('   2. Run the SQL from: supabase/migrations/005_add_photo_edit_fields.sql\n');
    } else {
      console.log('✅ Columns verified successfully!');
      console.log(`   Found ${photos?.length || 0} photos in database\n`);
    }

    console.log('\n✨ Migration script complete!');
    process.exit(0);

  } catch (error) {
    console.error('❌ Migration failed:');
    console.error(error);
    console.log('\n⚠️  Please run the SQL manually in Supabase dashboard:');
    console.log('   1. Go to https://supabase.com/dashboard/project/nncrmixivirswjmkprpf/sql');
    console.log('   2. Run the SQL from: supabase/migrations/005_add_photo_edit_fields.sql\n');
    process.exit(1);
  }
}

runMigration();
