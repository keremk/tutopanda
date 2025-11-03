# Provider API Architecture

The providers package is the single integration surface for model providers (OpenAI, Replicate, internal processors, etc.). Both the CLI and the server resolve their producer handlers exclusively through this package, avoiding any direct SDK usage outside of `tutopanda-providers`.

## Objectives

- Select the correct implementation for a `(producer, provider, model, environment)` variant at runtime.
- Allow primary + fallback variants to be defined in configuration and resolved at execution time without hard-coding.
- Normalise provider-specific SDK contracts into the `ProduceFn` expectations used by `core/src/runner.ts`.
- Centralise cross-cutting concerns (auth, retries, logging, metrics, cancellation) so CLI and server code paths stay thin.
- Support both mock executions (for tests/dry runs) and live executions through the same interface.

## Shared Terminology

| Term | Description |
| --- | --- |
| **Provider Variant** | Tuple of `(provider, model, environment)` describing a concrete implementation. `environment` is `local` or `cloud`, allowing different execution paths (e.g. Replicate via direct token vs. hosted service). |
| **Producer Kind** | Logical producer defined in core (e.g. `ScriptProducer`). Producer kinds are environment-agnostic and may map to multiple provider variants. |
| **Provider Binding** | Resolved executable handler for a single variant, including lifecycle hooks, metadata, and invocation method. |
| **Registry** | The object returned by `createProviderRegistry`. It owns variant discovery, instantiation, caching, and enrichment (logging, rate limits, etc.). |

## Source Layout

- `providers/src/mappings.ts` declares the mapping between `(provider, model, environment)` triples and the factories that produce concrete handlers (mock + live).
- `providers/src/common/` hosts SDK adapters (Vercel AI SDK, Replicate client, ElevenLabs REST), retry utilities, schema validation, and type coercion helpers.
- `providers/src/registry.ts` is upgraded to:
  - Track registry mode (`mock`, `live`, `hybrid`) with lazy instantiation of handlers.
  - Expose richer resolution APIs (single variant, batch, capability introspection).
  - Enforce separation between plan resolution and handler invocation.
- `providers/src/types.ts` is augmented with environment-aware types, variant descriptors, handler context, and structured diagnostics.

## Runtime Architecture

```
┌───────────────────────┐        ┌────────────────────┐        ┌───────────────────────────┐
│ CLI / Server runtime  │        │ Provider Registry  │        │ Provider Handler (LLM etc)│
│  • load user config   │        │  • provider map    │        │  • concrete SDK impl      │
│  • build plan (core)  │  →→→   │  • resolve variant │  →→→   │  • produces artefacts      │
│  • inject ProduceFn   │        │  • wrap w/ logging │        │  • returns ProviderResult  │
└───────────────────────┘        └────────────────────┘        └───────────────────────────┘
```

1. The CLI/server chooses variants (primary/fallback) per producer using the user-provided settings (JSON + referenced TOML/JSON files) for that run.
2. Before running the core `createRunner`, the runtime constructs a `ProduceFn` via `createProviderProduce(registry, providerOptions, resolvedInputs, resolutionPlan)`.
3. For each job, `createRunner` calls `produce(ProduceRequest)` (see `core/src/runner.ts`). The produce wrapper looks up the appropriate provider binding (with fallbacks) and calls `handler.invoke`.
4. `handler.invoke` performs the actual SDK call, returning a `ProviderResult` comprised of normalised `ProducedArtefact` entries. These flow back into the runner for storage/event logging.

## Variant Resolution

### Resolution APIs

The registry API is intentionally small:

```ts
interface ProviderDescriptor {
  provider: ProviderName;
  model: string;
  environment: 'local' | 'cloud';
}

interface ResolvedProviderHandler {
  descriptor: ProviderDescriptor;
  handler: ProducerHandler;
}

interface ProviderRegistry {
  resolve(descriptor: ProviderDescriptor): ProducerHandler;
  resolveMany(descriptors: ProviderDescriptor[]): ResolvedProviderHandler[];
  warmStart?(handlers: ResolvedProviderHandler[]): Promise<void>;
}
```

The CLI hands the registry the exact triples it wants to execute (deduplicated). The registry locates the matching implementation (mock/live) and returns a handler ready to invoke.

### Job Payload Structure

Provider handlers receive all run-time data through `ProviderJobContext`. The CLI/server **only** load configuration files and pass them through verbatim—no package outside `tutopanda-providers` interprets provider-specific knobs (prompt templates, reasoning settings, TOML configs, etc.).

```ts
interface ProviderJobContext {
  jobId: string;
  provider: ProviderName;
  model: string;
  revision: RevisionId;
  layerIndex: number;
  attempt: number;
  inputs: string[];     // identifiers for required inputs/artefacts
  produces: string[];   // artefact ids the job should emit
  context: {
    providerConfig?: unknown;       // parsed JSON object built from CLI settings / TOML files (semantics owned by the handler)
    rawAttachments?: Array<{        // optional original documents if provider needs to re-hydrate raw text
      name: string;
      contents: string;
      format: 'json' | 'toml' | 'text';
    }>;
    environment?: 'local' | 'cloud';
    observability?: Record<string, unknown>; // trace ids, log level, etc.
    extras?: Record<string, unknown>;        // planner metadata, custom attributes, ...
  };
}
```

