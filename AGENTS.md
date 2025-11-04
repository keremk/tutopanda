# Repository Guidelines

## Project Structure & Module Organization
Tutopanda is now a pnpm workspace with four packages.
- `client/` (`tutopanda-client`) remains the Next.js 15 web client. Routes live in `src/app` (group folders follow Next.js conventions), shared UI in `src/components`, hooks in `src/hooks`, utilities in `src/lib`, and validation in `src/schema.ts`. The client is mid-refactor as movie generation shifts into the backend stack.
- `server/` (`tutopanda-server`) hosts the API surface on Nitro/h3; group routes under `server/server/routes` with handlers composed from shared logic. Runtime output is still emitted to `server/dist/` (ignored by git). Coordinate with the core library for all movie generation.
- `core/` (`tutopanda-core`) is the shared TypeScript library for orchestrating AI-based movie asset generation. Source lives under `src/`, with published entry points in `src/index.ts`. Build artifacts go to `dist/`.
- `cli/` (`tutopanda-cli`) provides a command-line workflow for generating movies, backed by the core package. Keep the Ink entry point in `src/cli.tsx` and organise reusable UI under `src/`.

Consult `design_guidelines.md` before adjusting visuals in the client, and keep shared logic inside `core/` whenever possible to avoid duplication across the API and CLI surfaces.

## Build, Test, and Development Commands
Run `pnpm install` once to hydrate the workspaces. Use `pnpm dev` for the combined web client and API loop, or `pnpm dev:client` / `pnpm dev:server` for focused development (CLI and core expose `pnpm --filter tutopanda-<pkg> dev` watchers when needed). Build artifacts either via `pnpm build` or per-package scripts such as `pnpm --filter tutopanda-core build`. Linting and type checks run through the package names: e.g. `pnpm --filter tutopanda-client lint`, `pnpm --filter tutopanda-core type-check`, `pnpm --filter tutopanda-cli lint`. Vitest is wired the same way (`pnpm --filter tutopanda-server test`, etc.). Use the actual package names with `--filter` when invoking commands from the repo root.

> **Important**: Do **not** run `pnpm install` as a build step or during routine development tasks—only run it when specifically instructed to hydrate dependencies.

> **Agent Rule**: Never run package-management commands (`pnpm add`, `pnpm install`, etc.) without explicit user approval. Always surface the dependency request to the user instead.

> **Agent Rule**: Never use `git checkout` or other destructive git commands to reset files. Always coordinate with the user if a revert is needed.

> **Agent Rule**: When you see an /* eslint-disable no-unused-vars */ Do NOT delete it. It is there for a reason to turn off an overeager rule trying it on Interfaces.

> **Agent Rule**: When running vitest, make sure to cd into the project and run it there, here is how to do for CLI
```bash
cd cli && pnpm vitest run --pool=threads --poolOptions.threads.singleThread
```

> **Agent Rule**: Never run `git restore`, `git checkout`, `git clean`, or any other destructive git command without explicit user consent. Confirm with the user before invoking any command that might drop local changes.

> **Agent Rule**: Never generate build artefacts (e.g. `.js`, `.d.ts`, `.map`) inside `core/src` or other source directories. Keep generated output inside the designated `dist/` folders by running the appropriate package build.

> **Agent Rule**: When cross-package types or builds are needed, rely on the workspace packages' documented build outputs (`dist/`) or ask the user for guidance. Do not create ad-hoc shims or shortcuts; pause and ask if unsure.

> **Agent Rule**: Never delete files without explicit confirmation from the user.

## Coding Style & Naming Conventions
Write strict TypeScript and prefer functional React components with kebab-case filenames. Route segment folders in `src/app` should follow Next.js rules (`(group)`, `[param]`, etc.). Use Tailwind utilities and the design tokens defined in `tailwind.config.ts` instead of ad-hoc CSS. Internal imports should use the configured aliases such as `@/components/*` and `@/lib/*`. Reuse helpers from `src/lib` before adding new utilities, and keep new files two-space indented to match the existing style.

- Optimise for clarity first: avoid adding defensive guards or nested ternaries that obscure intent unless there is a concrete bug being handled. Prefer small helper functions or straightforward control flow.

## Testing Guidelines
The repo still relies on linting and type checks as the baseline gate, but all packages are wired for Vitest. Add tests for new behaviour (`.test.ts`/`.test.tsx` next to the code) across client, server, core, and CLI. Ensure each package exposes the relevant `test` scripts and use `pnpm --filter <package> test` from the root. Document any fixture data inside its package and keep runs deterministic.

## Commit & Pull Request Guidelines
Follow the `<type>: <summary>` pattern seen in history (example `init: first version that runs on Next.js`). Keep subjects imperative and scope commits to one concern. Pull requests should explain the change, link tracking issues, and include screenshots or clips for UI updates. Add a testing note listing the commands you ran (at minimum `pnpm check`). Call out required follow-ups such as database pushes or environment changes before requesting review.
