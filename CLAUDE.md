# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Architecture

Tutopanda is a pnpm workspace monorepo with two packages:
- **client/**: Next.js 15 frontend with App Router
- **server/**: Express + Drizzle ORM API server

### Client Structure
- Routes: `client/src/app/` with grouping folders like `(landing)` and `(docs)`
- Components: `client/src/components/` (shared UI components)
- Hooks: `client/src/hooks/`
- Utilities: `client/src/lib/`
- Validation: `client/src/schema.ts`
- UI Library: Shadcn/ui components with Radix UI and Tailwind CSS

### Server Structure
- Entry point: `server/index.ts`
- Features organized by folder
- Build output: `server/dist/` (ignored by git)
- Database: Drizzle ORM with Neon PostgreSQL

## Development Commands

```bash
# Setup
pnpm install

# Development (both packages concurrently)
pnpm dev

# Package-specific development
pnpm dev:client
pnpm dev:server

# Building
pnpm build              # Build both packages
pnpm build:client       # Build client only
pnpm build:server       # Build server only

# Type checking and linting
pnpm check             # TypeScript validation for both packages
pnpm --filter client lint    # ESLint for client
pnpm --filter client type-check  # TypeScript check for client only

# Database
pnpm db:push           # Sync Drizzle migrations (requires DATABASE_URL)
```

## Key Technologies

- **Frontend**: Next.js 15, React 19, TypeScript, Tailwind CSS v4, Shadcn/ui
- **Backend**: Express, Drizzle ORM, Passport.js, WebSockets
- **Database**: Neon PostgreSQL
- **Build**: esbuild (server), Next.js (client)
- **Package Manager**: pnpm workspaces

## Coding Conventions

- Use kebab-case for filenames
- TypeScript strict mode enabled
- Functional React components
- 2-space indentation
- Import aliases: `@/components/*`, `@/lib/*`
- Follow existing patterns in AGENTS.md

## Testing

No automated tests are currently configured. Type checking and linting serve as the primary validation. For new code, plan to add Vitest with Testing Library for client code using `.test.tsx` suffix.