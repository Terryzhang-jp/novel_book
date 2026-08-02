#!/usr/bin/env node

/**
 * Script to import new famous Chichibu locations
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

// New locations to import
const locations = [
  { url: 'https://maps.app.goo.gl/qEW3uhVfhpSjR34f6', preferredName: null },
  { url: 'https://maps.app.goo.gl/iAX31NSgV96E3Fi97', preferredName: null },
  { url: 'https://maps.app.goo.gl/1fhjUiytJDsytzbv8', preferredName: null },
];

// Terry's user ID
const TERRY_USER_ID = '2bb55f27-d5da-4629-a2af-adaa69098f41';

/**
 * Expand short URL to full URL
 */
async function expandUrl(shortUrl) {
  const response = await fetch('http://localhost:3000/api/locations/expand-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: shortUrl }),
  });

  if (!response.ok) {
    throw new Error('Failed to expand URL');
  }

  const result = await response.json();
  return result.expandedUrl;
}

/**
 * Extract place name from expanded Google Maps URL
 */
function extractPlaceNameFromUrl(url) {
  const placePattern = /\/place\/([^/@]+)/;
  const match = url.match(placePattern);

  if (match) {
    let name = decodeURIComponent(match[1]);
    name = name.replace(/\+/g, ' ');
    name = name.trim();
    return name;
  }

  return null;
}

/**
 * Generate a meaningful name from address components
 */
function generateNameFromAddress(address) {
  if (!address) return null;

  const addressParts = address.formattedAddress.split(',').map(s => s.trim());

  if (addressParts.length > 0 && addressParts[0]) {
    return addressParts[0];
  }

  if (address.city) return address.city;
  if (address.state) return address.state;
  if (address.country) return address.country;

  return null;
}

/**
 * Parse URL and extract coordinates + name
 */
async function parseUrl(url) {
  console.log(`\n📍 Processing URL: ${url}`);

  console.log(`   🔗 Expanding URL...`);
  const expandedUrl = await expandUrl(url);
  console.log(`   ✓ Expanded: ${expandedUrl.substring(0, 100)}...`);

  const urlPlaceName = extractPlaceNameFromUrl(expandedUrl);
  if (urlPlaceName) {
    console.log(`   ✓ Extracted place name from URL: ${urlPlaceName}`);
  }

  const response = await fetch('http://localhost:3000/api/locations/parse-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: expandedUrl }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Failed to parse URL: ${error.error}`);
  }

  const result = await response.json();
  console.log(`   ✓ Coordinates: ${result.position.latitude}, ${result.position.longitude}`);

  return {
    coordinates: result.position,
    urlPlaceName,
    parsedName: result.name,
  };
}

/**
 * Get address via reverse geocoding
 */
async function geocode(latitude, longitude) {
  console.log(`   🌍 Fetching address information...`);

  const response = await fetch('http://localhost:3000/api/locations/geocode', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ latitude, longitude }),
  });

  if (!response.ok) {
    console.warn(`   ⚠️  Geocoding failed`);
    return null;
  }

  const result = await response.json();
  console.log(`   ✓ Address: ${result.formattedAddress}`);

  return result;
}

/**
 * Create location in database
 */
async function createLocation(name, coordinates, address) {
  console.log(`   💾 Creating location: "${name}"`);

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
      is_public: false,
      usage_count: 0,
      created_at: now,
      updated_at: now,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create location: ${error.message}`);
  }

  console.log(`   ✅ Location created (ID: ${data.id})`);
  return data;
}

async function importLocations() {
  console.log('🚀 Starting import of new famous Chichibu locations...\n');
  console.log(`📊 Total locations to import: ${locations.length}`);
  console.log(`👤 User: Terry (${TERRY_USER_ID})\n`);
  console.log('═'.repeat(70));

  if (!loadEnv()) {
    console.error('❌ Error: Could not find .env.local file');
    process.exit(1);
  }

  let successCount = 0;
  let failCount = 0;
  const results = [];

  for (let i = 0; i < locations.length; i++) {
    const location = locations[i];
    console.log(`\n[${i + 1}/${locations.length}] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    try {
      const parseResult = await parseUrl(location.url);

      const address = await geocode(
        parseResult.coordinates.latitude,
        parseResult.coordinates.longitude
      );

      let locationName;

      if (location.preferredName) {
        locationName = location.preferredName;
        console.log(`   📝 Using preferred name: ${locationName}`);
      } else if (parseResult.urlPlaceName) {
        locationName = parseResult.urlPlaceName;
        console.log(`   📝 Using URL place name: ${locationName}`);
      } else if (parseResult.parsedName) {
        locationName = parseResult.parsedName;
        console.log(`   📝 Using parsed name: ${locationName}`);
      } else if (address) {
        locationName = generateNameFromAddress(address);
        console.log(`   📝 Generated name from address: ${locationName}`);
      } else {
        locationName = `Location at ${parseResult.coordinates.latitude.toFixed(4)}, ${parseResult.coordinates.longitude.toFixed(4)}`;
        console.log(`   📝 Using coordinate-based name: ${locationName}`);
      }

      const createdLocation = await createLocation(
        locationName,
        {
          latitude: parseResult.coordinates.latitude,
          longitude: parseResult.coordinates.longitude,
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

      await new Promise(resolve => setTimeout(resolve, 800));

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

  console.log('\n' + '═'.repeat(70));
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

importLocations().catch(error => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});
