#!/usr/bin/env node

/**
 * Script to set all locations to public
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

async function setAllLocationsPublic() {
  console.log('🔄 Setting all locations to public...\n');

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

  console.log(`📊 Found ${locations.length} total locations for Terry\n`);

  // Count how many are already public
  const alreadyPublic = locations.filter(l => l.is_public).length;
  const needsUpdate = locations.filter(l => !l.is_public).length;

  console.log(`✅ Already public: ${alreadyPublic}`);
  console.log(`🔄 Need to update: ${needsUpdate}\n`);

  if (needsUpdate === 0) {
    console.log('🎉 All locations are already public!\n');
    return;
  }

  console.log('═'.repeat(60));
  console.log('\n🔄 Updating locations...\n');

  let updatedCount = 0;

  for (const location of locations) {
    if (location.is_public) {
      continue; // Skip already public locations
    }

    console.log(`🔄 "${location.name}"`);

    const { error: updateError } = await supabase
      .from('locations')
      .update({
        is_public: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', location.id);

    if (updateError) {
      console.error(`   ❌ Failed to update: ${updateError.message}`);
    } else {
      console.log(`   ✅ Set to public`);
      updatedCount++;
    }
  }

  console.log('\n' + '═'.repeat(60));
  console.log('\n📊 Update Summary:\n');
  console.log(`✅ Updated: ${updatedCount}`);
  console.log(`⏭️  Already public: ${alreadyPublic}`);
  console.log(`📈 Total public locations: ${alreadyPublic + updatedCount}\n`);

  if (updatedCount > 0) {
    console.log('✨ All locations are now public and can be shared with all users!\n');
  }
}

setAllLocationsPublic().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
