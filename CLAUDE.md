# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **multi-user document editing application** built on top of the Novel editor (Notion-style WYSIWYG). The project has been extended from a single-user demo to a complete multi-user system with local file storage, JWT authentication, and user isolation.

**Key Characteristics:**
- Turborepo monorepo with `apps/web` (Next.js 15 app) and `packages/headless` (Novel editor package)
- Local file system storage for development (designed for easy database migration)
- JWT-based authentication with HTTP-only cookies
- Per-user data isolation for documents and images

## Development Commands

### Setup
```bash
# Install dependencies
pnpm install

# Setup environment variables
cd apps/web
cp .env.example .env.local
# Edit .env.local and set JWT_SECRET (minimum 32 characters required)
```

### Development
```bash
# Start dev server (runs both apps and packages)
pnpm dev

# Build all packages
pnpm build

# Type checking
pnpm typecheck

# Linting
pnpm lint
pnpm lint:fix

# Formatting
pnpm format
pnpm format:fix

# Clean build artifacts
pnpm clean
```

### Web App Specific (in apps/web)
```bash
cd apps/web

# Dev server only for web app
pnpm dev

# Build web app
pnpm build

# Type check
pnpm typecheck
```

## Architecture

### Monorepo Structure
```
novel/
├── apps/web/                 # Next.js 15 application
│   ├── app/                  # App router pages
│   │   ├── api/             # API routes
│   │   ├── documents/       # Document pages
│   │   ├── login/           # Login page
│   │   └── register/        # Registration page
│   ├── lib/                 # Core business logic
│   │   ├── auth/            # JWT & session management
│   │   └── storage/         # File-based storage layer
│   ├── components/          # React components
│   │   ├── document-editor.tsx  # Novel editor wrapper
│   │   └── tailwind/        # Novel editor UI components
│   ├── types/               # TypeScript types
│   ├── styles/              # Global CSS
│   ├── data/                # Local storage (gitignored)
│   └── public/images/       # User uploads (gitignored)
└── packages/
    └── headless/            # Novel editor core (Tiptap-based)
```

### Multi-User Storage Architecture

**Critical Design:** All data operations go through storage abstraction classes in `apps/web/lib/storage/`. This enables future database migration without changing API routes.

**Storage Layer Components:**
1. **file-system.ts** - Atomic write operations, path security
2. **user-storage.ts** - User CRUD with bcrypt password hashing
3. **document-storage.ts** - Document CRUD with automatic indexing
4. **index-manager.ts** - Fast document queries via index files
5. **init.ts** - Directory structure initialization

**Data Flow:**
```
API Route → requireAuth() → Storage Class → File System
                ↓
           JWT Verification
                ↓
        Extract userId from token
                ↓
    Enforce user data isolation
```

**File Structure:**
```
data/
├── auth/users.json              # All users
├── documents/{userId}/{docId}.json   # User's documents
└── indexes/{userId}.json        # User's document index

public/images/{userId}/           # User's uploaded images
```

### Authentication Flow

1. **Registration/Login** → API generates JWT → Set HTTP-only cookie (`auth-token`)
2. **Middleware** (`middleware.ts`) → Verify JWT → Redirect if invalid
3. **API Routes** → `requireAuth()` → Extract userId → Enforce permissions
4. **Frontend** → Cookie automatically sent → No token management needed

**Key Security Features:**
- Passwords hashed with bcrypt (10 rounds)
- JWT tokens with 7-day expiration
- HTTP-only cookies prevent XSS
- Path traversal protection in file operations
- Per-user data isolation enforced at storage layer

### Novel Editor Integration

**Original Novel Editor:**
- Used localStorage for single-user demo
- No backend persistence

**Modified Integration:**
1. Created `DocumentEditor` component wrapping Novel's `TailwindAdvancedEditor`
2. Removed localStorage logic
3. Added API-based save with 500ms debounce
4. Image upload uses `/api/upload-local` with user authentication
5. Content saved in Tiptap JSON format only

**Editor Component Props:**
```typescript
<DocumentEditor
  documentId={string}
  initialContent={JSONContent}
  onSave={async (content) => {...}}
/>
```

## Important Implementation Details

### Atomic File Writes
All JSON writes use atomic operations (write to `.tmp` → validate → rename). Never use direct `fs.writeFile()` for user data.

### Document Indexing
Documents have two storage locations:
1. Full document: `data/documents/{userId}/{docId}.json`
2. Index entry: `data/indexes/{userId}.json`

Index updates happen automatically in `document-storage.ts`. Always use storage methods, never manipulate files directly.

### Image Handling
Images are extracted from Tiptap content during save. The `extractImages()` method recursively traverses JSON to find image nodes and extract filenames. Images are stored per-user: `/images/{userId}/{timestamp}-{random}.{ext}`

