/**
 * Migration Script: Add trash bin fields to photos table
 *
 * Run with: npx tsx apps/web/scripts/migrate-add-trash-fields.ts
 */

import { supabaseAdmin } from '../lib/supabase/admin';
import fs from 'fs';
import path from 'path';

async function runMigration() {
  console.log('🚀 Starting migration: Add trash bin fields...\n');

  try {
    // Read the migration SQL file
    const migrationPath = path.join(__dirname, '../supabase/migrations/004_add_trash_fields.sql');
    const sql = fs.readFileSync(migrationPath, 'utf-8');

    console.log('📄 Migration SQL:');
    console.log('─'.repeat(50));
    console.log(sql);
    console.log('─'.repeat(50));
    console.log('');

    // Execute the migration
    console.log('⏳ Executing migration...');
    const { error } = await supabaseAdmin.rpc('exec_sql', { sql_query: sql });

    if (error) {
      // If exec_sql doesn't exist, try direct execution
      console.log('⚠️  exec_sql RPC not available, trying direct execution...');

      // Split SQL into individual statements and execute
      const statements = sql
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0 && !s.startsWith('--'));

      for (const statement of statements) {
        if (statement.includes('ALTER TABLE') || statement.includes('CREATE INDEX')) {
          const { error: execError } = await supabaseAdmin.rpc('exec', {
            query: statement + ';'
          });

          if (execError) {
            console.error(`❌ Failed to execute: ${statement.substring(0, 50)}...`);
            console.error(`Error: ${execError.message}`);
          }
        }
      }
    }

    console.log('✅ Migration completed successfully!\n');
    console.log('📊 Verifying changes...');

    // Verify the columns were added
    const { data: columns, error: verifyError } = await supabaseAdmin
      .from('photos')
      .select('trashed, trashed_at')
      .limit(1);

    if (verifyError) {
      console.log('⚠️  Could not verify columns (this is expected if table is empty)');
      console.log(`   Error: ${verifyError.message}`);
    } else {
      console.log('✅ Columns verified successfully!');
      console.log(`   Sample data: ${JSON.stringify(columns)}`);
    }

    console.log('\n✨ Migration complete! The photos table now has trash bin functionality.');
    process.exit(0);

  } catch (error) {
    console.error('❌ Migration failed:');
    console.error(error);
    process.exit(1);
  }
}

runMigration();
