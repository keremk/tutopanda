# Deploying (/docs/deploying)

# Deploying

<Callout>
  This section is currently experimental and subject to change. Try it out and share your feedback on [GitHub](https://github.com/vercel/workflow/discussions).
</Callout>

Workflows can run on any infrastructure through **Worlds**. A World is an adapter responsible for handling workflow storage, queuing, authentication, and streaming through a given backend.

## What are Worlds?

A **World** connects workflows to the infrastructure that powers them. Think of it as the "environment" where your workflows live and execute. The World interface abstracts away the differences between local development and production deployments, allowing the same workflow code to run seamlessly across different environments.

## Default Behavior

Worlds are automatically configured depending on the scenario:

* **Local development** - Automatically uses the Embedded World
* **Vercel deployments** - Automatically uses the Vercel World

When using other worlds, you can explicitly set configuration through environment variables. Reference the documentation for the appropriate world for configuration details.

## Built-in Worlds

Workflow DevKit ships with two world implementations:

<Cards>
  <Card title="Embedded World" href="/docs/deploying/world/embedded-world">
    Filesystem-based backend for local development, storing data in `.workflow-data/` directory.
  </Card>

  <Card title="Vercel World" href="/docs/deploying/world/vercel-world">
    Production-ready backend for Vercel deployments, integrated with Vercel's infrastructure.
  </Card>
</Cards>

## Building a World

On top of the default Worlds provided by Workflow DevKit, you can also build new world implementations for custom infrastructure:

* Database backends (PostgreSQL, MySQL, MongoDB, etc.)
* Cloud providers (AWS, GCP, Azure, etc.)
* Custom queue systems
* Third-party platforms

To build a custom world, use a community-implemented `World`, or implement the `World` interface yourself, the following interfaces are required:

* **Storage** - Persisting workflow runs, steps, hooks, and metadata
* **Queue** - Enqueuing and processing workflow steps asynchronously
* **AuthProvider** - Handling authentication for API access
* **Streamer** - Managing readable and writable streams

See the [World API Reference](/docs/deploying/world) for implementation details.

### Using a third-party World

For custom backends and third-party world implementations, refer to the specific world's documentation for configuration details. Each world may have its own set of required environment variables and configuration options.

## Observability

The [Observability tools](/docs/observability) (CLI and Web UI) can connect to any world backend to inspect workflow data. By default, they connect to your local environment, but they can also be configured to inspect remote environments:

```bash
# Inspect local workflows
npx workflow inspect runs

# Inspect remote workflows (custom worlds)
npx workflow inspect runs --backend <your-world-name>
```

Learn more about [Observability](/docs/observability) tools.

## Learn More

* [Embedded World](/docs/deploying/world/embedded-world) - Local development backend
* [Vercel World](/docs/deploying/world/vercel-world) - Production backend for Vercel
* [World API Reference](/docs/deploying/world) - Building custom worlds
* [Observability](/docs/observability) - Inspecting workflow data
