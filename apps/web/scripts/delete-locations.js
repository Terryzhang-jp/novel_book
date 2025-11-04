#!/usr/bin/env node

/**
 * Script to delete locations created by the import script
 */

const fs = require('fs');
const path = require('path');

// Load environment variables
function loadEnv() {
  const possibleEnvPaths = [
    path.join(__dirname, '../.env.local'),
    path.join(__dirname, '../../../.env.local'),
  ];

  for (const envPath of possibleEnvPaths) {
    if (fs.existsSync(envPath)) {
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

const TERRY_USER_ID = '2bb55f27-d5da-4629-a2af-adaa69098f41';

async function deleteLocations() {
  console.log('🗑️  Deleting imported locations...\n');

  if (!loadEnv()) {
    console.error('❌ Error: Could not find .env.local file');
    process.exit(1);
  }

  const { createClient } = require('@supabase/supabase-js');
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ Error: Missing Supabase environment variables');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Get all locations for Terry
  const { data: locations, error: fetchError } = await supabase
    .from('locations')
    .select('*')
    .eq('user_id', TERRY_USER_ID);

  if (fetchError) {
    console.error('❌ Error fetching locations:', fetchError);
    process.exit(1);
  }

  console.log(`📊 Found ${locations.length} locations for Terry\n`);

  if (locations.length === 0) {
    console.log('✅ No locations to delete');
    return;
  }

  // Show locations
  locations.forEach((loc, i) => {
    console.log(`${i + 1}. ${loc.name} (${loc.id})`);
  });

  // Delete all
  console.log(`\n🗑️  Deleting ${locations.length} locations...`);

  const { error: deleteError } = await supabase
    .from('locations')
    .delete()
    .eq('user_id', TERRY_USER_ID);

  if (deleteError) {
    console.error('❌ Error deleting locations:', deleteError);
    process.exit(1);
  }

  console.log(`✅ Successfully deleted ${locations.length} locations\n`);
}

deleteLocations().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
