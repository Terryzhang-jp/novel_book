# Novel Book - Multi-User Document Editor

A multi-user document editing application built on the Novel editor (Notion-style WYSIWYG) with local file storage and JWT authentication.

## Features

- 🔐 **User Authentication** - JWT-based authentication with bcrypt password hashing
- 👥 **Multi-User Support** - Complete user isolation with per-user data storage
- 📝 **Rich Text Editor** - Notion-style WYSIWYG editor powered by Tiptap
- 🖼️ **Image Upload** - User-specific image storage with drag-and-drop support
- 🔍 **Document Search** - Real-time search across document titles, content, and tags
- 💾 **Auto-Save** - Automatic document saving with 500ms debounce
- 🎨 **Modern UI** - Clean interface built with Tailwind CSS
- 🔒 **Secure** - HTTP-only cookies, password encryption, path traversal protection

## Tech Stack

### Backend
- **Next.js 15** - App Router with API routes
- **TypeScript** - Type-safe development
- **jose** - JWT token generation and verification
- **bcryptjs** - Password hashing
- **File System** - Local JSON storage (easily migrated to database)

### Frontend
- **React 18** - UI framework
- **Novel Editor** - Tiptap-based rich text editor
- **Tailwind CSS** - Styling
- **Lucide React** - Icons
- **use-debounce** - Auto-save optimization

### Architecture
- **Turborepo** - Monorepo build system
- **Storage Abstraction** - Repository pattern for easy database migration
- **Atomic File Writes** - Data integrity with temp file + rename pattern

## Quick Start

### Prerequisites
- Node.js 18+
- pnpm 9.5.0+

### Installation

```bash
# Clone the repository
git clone https://github.com/Terryzhang-jp/novel_book.git
cd novel_book

# Install dependencies
pnpm install

# Setup environment variables
cd apps/web
cp .env.example .env.local
```

### Configuration

Edit `apps/web/.env.local`:

```env
# Required: JWT secret (minimum 32 characters)
JWT_SECRET=your-super-secret-key-change-in-production-min-32-chars

# Optional: Enable AI features
OPENAI_API_KEY=sk-your-openai-api-key
```

### Development

```bash
# Start development server
pnpm dev

# The app will be available at http://localhost:3000
```

### Build

```bash
# Build for production
pnpm build

# Type checking
pnpm typecheck

# Linting
pnpm lint

# Format code
pnpm format
```

## Usage

### First Time Setup

1. Visit `http://localhost:3000`
2. Click "Sign up" to create an account
3. Enter your email, password (min 6 characters), and optional name
4. You'll be automatically logged in and redirected to your documents

### Creating Documents

1. Click "New Document" button
2. Enter a document title
3. Start writing with the rich text editor
4. Documents auto-save every 500ms

### Editor Features

- **Slash Commands** - Type `/` to see available commands
- **Formatting** - Bold, italic, underline, strikethrough, code
- **Headings** - H1, H2, H3
- **Lists** - Bullet lists, numbered lists, task lists
- **Code Blocks** - Syntax highlighting
- **Images** - Drag & drop or paste images
- **Links** - Add hyperlinks
- **Math** - LaTeX math equations
- **AI** - AI-powered writing assistance (with OpenAI API key)

## Project Structure

```
novel_book/
├── apps/
│   └── web/                    # Next.js application
│       ├── app/                # App router pages
│       │   ├── api/           # API routes
│       │   │   ├── auth/      # Authentication endpoints
│       │   │   ├── documents/ # Document CRUD
│       │   │   └── upload-local/ # Image upload
│       │   ├── documents/     # Document pages
│       │   ├── login/         # Login page
│       │   └── register/      # Registration page
│       ├── lib/               # Core logic
│       │   ├── auth/          # JWT & session management
│       │   └── storage/       # File storage layer
│       ├── components/        # React components
│       ├── middleware.ts      # Route protection
│       ├── data/              # User data (gitignored)
│       └── public/images/     # Uploaded images (gitignored)
└── packages/
    └── headless/              # Novel editor core
```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `POST /api/auth/logout` - Logout user

### Documents
- `GET /api/documents` - List user's documents
- `POST /api/documents` - Create new document
- `GET /api/documents/[id]` - Get document details
- `PUT /api/documents/[id]` - Update document
- `DELETE /api/documents/[id]` - Delete document

### Upload
- `POST /api/upload-local` - Upload image

## Storage Architecture

### File Structure

```
apps/web/
├── data/
│   ├── auth/
│   │   └── users.json              # All users
│   ├── documents/
│   │   └── {userId}/
│   │       └── {docId}.json        # User's documents
│   └── indexes/
│       └── {userId}.json           # Document index
└── public/images/
    └── {userId}/                    # User's images
```

### Storage Layer

The storage layer uses a repository pattern with these components:

- **user-storage.ts** - User CRUD operations
- **document-storage.ts** - Document CRUD with auto-indexing
- **index-manager.ts** - Fast document queries
- **file-system.ts** - Atomic write operations
- **init.ts** - Directory initialization

### Database Migration

The storage layer is abstracted for easy migration:

1. Implement same interfaces with database queries
2. Replace storage classes in `lib/storage/`
3. No changes needed in API routes or frontend

Recommended databases:
- **Supabase** (PostgreSQL) - Recommended
- **PlanetScale** (MySQL)
- **Prisma** + any database

## Security Features

- ✅ JWT authentication with 7-day expiration
- ✅ bcrypt password hashing (10 rounds)
- ✅ HTTP-only cookies prevent XSS
- ✅ Path traversal protection
- ✅ File type validation (images only)
- ✅ File size limits (10MB max)
- ✅ Per-user data isolation
- ✅ Permission checks on all operations

## Development

### Commands

```bash
# Development
pnpm dev              # Start dev server
pnpm build            # Build for production
pnpm typecheck        # Type checking
pnpm lint             # Lint code
pnpm lint:fix         # Fix lint issues
pnpm format           # Format code
pnpm format:fix       # Format and fix
pnpm clean            # Clean build artifacts
```

### Testing Multi-User

1. Register User A and create documents
2. Logout and register User B
3. Create documents as User B
4. Verify User A and User B see only their own documents
5. Check `data/` directory shows proper isolation

## Documentation

- **CLAUDE.md** - Comprehensive guide for Claude Code development
- **Implementation docs** - See `/doc` directory for detailed implementation notes

## Known Limitations

- **Concurrent Editing**: Last-Write-Wins strategy (suitable for single-user editing)
- **Search**: Client-side only (may be slow with many documents)
- **Backup**: No automatic backup (manually backup `data/` directory)
- **Image Deduplication**: Not implemented

## Future Enhancements

- Real-time collaboration (WebSocket, Y.js)
- Full-text search (ElasticSearch)
- Document versioning
- Image optimization and CDN
- Password reset functionality
- Export to PDF/Markdown/HTML
- Mobile app

## License

Licensed under the [Apache-2.0 license](LICENSE).

## Acknowledgments

Built on top of [Novel](https://novel.sh/) by [@steventey](https://github.com/steven-tey) - an amazing Notion-style WYSIWYG editor.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

---

**Built with ❤️ using Next.js, Tiptap, and Tailwind CSS**
