# Database Migration Instructions

## Running the Location Sharing Migration

Since the Supabase CLI is not installed and direct psql connection has authentication issues, please follow these steps to run the migration manually:

### Option 1: Using Supabase Dashboard (Recommended)

1. Go to your Supabase project dashboard:
   - URL: https://app.supabase.com/project/nncrmixivirswjmkprpf

2. Navigate to **SQL Editor** in the left sidebar

3. Copy the entire contents of the migration file:
   - File: `apps/web/supabase/migrations/002_add_location_sharing.sql`

4. Paste the SQL into the SQL editor

5. Click **Run** to execute the migration

### Option 2: Install Supabase CLI

```bash
# Install Supabase CLI
npm install -g supabase

# Link your project (you'll need your project password)
cd apps/web
supabase link --project-ref nncrmixivirswjmkprpf

# Run the migration
supabase db push
```

## What This Migration Does

The migration adds support for sharing locations between users:

1. **Adds `is_public` column** - A boolean field to mark locations as public (default: false)
2. **Creates index** - Improves query performance for filtering public/private locations
3. **Updates RLS policies** - Allows all users to view public locations while maintaining privacy for private locations

## Verification

After running the migration, you can verify it worked by:

1. Check the table structure:
   ```sql
   SELECT column_name, data_type, column_default
   FROM information_schema.columns
   WHERE table_name = 'locations'
   ORDER BY ordinal_position;
   ```

2. Check the policies:
   ```sql
   SELECT * FROM pg_policies WHERE tablename = 'locations';
   ```

3. Test creating a public location through the app:
   - Go to `/gallery/locations`
   - Click "Add Location"
   - Check the "Make this location public" checkbox
   - Create the location
   - It should now be visible to all users

## Rollback (if needed)

If you need to rollback this migration:

```sql
-- Remove policies
DROP POLICY IF EXISTS "Public locations are viewable by everyone" ON locations;

-- Remove index
DROP INDEX IF EXISTS idx_locations_is_public;

-- Remove column
ALTER TABLE locations DROP COLUMN IF EXISTS is_public;
```
