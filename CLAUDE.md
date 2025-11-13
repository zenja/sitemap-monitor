# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **Sitemap Monitor** - a Next.js 15 application for continuously monitoring website sitemaps and detecting changes. The application is built with modern web technologies and follows a full-stack architecture with comprehensive monitoring capabilities.

**Technology Stack:**
- **Frontend**: Next.js 15 (App Router), React 18, Tailwind CSS, Radix UI
- **Backend**: Hono framework for API routes, PostgreSQL with Drizzle ORM
- **Infrastructure**: Vercel deployment, cron-based scanning, webhook notifications
- **Language**: TypeScript throughout

## Development Commands

### Essential Commands
```bash
# Development
pnpm dev                    # Start Next.js development server
pnpm build                  # Production build
pnpm start                  # Run production build
pnpm lint                   # Run ESLint

# Database Management
pnpm db:generate            # Generate migration files from schema
pnpm db:migrate             # Apply migrations to database
pnpm db:studio              # Open Drizzle Studio (database GUI)

# Testing & Diagnostics
npx tsx scripts/test-manual-scan.ts        # Test scanning functionality
npx tsx scripts/test-dashboard-data.ts     # Test dashboard data queries
npx tsx scripts/diagnose-scan-issue.ts     # Diagnose scanning problems
```

### Environment Setup
Required environment variables:
```env
DATABASE_URL="postgresql://..."    # PostgreSQL connection
CRON_TOKEN="your-secret"           # Cron job authentication
WEBHOOK_SECRET="your-secret"       # Webhook signing secret
APP_BASE_URL="http://localhost:3000"
```

## Architecture Overview

### Core Architecture Patterns

**1. Full-Stack Next.js with App Router**
- API routes use Hono framework for better performance and middleware
- Pages use Server Components and Client Components strategically
- Session-based authentication with secure cookies

**2. Database-First Design**
- PostgreSQL with Drizzle ORM for type-safe database operations
- All database operations use the `lib/db.ts` connection resolver
- Schema defined in `lib/drizzle/schema.ts` with comprehensive relationships

**3. Scanning System Architecture**
- **Queue-based processing**: Sites are queued for scanning based on priority and intervals
- **Concurrent processing**: Multiple sitemaps processed concurrently with configurable limits
- **Change detection**: SHA-256 hashing + diff algorithm for efficient change detection
- **Timeout management**: Automatic cleanup of stuck scans with configurable timeouts

### Key Business Logic Modules

**`lib/logic/discover.ts`** - Sitemap Discovery
- Automatically discovers sitemaps from robots.txt and common paths
- Handles sitemap indexes with recursive parsing (max 5 levels depth)
- Concurrent discovery with configurable concurrency limits

**`lib/logic/scan.ts`** - Scanning Engine
- Priority-based scheduling with configurable intervals
- Concurrent sitemap processing with transaction-safe operations
- Efficient change detection using HTTP headers (ETag, Last-Modified) and content hashing
- Comprehensive error handling and status tracking

**`lib/logic/notify.ts`** - Notification System
- Multi-channel notifications (webhook, email, Slack)
- Template-based change notifications
- Webhook signing with HMAC for security

### Database Schema Design

**Core Tables and Relationships:**
```
users → sites → sitemaps → urls
  ↓      ↓        ↓       ↓
changes (track all URL modifications)
scans (track scan execution history)
webhooks & notification_channels (site-specific notifications)
site_groups (organize sites)
```

**Key Design Patterns:**
- **User isolation**: All data scoped by `ownerId` for multi-tenancy
- **Soft deletion**: URLs marked `inactive` instead of deletion for audit trail
- **Comprehensive audit**: All changes tracked in `changes` table with scan attribution
- **Status management**: Scan states (`queued`, `running`, `success`, `failed`) with timeout handling

### API Architecture

**Hono-based API Routes** (`app/api/[...hono]/route.ts`)
- RESTful API with comprehensive CRUD operations
- Session middleware for authentication
- Zod schema validation for request/response safety
- File upload support for bulk import operations

**Key API Endpoints:**
- `POST /api/sites` - Create new site with sitemap discovery
- `POST /api/sites/:id/scan` - Trigger manual scan
- `POST /api/cron/scan` - Automated cron scanning (requires CRON_TOKEN)
- `GET /api/sites/:id/changes.csv` - Export changes data
- `POST /api/sites/import` - Bulk import sites from CSV

### Performance Optimizations

**Database Level:**
- 14+ performance indexes on critical query paths
- Aggregate queries for dashboard statistics (27x performance improvement)
- Connection pooling for efficient database usage

**Application Level:**
- Content hashing for early-out change detection
- Concurrent processing with configurable limits
- Efficient XML parsing with fast-xml-parser
- Compression support (gzip, deflate, brotli) for network requests

### Security Considerations

**Authentication & Authorization:**
- Session-based authentication with secure HTTP-only cookies
- User isolation enforced at database level
- Cron token authentication for automated tasks

**Webhook Security:**
- HMAC signature verification for webhook payloads
- Request timeout controls and validation
- Secure secret management

### Internationalization

- Chinese-first UI with comprehensive localization
- Structured metadata for SEO optimization
- Date/time formatting with `lib/datetime.ts`

### Development Patterns

**State Management:**
- Server state: Direct database queries through Drizzle ORM
- Client state: React hooks and component state
- Real-time updates: Polling-based approach for scan status

**Error Handling:**
- Comprehensive try-catch blocks with detailed logging
- Graceful degradation for network failures
- Transaction rollback for data consistency

**Code Organization:**
- Business logic separated in `lib/logic/` modules
- Reusable UI components in `components/ui/`
- Database operations centralized through schema imports
- Utility functions in `lib/utils/` for common operations

### Deployment & Operations

**Vercel-Optimized:**
- Serverless-friendly architecture with async processing
- Environment-driven configuration
- Cron endpoints for automated scanning and cleanup

**Monitoring & Diagnostics:**
- Comprehensive logging throughout the application
- Scan timeout management and cleanup automation
- Performance monitoring through dashboard metrics

### Testing Approach

**Manual Testing Scripts:**
- `scripts/test-manual-scan.ts` - Test individual site scanning
- `scripts/test-dashboard-data.ts` - Validate dashboard queries
- `scripts/diagnose-scan-issue.ts` - Troubleshoot scanning problems

**Production Monitoring:**
- Scan success/failure rates
- Database query performance
- Webhook delivery success rates
- User activity patterns

## Important Development Notes

### Working with the Scanning System
- Always use `enqueueScan()` for triggering scans - it handles serverless vs long-running environments
- Scan operations are asynchronous; check scan status via the database
- Concurrency is controlled by environment variables (`SCAN_SITEMAP_CONCURRENCY`, `DISCOVERY_CONCURRENCY`)

### Database Operations
- All database operations should use the `resolveDb()` function for runtime compatibility
- Use transactions for multi-table operations to ensure consistency
- Performance-critical queries should leverage the existing indexes

### Adding New Features
- Follow the existing pattern of schema → API → UI components
- Use Zod for request/response validation
- Implement proper error handling and user feedback
- Consider multi-tenancy implications (user isolation)

### Code Style
- TypeScript strict mode enabled throughout
- Use the existing component library (Radix UI based)
- Follow the established naming conventions and file organization
- Implement proper accessibility features following Radix UI patterns