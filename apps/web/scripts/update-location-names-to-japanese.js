#!/usr/bin/env node

/**
 * Script to update location names to Japanese
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

// Name mapping from English to Japanese
const nameMapping = {
  'Chichibu Station': '秩父駅',
  'Chichibu Shrine': '秩父神社',
  'Seibu-Chichibu Station': '西武秩父駅',
  'Seibuchichibu Ekimae Onsen Matsurinoyu Hot Spring': '西武秩父駅前温泉 祭の湯',
  'Meisenkan': '銘仙館',
  'Hitsujiyama Park': '羊山公園',
  'Jiganji (Chichibu Sanjūyon Kannon Reishō #13)': '慈眼寺（秩父三十四観音第13番）',
  'Chichibu Festival Museum': '秩父まつり会館',
};

async function updateLocationNames() {
  console.log('🔄 Updating location names to Japanese...\n');

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

  let updatedCount = 0;
  let skippedCount = 0;

  for (const location of locations) {
    const currentName = location.name;

    // Check if we have a Japanese mapping
    if (nameMapping[currentName]) {
      const japaneseName = nameMapping[currentName];

      console.log(`🔄 Updating: "${currentName}" → "${japaneseName}"`);

      const { error: updateError } = await supabase
        .from('locations')
        .update({
          name: japaneseName,
          updated_at: new Date().toISOString(),
        })
        .eq('id', location.id);

      if (updateError) {
        console.error(`   ❌ Failed to update: ${updateError.message}`);
      } else {
        console.log(`   ✅ Updated successfully`);
        updatedCount++;
      }
    } else {
      // Already in Japanese or not in mapping
      console.log(`⏭️  Skipped: "${currentName}" (already in Japanese or not in mapping)`);
      skippedCount++;
    }
  }

  console.log('\n' + '═'.repeat(60));
  console.log('\n📊 Update Summary:\n');
  console.log(`✅ Updated: ${updatedCount}`);
  console.log(`⏭️  Skipped: ${skippedCount}`);
  console.log(`📈 Total: ${locations.length}\n`);
}

updateLocationNames().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
