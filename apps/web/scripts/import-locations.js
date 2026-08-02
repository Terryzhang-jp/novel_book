#!/usr/bin/env node

/**
 * Script to batch import locations from Google Maps URLs
 *
 * Usage: node scripts/import-locations.js
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

// Google Maps URLs to import
const locations = [
  { url: 'https://maps.app.goo.gl/qxev2eFFQbbX6Umm8', name: '秩父神社' },
  { url: 'https://maps.app.goo.gl/FayPEah8P4ruD6Ut6', name: null },
  { url: 'https://maps.app.goo.gl/CJoMycCmCkcD8yEM6', name: null },
  { url: 'https://maps.app.goo.gl/b3VbFT9Y91voxV1r7', name: null },
  { url: 'https://maps.app.goo.gl/vGdLkoCcq1agKVeNA', name: null },
  { url: 'https://maps.app.goo.gl/y4KYNe7UBojBvNoh6', name: null },
  { url: 'https://maps.app.goo.gl/zRmstv7QuMba1ero9', name: null },
  { url: 'https://maps.app.goo.gl/pPNJnWntQ6xd1caV8', name: null },
  { url: 'https://maps.app.goo.gl/3AALHNJhqmuGDg3f8', name: null },
  { url: 'https://maps.app.goo.gl/pKW5Wm6eYgs4jpT87', name: null },
  { url: 'https://maps.app.goo.gl/kcJsQ7sXeCYraot78', name: null },
];

// Terry's user ID (from previous user creation)
const TERRY_USER_ID = '2bb55f27-d5da-4629-a2af-adaa69098f41';

async function parseUrl(url) {
  console.log(`\n📍 Parsing URL: ${url}`);

  const response = await fetch('http://localhost:3000/api/locations/parse-url', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ url }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Failed to parse URL: ${error.error}`);
  }

  const result = await response.json();
  console.log(`   ✓ Coordinates: ${result.position.latitude}, ${result.position.longitude}`);
  if (result.name) {
    console.log(`   ✓ Place name: ${result.name}`);
  }

  return result;
}

async function geocode(latitude, longitude) {
  console.log(`   🌍 Fetching address information...`);

  const response = await fetch('http://localhost:3000/api/locations/geocode', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ latitude, longitude }),
  });

  if (!response.ok) {
    console.warn(`   ⚠️  Geocoding failed, continuing without address`);
    return null;
  }

  const result = await response.json();
  console.log(`   ✓ Address: ${result.formattedAddress}`);

  return result;
}

async function createLocation(name, coordinates, address) {
  console.log(`   💾 Creating location in database...`);

  const { createClient } = require('@supabase/supabase-js');
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase environment variables');
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const { v4: uuidv4 } = require('uuid');

  const now = new Date().toISOString();
  const locationId = uuidv4();

  const { data, error } = await supabase
    .from('locations')
    .insert({
      id: locationId,
      user_id: TERRY_USER_ID,
      name: name.trim(),
      coordinates,
      address: address ? {
        formattedAddress: address.formattedAddress,
        country: address.country,
        state: address.state,
        city: address.city,
        postalCode: address.postalCode,
      } : null,
      place_id: null,
      category: null,
      notes: null,
      is_public: false, // Private by default
      usage_count: 0,
      created_at: now,
      updated_at: now,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create location: ${error.message}`);
  }

  console.log(`   ✅ Location created: ${data.name} (ID: ${data.id})`);
  return data;
}

async function importLocations() {
  console.log('🚀 Starting batch import of locations...\n');
  console.log(`📊 Total locations to import: ${locations.length}`);
  console.log(`👤 User: Terry (${TERRY_USER_ID})\n`);
  console.log('═'.repeat(60));

  // Load environment
  if (!loadEnv()) {
    console.error('❌ Error: Could not find .env.local file');
    process.exit(1);
  }

  let successCount = 0;
  let failCount = 0;
  const results = [];

  for (let i = 0; i < locations.length; i++) {
    const location = locations[i];
    console.log(`\n[${i + 1}/${locations.length}] Processing location...`);

    try {
      // Step 1: Parse URL to get coordinates and name
      const parseResult = await parseUrl(location.url);

      // Use provided name or extracted name
      const locationName = location.name || parseResult.name || `Location ${i + 1}`;

      // Step 2: Get address information
      const address = await geocode(
        parseResult.position.latitude,
        parseResult.position.longitude
      );

      // Step 3: Create location in database
      const createdLocation = await createLocation(
        locationName,
        {
          latitude: parseResult.position.latitude,
          longitude: parseResult.position.longitude,
        },
        address
      );

      successCount++;
      results.push({
        success: true,
        name: createdLocation.name,
        url: location.url,
      });

      console.log(`   🎉 Success!`);

      // Add a small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));

    } catch (error) {
      console.error(`   ❌ Failed: ${error.message}`);
      failCount++;
      results.push({
        success: false,
        url: location.url,
        error: error.message,
      });
    }
  }

  // Print summary
  console.log('\n' + '═'.repeat(60));
  console.log('\n📊 Import Summary:\n');
  console.log(`✅ Successfully imported: ${successCount}`);
  console.log(`❌ Failed: ${failCount}`);
  console.log(`📈 Total: ${locations.length}`);

  if (successCount > 0) {
    console.log('\n✨ Successfully imported locations:');
    results.filter(r => r.success).forEach((r, i) => {
      console.log(`   ${i + 1}. ${r.name}`);
    });
  }

  if (failCount > 0) {
    console.log('\n⚠️  Failed imports:');
    results.filter(r => !r.success).forEach((r, i) => {
      console.log(`   ${i + 1}. ${r.url}`);
      console.log(`      Error: ${r.error}`);
    });
  }

  console.log('\n🎉 Import complete!\n');
}

// Run the import
importLocations().catch(error => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});