### Middleware Behavior
`middleware.ts` protects routes with these rules:
- Public: `/login`, `/register`, `/api/*`
- Protected: Everything else
- Logged-in users accessing public routes → redirect to `/documents`
- Non-logged-in users accessing protected routes → redirect to `/login`

### Tiptap/Novel Editor Styles

**Critical CSS Files:**
- `styles/globals.css` - Tailwind theme variables (--background, --foreground, etc.)
- `styles/prosemirror.css` - Editor-specific styles including Tippy.js overrides

**Tippy.js (Bubble Menu) Issue:**
The editor toolbar uses Tippy.js. To remove borders from the floating toolbar, styles must target:
- `.tippy-box`
- `.tippy-content`
- `[data-tippy-root] *`

All borders should use `border: none !important` to override Tippy defaults.

## API Endpoints

### Authentication
- `POST /api/auth/register` - Create user (email, password, name?)
- `POST /api/auth/login` - Authenticate user
- `POST /api/auth/logout` - Clear auth cookie

### Documents
- `GET /api/documents` - List current user's documents (uses index)
- `POST /api/documents` - Create document (title, content?)
- `GET /api/documents/[id]` - Get document (with permission check)
- `PUT /api/documents/[id]` - Update document (auto-updates index)
- `DELETE /api/documents/[id]` - Delete document (auto-updates index)

### Uploads
- `POST /api/upload-local` - Upload image (auth required, max 10MB, user-isolated)

## Environment Variables

Required in `apps/web/.env.local`:
```bash
JWT_SECRET=your-secret-minimum-32-characters
OPENAI_API_KEY=sk-...  # Optional, for AI features
```

The JWT_SECRET must be at least 32 characters. In production, use a cryptographically secure random string.

## Testing the Multi-User System

1. Register two different users
2. Create documents with each user
3. Verify each user only sees their own documents
4. Check `data/` structure shows proper isolation
5. Upload images and verify they're stored in user-specific directories

## Migration to Database

When ready to migrate from file storage to database:

1. Keep `types/storage.ts` interfaces unchanged
2. Create new storage classes implementing same interfaces
3. Replace file-system implementation with database queries
4. No changes needed in API routes or frontend
5. User/Document types map directly to database schema

Recommended databases: Supabase (PostgreSQL), PlanetScale (MySQL), or Prisma with any database.

## Common Pitfalls

1. **Don't bypass storage classes** - Always use `userStorage` and `documentStorage`, never direct file operations
2. **Don't modify index files manually** - They're auto-maintained by document-storage
3. **Always use requireAuth()** - API routes must validate authentication
4. **Images are user-isolated** - Upload endpoint enforces user ID in path
5. **Tiptap content is JSON** - Store as JSONContent, not HTML or Markdown

## Novel Editor Customizations

All Novel editor components are in `apps/web/components/tailwind/`. Key customizations:
- Added `text-foreground` to all toolbar buttons (generative-menu-switch, selectors/*)
- Modified image upload to use authenticated API
- Created DocumentEditor wrapper for API integration
- Removed border from `.tippy-box` in prosemirror.css
- Implemented image alignment controls (left/center/right)

When modifying editor UI, always use Tailwind theme variables (`bg-background`, `text-foreground`, etc.) instead of fixed colors for theme compatibility.

### Image Alignment Feature

The editor supports image alignment controls that allow users to position images left, center, or right.

**Implementation:**
1. **UpdatedImage Extension** (`packages/headless/src/extensions/updated-image.ts`)
   - Extended base Image extension with `align` attribute
   - Stores alignment in `data-align` attribute
   - Default: "left"

2. **ImageAlignSelector Component** (`apps/web/components/tailwind/selectors/image-align-selector.tsx`)
   - Bubble menu that appears when an image is selected
   - Three buttons: AlignLeft, AlignCenter, AlignRight
   - Uses `editor.updateAttributes('image', { align })` to update

3. **EditorBubble Modified** (`packages/headless/src/components/editor-bubble.tsx`)
   - Removed `editor.isActive("image")` check from `shouldShow`
   - Removed `isNodeSelection` check
   - Allows bubble menu to display for image node selections

4. **CSS Styles** (`apps/web/styles/prosemirror.css`)
   ```css
   .ProseMirror img[data-align="left"] { margin-right: auto; }
   .ProseMirror img[data-align="center"] { margin-left: auto; margin-right: auto; }
   .ProseMirror img[data-align="right"] { margin-left: auto; }
   ```

**Usage:**
1. Click on an image in the editor
2. Bubble menu appears with alignment buttons
3. Click left/center/right to change alignment
4. Images inserted from photo sidebar default to left alignment

**Photo Sidebar Integration:**
- Located at `apps/web/components/documents/photo-sidebar.tsx`
- Simple click-to-insert interface
- No pre-selection of alignment (use editor controls after insertion)
- Category filtering support (time+location, time-only, location-only, neither)
