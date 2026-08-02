/**
 * Automated Supabase Setup Script
 *
 * This script will:
 * 1. Execute the SQL migration to create database tables
 * 2. Create the 'photos' storage bucket
 * 3. Set up storage policies
 *
 * Run with: node scripts/setup-supabase-database.js
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
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// Read .env.local file (from project root)
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
const dbPassword = env.SUPABASE_DB_PASSWORD;

// Validate environment variables
if (!supabaseUrl || !supabaseServiceKey || !dbPassword) {
  log('❌ Missing required environment variables!', 'red');
  log('Required: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_DB_PASSWORD', 'yellow');
  process.exit(1);
}

// Extract project reference from URL
const projectRef = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];
if (!projectRef) {
  log('❌ Could not extract project reference from URL', 'red');
  process.exit(1);
}

log('🚀 Starting Supabase Setup', 'cyan');
log('='.repeat(60), 'cyan');

// Create admin client for storage operations
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// Step 1: Execute SQL Migration
async function executeSQLMigration() {
  log('\n📋 Step 1: Executing SQL Migration', 'blue');

  const sqlPath = path.join(__dirname, '../supabase/migrations/001_initial_schema.sql');
  const sqlContent = fs.readFileSync(sqlPath, 'utf8');

  try {
    // Use Supabase SQL query endpoint via REST API
    const { Pool } = require('pg');

    // URL encode password to handle special characters
    const encodedPassword = encodeURIComponent(dbPassword);

    // Direct database connection uses 'postgres' username (not postgres.projectRef)
    const connectionString = `postgresql://postgres:${encodedPassword}@db.${projectRef}.supabase.co:5432/postgres`;

    const pool = new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false }
    });

    log('   Connecting to database...', 'yellow');
    const client = await pool.connect();

    log('   Executing migration SQL...', 'yellow');
    await client.query(sqlContent);

    client.release();
    await pool.end();

    log('   ✅ Database tables created successfully!', 'green');
    return true;
  } catch (error) {
    if (error.message.includes('already exists')) {
      log('   ⚠️  Tables already exist, skipping...', 'yellow');
      return true;
    }
    log(`   ❌ SQL Migration failed: ${error.message}`, 'red');
    return false;
  }
}

// Step 2: Create Storage Bucket
async function createStorageBucket() {
  log('\n📦 Step 2: Creating Storage Bucket', 'blue');

  try {
    // Check if bucket already exists
    const { data: buckets, error: listError } = await supabaseAdmin.storage.listBuckets();

    if (listError) {
      throw listError;
    }

    const photoBucket = buckets.find(b => b.name === 'photos');

    if (photoBucket) {
      log('   ⚠️  Bucket "photos" already exists, skipping...', 'yellow');
      return true;
    }

    // Create bucket
    const { data, error } = await supabaseAdmin.storage.createBucket('photos', {
      public: true,
      fileSizeLimit: 10485760, // 10 MB
      allowedMimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
    });

    if (error) {
      throw error;
    }

    log('   ✅ Storage bucket "photos" created successfully!', 'green');
    return true;
  } catch (error) {
    log(`   ❌ Storage bucket creation failed: ${error.message}`, 'red');
    return false;
  }
}

// Step 3: Set Up Storage Policies
async function setupStoragePolicies() {
  log('\n🔒 Step 3: Setting Up Storage Policies', 'blue');

  // Note: Storage policies need to be set via SQL
  // We'll use the same PostgreSQL connection

  const policies = [
    {
      name: 'Users can upload own photos',
      sql: `
        CREATE POLICY "Users can upload own photos"
        ON storage.objects FOR INSERT
        WITH CHECK (
          bucket_id = 'photos' AND
          auth.uid()::text = (storage.foldername(name))[1]
        );
      `
    },
    {
      name: 'Public photos are viewable',
      sql: `
        CREATE POLICY "Public photos are viewable"
        ON storage.objects FOR SELECT
        USING (bucket_id = 'photos');
      `
    },
    {
      name: 'Users can delete own photos',
      sql: `
        CREATE POLICY "Users can delete own photos"
        ON storage.objects FOR DELETE
        USING (
          bucket_id = 'photos' AND
          auth.uid()::text = (storage.foldername(name))[1]
        );
      `
    }
  ];

  try {
    const { Pool } = require('pg');

    // URL encode password to handle special characters
    const encodedPassword = encodeURIComponent(dbPassword);

    // Use direct database connection with 'postgres' username
    const connectionString = `postgresql://postgres:${encodedPassword}@db.${projectRef}.supabase.co:5432/postgres`;

    const pool = new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false }
    });

    const client = await pool.connect();

    for (const policy of policies) {
      try {
        log(`   Creating policy: "${policy.name}"...`, 'yellow');
        await client.query(policy.sql);
        log(`   ✅ Policy "${policy.name}" created`, 'green');
      } catch (error) {
        if (error.message.includes('already exists')) {
          log(`   ⚠️  Policy "${policy.name}" already exists, skipping...`, 'yellow');
        } else {
          throw error;
        }
      }
    }

    client.release();
    await pool.end();

    return true;
  } catch (error) {
    log(`   ❌ Storage policies setup failed: ${error.message}`, 'red');
    return false;
  }
}

// Step 4: Verify Setup
async function verifySetup() {
  log('\n✅ Step 4: Verifying Setup', 'blue');

  try {
    // Test database connection
    const { data: usersTest, error: dbError } = await supabaseAdmin
      .from('users')
      .select('count');

    if (dbError) {
      throw new Error(`Database verification failed: ${dbError.message}`);
    }

    log('   ✅ Database tables accessible', 'green');

    // Test storage
    const { data: buckets, error: storageError } = await supabaseAdmin.storage.listBuckets();

    if (storageError) {
      throw new Error(`Storage verification failed: ${storageError.message}`);
    }

    const hasPhotoBucket = buckets.some(b => b.name === 'photos');
    if (!hasPhotoBucket) {
      throw new Error('Photos bucket not found');
    }

    log('   ✅ Storage bucket "photos" accessible', 'green');

    return true;
  } catch (error) {
    log(`   ❌ Verification failed: ${error.message}`, 'red');
    return false;
  }
}

// Main execution
(async () => {
  try {
    const step1 = await executeSQLMigration();
    const step2 = await createStorageBucket();
    const step3 = await setupStoragePolicies();
    const step4 = await verifySetup();

    log('\n' + '='.repeat(60), 'cyan');

    if (step1 && step2 && step3 && step4) {
      log('🎉 Supabase Setup Complete!', 'green');
      log('\n📋 Summary:', 'cyan');
      log('   ✅ Database tables created', 'green');
      log('   ✅ Storage bucket "photos" created', 'green');
      log('   ✅ Storage policies configured', 'green');
      log('   ✅ All systems verified', 'green');

      log('\n🚀 Next Steps:', 'cyan');
      log('   1. Run: node scripts/test-supabase-connection.js', 'yellow');
      log('   2. Start migrating existing data to Supabase', 'yellow');
      log('   3. Update storage layer to use Supabase', 'yellow');

    } else {
      log('⚠️  Setup completed with some errors', 'yellow');
      log('   Please check the output above for details', 'yellow');
    }

    log('='.repeat(60), 'cyan');

  } catch (error) {
    log('\n' + '='.repeat(60), 'red');
    log('❌ Setup Failed', 'red');
    log(`Error: ${error.message}`, 'red');
    log('='.repeat(60), 'red');
    process.exit(1);
  }
})();
