# Repository Guidelines

## Project Structure & Module Organization
Tutopanda is a pnpm workspace with two packages. `client/` hosts the Next.js 15 front end; routes live in `src/app` with grouping folders like `(landing)` and `(docs)`. Shared UI lives in `src/components`, hooks in `src/hooks`, utilities in `src/lib`, and validation in `src/schema.ts`. `server/` is scoped for the Express + Drizzle API; keep the entry file at `server/index.ts`, organise features by folder, and let esbuild emit runtime code to the ignored `server/dist/`. Consult `design_guidelines.md` before adjusting visuals.

## Build, Test, and Development Commands
Run `pnpm install` once to hydrate the workspaces. `pnpm dev` launches Next.js and the server concurrently; use `pnpm dev:client` or `pnpm dev:server` for focused loops. Build artifacts with `pnpm build` or the package-scoped variants. `pnpm check` runs TypeScript validation for both packages, while `pnpm --filter tutopanda-client lint` and `pnpm --filter tutopanda-client type-check` and for tests `pnpm --filter tutopanda-client test:typecheck` target the client workspace specifically. 

## Coding Style & Naming Conventions
Write strict TypeScript and prefer functional React components with kebab-case filenames. Route segment folders in `src/app` should follow Next.js rules (`(group)`, `[param]`, etc.). Use Tailwind utilities and the design tokens defined in `tailwind.config.ts` instead of ad-hoc CSS. Internal imports should use the configured aliases such as `@/components/*` and `@/lib/*`. Reuse helpers from `src/lib` before adding new utilities, and keep new files two-space indented to match the existing style.

## Testing Guidelines
The repo does not yet ship automated tests, so linting and type checks act as the gate. For new code introduce tests, with Vitest as the Testing Library for client code and colocate specs using a `.test.tsx` suffix. Ensure the package exposes a `test` script and wire it through the root via `pnpm --filter <pkg> test`. Document any fixture data inside the package and keep runs deterministic.

## Commit & Pull Request Guidelines
Follow the `<type>: <summary>` pattern seen in history (example `init: first version that runs on Next.js`). Keep subjects imperative and scope commits to one concern. Pull requests should explain the change, link tracking issues, and include screenshots or clips for UI updates. Add a testing note listing the commands you ran (at minimum `pnpm check`). Call out required follow-ups such as database pushes or environment changes before requesting review.
