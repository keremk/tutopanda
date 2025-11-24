# tutopanda-cli publish workflow (proposal)

This document describes the GitHub Actions workflow we plan to add for publishing the Tutopanda CLI (with the bundled viewer) to npm. It’s written for maintainers who don’t live in GitHub Actions every day, so each trigger, requirement, and step is spelled out.

## Release flow in plain terms
- Bump `cli/package.json` to the new version you want on npm (example: `1.0.1`).  
  Example:  
  ```bash
  cd cli
  pnpm version patch   # or minor/major
  ```
- Commit the change and push a tag named `cli-v1.0.1` (the workflow listens for tags matching `cli-v*`).  
  Example:  
  ```bash
  git add cli/package.json
  git commit -m "release: bump cli to 1.0.1"
  git tag -a cli-v1.0.1 -m "cli: 1.0.1"
  git push origin main cli-v1.0.1
  ```
- GitHub Actions will build, bundle the viewer, smoke-test the packed tarball, and publish to npm.
- You can also run it manually (`workflow_dispatch`) with a `dry_run` flag to test the pipeline without publishing.  
  Example (from GitHub UI: Actions → publish-cli → Run workflow): set `dry_run=true` to avoid publishing.

## Triggers and inputs
- `push` tags matching `cli-v*`  
  This keeps publishes tied to explicit CLI release tags and avoids accidental publishes from main.  
  Example tag name: `cli-v1.0.1`.
- `workflow_dispatch` (manual) with inputs:  
  - `tag` (optional): tag/ref to publish when manually triggered (if omitted, the workflow uses the checked-out ref).  
    Example: `cli-v1.0.1`.  
  - `dry_run` (boolean): when true, run everything except the final `npm publish`.  
    Example: set `dry_run=true` to validate the pipeline without publishing.

## Required secret
- `NPM_TOKEN` in repo secrets. It must have permission to publish the `tutopanda-cli` package to the npm registry. The workflow uses it via `NODE_AUTH_TOKEN`.

## Runner, Node, and pnpm
- Runner: `ubuntu-latest` (Linux). Public repos get free Linux minutes on GitHub Actions’ free tier.
- Node: pin to a modern LTS (e.g., Node 20) to match our tooling and avoid surprises.
- pnpm: pin to `10.15.0` (same as the repo). Cache the pnpm store to speed up installs.

## What the workflow will do (step-by-step)
1) **Check out** the repo (shallow is fine; tags are present in the ref).  
2) **Set up pnpm** via `pnpm/action-setup@v4` (version `10.15.0`).  
3) **Set up Node** via `actions/setup-node@v4` with `registry-url: https://registry.npmjs.org` and `cache: 'pnpm'`.  
4) **Install dependencies**: `pnpm install --frozen-lockfile` from the repo root (uses workspace mode).  
5) **Build and pack**: run `pnpm package:cli`. That already:
   - Builds the viewer (`pnpm bundle:viewer` → `scripts/prepare-viewer-bundle.mjs` copies `viewer/dist` and `viewer/server-dist` into `cli/config/viewer`).
   - Builds the CLI (`pnpm --filter tutopanda-cli build`).
   - Packs the CLI to `release/tutopanda-cli-<version>.tgz`.
6) **Smoke checks** (fail fast if anything is missing):
   - Verify viewer assets are inside the tarball: `tar -tf release/tutopanda-cli-*.tgz | grep 'package/config/viewer/dist/index.html'` and `.../server-dist/bin.js`.
   - Sanity-run the built CLI: `node cli/dist/cli.js --help` (no long-lived processes, just ensures the binary starts).
7) **Publish to npm** (only when not a dry run and running on a tag):
   - `npm publish release/tutopanda-cli-*.tgz --access public` with `NODE_AUTH_TOKEN` from `secrets.NPM_TOKEN`.
8) **Upload artifact**:
   - Always upload `release/tutopanda-cli-*.tgz` so we have a traceable build, even on dry runs.

## Guardrails and behavior
- Publish runs only if:
  - The ref is a tag matching `cli-v*`, **and**
  - `dry_run` is false (or unset for tag pushes).
- Manual runs (`workflow_dispatch`):
  - Set `dry_run=true` to exercise the pipeline without publishing.
  - If you pass a `tag` input, the workflow checks out that ref before building.
- No silent fallbacks: missing viewer bundle or build failures stop the workflow immediately.

## Notes on viewer and MPEG exports
- The npm package already bundles the viewer via `scripts/prepare-viewer-bundle.mjs`, so end users don’t download anything extra to use `tutopanda viewer:start` / `viewer:view`.
- MPEG export is intentionally outside the npm package scope; use `Dockerfile.remotion` for Remotion-based rendering when needed.

## Cost expectations
- Public repo + Linux runner → covered by GitHub’s free OSS minutes. No extra billing for the described workflow.
