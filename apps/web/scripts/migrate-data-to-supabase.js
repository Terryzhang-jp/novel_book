/**
 * Data Migration Script
 *
 * Migrates all existing local data to Supabase:
 * 1. Users (auth/users.json)
 * 2. Locations (data/locations/)
 * 3. Photos (data/photos/ + public/images/)
 * 4. Documents (data/documents/)
 *
 * Run with: node scripts/migrate-data-to-supabase.js
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// Read .env.local file
const envPath = path.join(__dirname, '../../../.env.local');
const envFile = fs.readFileSync(envPath, 'utf8');

// Parse environment variables
const env = {};
envFile.split('\n').forEach(line => {
  const match = line.match(/^([^=:#]+)=(.*)$/);
  if (match) {
    const key = match[1].trim();
    const value = match[2].trim();
    env[key] = value;
  }
});

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  log('❌ Missing required environment variables!', 'red');
  process.exit(1);
}

// Create admin client (bypasses RLS for migration)
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// Track migration statistics
const stats = {
  users: { total: 0, success: 0, skipped: 0, failed: 0 },
  locations: { total: 0, success: 0, skipped: 0, failed: 0 },
  photos: { total: 0, success: 0, skipped: 0, failed: 0 },
  documents: { total: 0, success: 0, skipped: 0, failed: 0 },
  images: { total: 0, success: 0, skipped: 0, failed: 0 },
};

log('🚀 Starting Data Migration to Supabase', 'cyan');
log('='.repeat(60), 'cyan');

// Step 1: Migrate Users
async function migrateUsers() {
  log('\n📋 Step 1: Migrating Users', 'blue');

  try {
    const usersPath = path.join(__dirname, '../data/auth/users.json');

    if (!fs.existsSync(usersPath)) {
      log('   ⚠️  No users file found, skipping...', 'yellow');
      return;
    }

    const users = JSON.parse(fs.readFileSync(usersPath, 'utf8'));
    stats.users.total = users.length;

    log(`   Found ${users.length} user(s)`, 'cyan');

    for (const user of users) {
      try {
        // Check if user already exists
        const { data: existingUser } = await supabase
          .from('users')
          .select('id')
          .eq('id', user.id)
          .single();

        if (existingUser) {
          log(`   ⚠️  User ${user.email} already exists, skipping...`, 'yellow');
          stats.users.skipped++;
          continue;
        }

        // Insert user
        const { error } = await supabase.from('users').insert({
          id: user.id,
          email: user.email,
          password_hash: user.passwordHash,
          name: user.name,
          profile: {},
          created_at: user.createdAt,
          updated_at: user.updatedAt,
        });

        if (error) throw error;

        log(`   ✅ Migrated user: ${user.email}`, 'green');
        stats.users.success++;
      } catch (error) {
        log(`   ❌ Failed to migrate user ${user.email}: ${error.message}`, 'red');
        stats.users.failed++;
      }
    }
  } catch (error) {
    log(`   ❌ User migration failed: ${error.message}`, 'red');
  }
}

// Step 2: Migrate Locations
async function migrateLocations() {
  log('\n📍 Step 2: Migrating Locations', 'blue');

  try {
    const locationsDir = path.join(__dirname, '../data/locations');

    if (!fs.existsSync(locationsDir)) {
      log('   ⚠️  No locations directory found, skipping...', 'yellow');
      return;
    }

    const userDirs = fs.readdirSync(locationsDir);

    for (const userId of userDirs) {
      const userLocationDir = path.join(locationsDir, userId);
      const locationFiles = fs.readdirSync(userLocationDir).filter(f => f.endsWith('.json'));

      stats.locations.total += locationFiles.length;
      log(`   Found ${locationFiles.length} location(s) for user ${userId}`, 'cyan');

      for (const file of locationFiles) {
        try {
          const locationPath = path.join(userLocationDir, file);
          const location = JSON.parse(fs.readFileSync(locationPath, 'utf8'));

          // Check if location already exists
          const { data: existingLocation } = await supabase
            .from('locations')
            .select('id')
            .eq('id', location.id)
            .single();

          if (existingLocation) {
            stats.locations.skipped++;
            continue;
          }

          // Insert location
          const { error } = await supabase.from('locations').insert({
            id: location.id,
            user_id: location.userId,
            name: location.name,
            coordinates: location.coordinates,
            address: location.address || null,
            place_id: location.placeId || null,
            category: location.category || null,
            notes: location.notes || null,
            usage_count: location.usageCount || 0,
            last_used_at: location.lastUsedAt || null,
            created_at: location.createdAt,
            updated_at: location.updatedAt,
          });

          if (error) throw error;

          log(`   ✅ Migrated location: ${location.name}`, 'green');
          stats.locations.success++;
        } catch (error) {
          log(`   ❌ Failed to migrate location ${file}: ${error.message}`, 'red');
          stats.locations.failed++;
        }
      }
    }
  } catch (error) {
    log(`   ❌ Location migration failed: ${error.message}`, 'red');
  }
}

// Step 3: Migrate Photos (metadata + files)
async function migratePhotos() {
  log('\n📸 Step 3: Migrating Photos', 'blue');

  try {
    const photosDir = path.join(__dirname, '../data/photos');

    if (!fs.existsSync(photosDir)) {
      log('   ⚠️  No photos directory found, skipping...', 'yellow');
      return;
    }

    const photoFiles = fs.readdirSync(photosDir).filter(f => f.endsWith('.json'));
    stats.photos.total = photoFiles.length;

    log(`   Found ${photoFiles.length} photo(s)`, 'cyan');

    for (const file of photoFiles) {
      try {
        const photoPath = path.join(photosDir, file);
        const photo = JSON.parse(fs.readFileSync(photoPath, 'utf8'));

        // Check if photo already exists
        const { data: existingPhoto } = await supabase
          .from('photos')
          .select('id')
          .eq('id', photo.id)
          .single();

        if (existingPhoto) {
          stats.photos.skipped++;
          continue;
        }

        // Upload image file to storage
        const imagePath = path.join(__dirname, '../public/images', photo.userId, 'gallery', photo.fileName);

        let fileUrl = '';

        if (fs.existsSync(imagePath)) {
          const imageBuffer = fs.readFileSync(imagePath);
          const storagePath = `${photo.userId}/gallery/${photo.fileName}`;

          // Upload to Supabase Storage
          const { error: uploadError } = await supabase.storage
            .from('photos')
            .upload(storagePath, imageBuffer, {
              contentType: photo.metadata?.mimeType || 'image/jpeg',
              upsert: false,
            });

          if (uploadError && !uploadError.message.includes('already exists')) {
            throw uploadError;
          }

          // Get public URL
          const { data: urlData } = supabase.storage
            .from('photos')
            .getPublicUrl(storagePath);

          fileUrl = urlData.publicUrl;
          stats.images.success++;
        } else {
          log(`   ⚠️  Image file not found: ${imagePath}`, 'yellow');
          fileUrl = `/images/${photo.userId}/gallery/${photo.fileName}`; // Fallback to old path
        }

        stats.images.total++;

        // Insert photo metadata
        const { error } = await supabase.from('photos').insert({
          id: photo.id,
          user_id: photo.userId,
          file_name: photo.fileName,
          original_name: photo.originalName,
          file_url: fileUrl,
          metadata: photo.metadata || {},
          location_id: photo.locationId || null,
          category: photo.category,
          title: photo.title || null,
          description: photo.description || null,
          tags: photo.tags || [],
          is_public: true,
          created_at: photo.createdAt,
          updated_at: photo.updatedAt,
        });

        if (error) throw error;

        log(`   ✅ Migrated photo: ${photo.originalName}`, 'green');
        stats.photos.success++;
      } catch (error) {
        log(`   ❌ Failed to migrate photo ${file}: ${error.message}`, 'red');
        stats.photos.failed++;
      }
    }
  } catch (error) {
    log(`   ❌ Photo migration failed: ${error.message}`, 'red');
  }
}

// Step 4: Migrate Documents
async function migrateDocuments() {
  log('\n📄 Step 4: Migrating Documents', 'blue');

  try {
    const documentsDir = path.join(__dirname, '../data/documents');

    if (!fs.existsSync(documentsDir)) {
      log('   ⚠️  No documents directory found, skipping...', 'yellow');
      return;
    }

    const documentFiles = fs.readdirSync(documentsDir).filter(f => f.endsWith('.json'));
    stats.documents.total = documentFiles.length;

    log(`   Found ${documentFiles.length} document(s)`, 'cyan');

    for (const file of documentFiles) {
      try {
        const docPath = path.join(documentsDir, file);
        const doc = JSON.parse(fs.readFileSync(docPath, 'utf8'));

        // Check if document already exists
        const { data: existingDoc } = await supabase
          .from('documents')
          .select('id')
          .eq('id', doc.id)
          .single();

        if (existingDoc) {
          stats.documents.skipped++;
          continue;
        }

        // Insert document
        const { error } = await supabase.from('documents').insert({
          id: doc.id,
          user_id: doc.userId,
          title: doc.title,
          content: doc.content || {},
          images: doc.images || [],
          tags: doc.tags || [],
          preview: doc.preview || null,
          is_public: false,
          created_at: doc.createdAt,
          updated_at: doc.updatedAt,
        });

        if (error) throw error;

        log(`   ✅ Migrated document: ${doc.title}`, 'green');
        stats.documents.success++;
      } catch (error) {
        log(`   ❌ Failed to migrate document ${file}: ${error.message}`, 'red');
        stats.documents.failed++;
      }
    }
  } catch (error) {
    log(`   ❌ Document migration failed: ${error.message}`, 'red');
  }
}

// Step 5: Verify Migration
async function verifyMigration() {
  log('\n✅ Step 5: Verifying Migration', 'blue');

  try {
    const { count: userCount } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true });

    const { count: locationCount } = await supabase
      .from('locations')
      .select('*', { count: 'exact', head: true });

    const { count: photoCount } = await supabase
      .from('photos')
      .select('*', { count: 'exact', head: true });

    const { count: documentCount } = await supabase
      .from('documents')
      .select('*', { count: 'exact', head: true });

    log(`   Users in database: ${userCount}`, 'cyan');
    log(`   Locations in database: ${locationCount}`, 'cyan');
    log(`   Photos in database: ${photoCount}`, 'cyan');
    log(`   Documents in database: ${documentCount}`, 'cyan');
  } catch (error) {
    log(`   ❌ Verification failed: ${error.message}`, 'red');
  }
}

// Print Statistics
function printStats() {
  log('\n' + '='.repeat(60), 'cyan');
  log('📊 Migration Statistics', 'magenta');
  log('='.repeat(60), 'cyan');

  const categories = ['users', 'locations', 'photos', 'documents', 'images'];

  categories.forEach(category => {
    const s = stats[category];
    if (s.total > 0) {
      log(`\n${category.toUpperCase()}:`, 'yellow');
      log(`   Total: ${s.total}`, 'cyan');
      log(`   Success: ${s.success}`, 'green');
      if (s.skipped > 0) log(`   Skipped: ${s.skipped}`, 'yellow');
      if (s.failed > 0) log(`   Failed: ${s.failed}`, 'red');
    }
  });

  log('\n' + '='.repeat(60), 'cyan');

  const totalSuccess = Object.values(stats).reduce((sum, s) => sum + s.success, 0);
  const totalFailed = Object.values(stats).reduce((sum, s) => sum + s.failed, 0);

  if (totalFailed === 0) {
    log('🎉 Migration Completed Successfully!', 'green');
  } else {
    log(`⚠️  Migration completed with ${totalFailed} error(s)`, 'yellow');
  }

  log('='.repeat(60) + '\n', 'cyan');
}

// Main execution
(async () => {
  try {
    await migrateUsers();
    await migrateLocations();
    await migratePhotos();
    await migrateDocuments();
    await verifyMigration();
    printStats();

    log('✅ Next Steps:', 'cyan');
    log('   1. Verify data in Supabase Dashboard', 'yellow');
    log('   2. Update storage layer code to use Supabase', 'yellow');
    log('   3. Test application with new backend', 'yellow');
    log('');

  } catch (error) {
    log('\n❌ Migration Failed', 'red');
    log(`Error: ${error.message}`, 'red');
    process.exit(1);
  }
})();
