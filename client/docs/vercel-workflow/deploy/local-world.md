# Local World (/docs/deploying/world/embedded-world)

# Local World

The **Local World** (`@workflow/world-local`) is a filesystem-based workflow backend designed for local development and testing. It stores workflow data as JSON files on disk and provides in-memory queuing.

The local world is perfect for local development because it:

* Requires no external services or configuration
* Stores data as readable JSON files for easy debugging
* Provides instant feedback during development
* Works seamlessly with Next.js development server

## How It Works

### Storage

The local world stores all workflow data as JSON files in a configurable directory:

```
.workflow-data/
├── runs/
│   └── <run-id>.json
├── steps/
│   └── <run-id>/
│       └── <step-id>.json
├── hooks/
│   └── <hook-id>.json
└── streams/
    └── <run-id>/
        └── <stream-id>.json
```

Each file contains the full state of a run, step, hook, or stream, making it easy to inspect workflow data directly.

### Queuing

The local world uses an in-memory queue with HTTP transport:

1. When a step is enqueued, it's added to an in-memory queue
2. The queue processes steps by sending HTTP requests to your development server
3. Steps are executed at the `.well-known/workflow/v1/step` endpoint

The queue automatically detects your development server's port and adjusts the queue URL accordingly.

### Authentication

The local world provides a simple authentication implementation since no authentication is required or enforced in local development.

```typescript
getAuthHeaders(): Promise<Record<string, string>> {
  return Promise.resolve({});
}
```

## Configuration

### Data Directory

By default, workflow data is stored in `.workflow-data/` in your project root. This can be customized through environment variables or programmatically.

**Environment variable:**

```bash
export WORKFLOW_EMBEDDED_DATA_DIR=./custom-workflow-data
```

**Programmatically:**

```typescript
import { createEmbeddedWorld } from '@workflow/world-local';

const world = createEmbeddedWorld('./custom-workflow-data');
```

### Port

The local world automatically detects your server port from the `PORT` environment variable:

```bash
export PORT=3000

npm run dev
```

You can also specify it explicitly when creating the world programmatically:

```typescript
import { createEmbeddedWorld } from '@workflow/world-local';

const world = createEmbeddedWorld(undefined, 3000);
```

## Usage

### Automatic (Recommended)

The local world is used automatically during local development:

```bash
# Start your Next.js dev server
npm run dev

# Workflows automatically use local world
```

### Manual

You can explicitly set the local world through environment variables:

```bash
export WORKFLOW_TARGET_WORLD=local

npm run dev
```

## Development Workflow

A typical development workflow with local world:

1. **Start your dev server:**

   ```bash
   npm run dev
   ```

2. **Trigger a workflow:**

   ```bash
   curl -X POST --json '{"email":"test@example.com"}' http://localhost:3000/api/signup
   ```

3. **Inspect the results:**
   * Use the [CLI or Web UI](/docs/observability)
   * Check JSON files in `.workflow-data/`
   * View development server logs

## Inspecting Data

### Using Observability Tools

The local world integrates with the Workflow DevKit's observability tools:

```bash
# View runs with CLI
npx workflow inspect runs

# View runs with Web UI
npx workflow inspect runs --web
```

Learn more in the [Observability](/docs/observability) section.

## Limitations

The local world is designed for development, not production:

* **Not scalable** - Uses in-memory queuing
* **Not persistent** - Data is stored in local files
* **Single instance** - Cannot handle distributed deployments
* **No authentication** - Suitable only for local development

For production deployments, use the [Vercel World](/docs/deploying/world/vercel-world).

## API Reference

### `createEmbeddedWorld`

Creates a local world instance:

```typescript
function createEmbeddedWorld(
  dataDir?: string,
  port?: number
): World
```

**Parameters:**

* `dataDir` - Directory for storing workflow data (default: `.workflow-data/`)
* `port` - Server port for queue transport (default: from `PORT` env var)

**Returns:**

* `World` - A world instance implementing the World interface

**Example:**

```typescript
import { createEmbeddedWorld } from '@workflow/world-local';

const world = createEmbeddedWorld('./my-data', 3000);
```

## Learn More

* [World Interface](/docs/deploying/world) - Understanding the World interface
* [Vercel World](/docs/deploying/world/vercel-world) - For production deployments
* [Observability](/docs/observability) - Monitoring and debugging tools