- Handlers are responsible for validating and parsing `context.providerConfig` and related attachments.
- If a provider needs to share computed prompts/templates across invocations, it owns the caching inside the handler factory—nothing in the CLI attempts to interpret those structures.
- The CLI/server parse configuration files into plain data objects (e.g. TOML → JSON) but do not interpret the contents; handlers translate those objects into provider-specific payloads.

## Handler Lifecycle

Each handler factory produces an object with the following surface:

```ts
interface ProviderHandler {
  readonly kind: ProducerKind;
  readonly provider: ProviderName;
  readonly model: string;
  readonly environment: 'local' | 'cloud';
  readonly mode: ProviderMode;              // mock | live
  readonly capabilities: ProviderCapabilityMap;
  warmStart?(ctx: WarmStartContext): Promise<void>;  // optional pre-flight
  invoke(job: ProviderJobContext): Promise<ProviderResult>;
  abort?(jobId: string): Promise<void>;     // optional cancellation hook
}
```

- `warmStart` is called during runtime boot (e.g. CLI `tutopanda query|edit` flows or server worker start) to pre-create SDK clients, fetch model metadata, or hydrate caches.
- `invoke` receives the minimal context needed to call the provider:
  - `job.inputs` & `job.produces` reference IDs; handlers resolve whichever payloads they need through shared utilities (e.g. blueprint metadata, stored artefacts).
  - `job.context` carries parsed configuration objects plus optional raw attachments gathered by the CLI/server without applying provider-specific semantics.
- Handlers must return raw artefacts only; persistence happens inside `core/src/runner.ts` via `materializeArtefacts`.
- `abort` enables cooperative cancellation (e.g. aborting Replicate predictions when the user hits Ctrl+C).

## Cross-Cutting Concerns

- **Secrets**: Registry options accept a `secretResolver` interface:
  ```ts
  interface SecretResolver {
    getSecret(key: string, opts?: SecretOptions): Promise<string | null>;
  }
  ```
  Secrets are fetched when instantiating handlers and injected into SDK clients; they are never written to logs.

- **Logging & Metrics**: Registry options include hooks:
  ```ts
  interface ObservabilityHooks {
    onInvokeStart(ctx: InvokeTelemetryContext): void;
    onInvokeEnd(ctx: InvokeTelemetryContext & { durationMs: number; result: ProviderResult }): void;
    onInvokeError(ctx: InvokeTelemetryContext & { error: SerializedProviderError }): void;
  }
  ```
  The CLI passes through the logger attached to `core/src/runner.ts` so users see progress updates (e.g. `provider.invoke.start` events).

- **Retry & Backoff**: Common utilities wrap `handler.invoke` with provider-specific retry policies (e.g. exponential backoff on `429` from Replicate, step-down retries for rate-limited LLM calls). Policies are chosen based on the `rateKey` from `ProducerCatalog`.

- **Fallback Strategy**: The produce wrapper executes the first handler; on `ProviderFailure` flagged as retryable, it falls through to the next handler in the descriptor list. Each attempt records structured diagnostics so manifests capture both attempted providers and the final success/failure.

## Integration with `core/src/runner.ts`

- `createRunner` expects a `ProduceFn` that obeys the `ProduceRequest → ProduceResult` contract.
- `createProviderProduce(registry, providerOptions, resolvedInputs, resolutionCache)` produces such a function:
  1. Derive the `ProviderVariant` for the job from `request.job.provider` + `.providerModel` + `.context.environment ?? 'local'`.
  2. Pull the pre-resolved handlers from the cache; if missing, call `registry.resolveSingle`.
  3. Execute the primary handler. When it resolves, transform `ProviderResult` directly into `ProduceResult`.
  4. On failure, attempt fallbacks (if any), attaching diagnostics to the eventual result.
- The runner remains unaware of provider specifics; it only handles persistence, event logging, and manifest building.

## Modes & Testing

- **Mock mode** (`mode: 'mock'`): used by CLI dry runs and automated tests. Factories live under `providers/src/producers/<domain>/mock`. These handlers generate deterministic artefacts without hitting external services.
- **Live mode** (`mode: 'live'`): instantiates real SDK clients. Requires secrets to be resolvable and is used by `tutopanda query/edit` when `--dryrun` is not specified.
- **Hybrid mode** (future): could allow mixing live and mock handlers per producer during development/test scenarios if needed.

## Deliverables & Next Steps

- Implement the expanded registry, handler, and variant types.
- Extend the mappings registry and CLI configuration parsing to carry environment + fallback metadata.
- Extend `cli/src/lib/build.ts` (and the server equivalent) to pre-resolve bindings and wire produce fallbacks.
- Migrate existing mock handlers to the new interface; add skeleton live handlers for OpenAI (via Vercel AI SDK) and Replicate referencing the requirements in `providers/docs/AI SDKs`.
- Document provider capabilities in generated telemetry and manifest diagnostics to aid debugging.
