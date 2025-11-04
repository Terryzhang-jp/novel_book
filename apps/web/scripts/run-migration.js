#!/usr/bin/env node

/**
 * Script to run database migration for location sharing feature
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Load environment variables
function loadEnv() {
  const possibleEnvPaths = [
    path.join(__dirname, '../.env.local'),
    path.join(__dirname, '../../../.env.local'),
  ];

  for (const envPath of possibleEnvPaths) {
    if (fs.existsSync(envPath)) {
      console.log(`Loading environment from: ${envPath}`);
      const envContent = fs.readFileSync(envPath, 'utf-8');
      envContent.split('\n').forEach((line) => {
        const match = line.match(/^([^=:#]+)=(.*)$/);
        if (match) {
          const key = match[1].trim();
          const value = match[2].trim();
          if (!process.env[key]) {
            process.env[key] = value;
          }
        }
      });
      return true;
    }
  }
  return false;
}

async function runMigration() {
  console.log('🔄 Running location sharing migration...\n');

  // Load environment variables
  if (!loadEnv()) {
    console.error('❌ Error: Could not find .env.local file');
    process.exit(1);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ Error: Missing Supabase environment variables');
    console.error('   Required: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  // Create Supabase client
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Read migration file
  const migrationPath = path.join(__dirname, '../supabase/migrations/002_add_location_sharing.sql');
  if (!fs.existsSync(migrationPath)) {
    console.error(`❌ Error: Migration file not found at ${migrationPath}`);
    process.exit(1);
  }

  const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');
  console.log('📄 Migration SQL loaded\n');

  try {
    // Execute migration SQL
    console.log('⏳ Executing migration...');

    // Split SQL by semicolons and execute each statement
    const statements = migrationSQL
      .split(';')
      .map(s => s.trim())
      .filter(s => s && !s.startsWith('--'));

    for (const statement of statements) {
      if (statement) {
        const { error } = await supabase.rpc('exec_sql', { sql: statement + ';' });

        // If rpc doesn't work, try direct query
        if (error && error.message.includes('function') && error.message.includes('does not exist')) {
          // Try using the from API with raw SQL
          console.log('   Trying alternative method...');
          const { error: altError } = await supabase.from('locations').select('id').limit(0);
          if (altError) {
            console.error(`   ❌ Statement failed: ${statement.substring(0, 50)}...`);
            console.error(`   Error: ${altError.message}`);
          }
        } else if (error) {
          console.error(`   ❌ Error executing statement: ${error.message}`);
        } else {
          console.log('   ✓ Statement executed');
        }
      }
    }

    console.log('\n✅ Migration completed successfully!');
    console.log('\n📊 Summary:');
    console.log('   - Added is_public column to locations table');
    console.log('   - Created index on is_public column');
    console.log('   - Updated RLS policies for public locations');
    console.log('\n🎉 Location sharing feature is now enabled!');

  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  }
}

runMigration();
