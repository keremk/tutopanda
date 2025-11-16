Plan

  - Wire a new mcp command in cli/src/cli.tsx#L14-L154: add the help entry, parse --config, --blueprintsDir, --defaultBlueprint, and
    route to a new runMcpServer helper (mirrors how runQuery and the other commands are dispatched in the switch).
  - Introduce cli/src/commands/mcp.ts plus a runMcpServer({configPath, blueprintsDir, defaultBlueprint}) function; validate the
    CLI is initialized via readCliConfig (cli/src/lib/cli-config.ts#L7-L48), read package metadata for the MCP banner, and call a
    createTutopandaMcpServer factory with the resolved storage + blueprint paths so the command stays thin.
  - Build cli/src/mcp/server.ts that imports McpServer/StdioServerTransport from @modelcontextprotocol/sdk/server/*, constructs
    the server with instructions describing Tutopanda workflows, registers resources/tools, and exposes a startServer(opts) Promise
    used by the command. Keep canonical node IDs by forwarding the ExecutionPlan and job contexts from tutopanda-core (cli/src/lib/
    planner.ts#L55-L113, core/src/types.ts#L272-L301).
  - Resources: register tutopanda://blueprints/catalog backed by runBlueprintsList (cli/src/commands/blueprints-list.ts#L9-L43), a
    template tutopanda://blueprints/{file} that calls runBlueprintsDescribe and also runs the canonical expander so every Input:/
    Artifact:/Producer: ID is returned, plus templates tutopanda://movies/{movieId}/plan|manifest|inputs that stream the JSON/TOML
    files created under the CLI storage root so large payloads don’t clog tool responses.
  - Tools:
    • tutopanda.list_providers → wraps runProvidersList to show producer/model readiness for a blueprint, surfacing canonical producer
    IDs when available.
    • tutopanda.generate_plan → writes inline TOML inputs to a temp file, calls generatePlan/runQuery (cli/src/commands/query.ts#L38-
    L118), returns movieId, plan metadata, and summaries of jobs (jobId, context.inputBindings, produces) while pointing clients to
    the plan/manifest resources.
    • tutopanda.dry_run → optionally execute executeDryRun so MCP users can inspect artefact diagnostics without running the full
    build.
    • tutopanda.inspect_prompts → wraps runInspect to expose prompt TOML for an existing movie id.
    Each handler should catch errors, return MCP tool errors, and never invent aliases—only echo IDs that came from the planner/
    manifests.
  - Transport lifecycle: have runMcpServer instantiate StdioServerTransport, call server.connect, hook SIGINT/SIGTERM to server.close,
    and optionally support a --stdio=false flag later for socket transports; log startup/shutdown using the existing console pattern.
  - Testing/documentation: add unit tests under cli/src/commands/__testutils__/mcp.server.test.ts (or similar) using the SDK’s
    InMemoryTransport (node_modules/@modelcontextprotocol/sdk/dist/esm/inMemory.js) to invoke the registered tools/resources, assert
    canonical IDs are included, and add a short doc blurb to cli/readme.md describing tutopanda mcp. Run pnpm --filter tutopanda-cli
    test plus any focused new tests.
