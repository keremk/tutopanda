# Providers System
This package contains the registered producers for different providers of models and also other types of producers in the future. 
- There are many alternative models and alternative providers of models. They don't have a unified API (although there are some wrappers for LLM and image providers such as the Vercel AI SDK). This registry allows us to plug alternative providers and invoke them for a given job. 
- Each provider will use their own API. 

## List of Supported Providers & Models for V1 by Producer Type
- Provider points to the API provider, and model points to the AI model to be used. 
- There is a mapping file `mappings.ts` where (provider, model) pairs are mapped to concrete implementations in the producers/audio... folders.
- In the plan for producers, when a producer specifies the model/provider we will do a lookup and figure out what concrete producer to use. 

> Currently Producers in core package does not specify their model and provider, it is missing.

### Script Generation
- These models need to have WebSearch and reasoning capabilities as they will be researching a topic before generating the script. 

|Provider|Model|
|---|---|
|OpenAI|openai/GPT-5|
|Replicate|google/gemini-2.5-flash|

### Prompt Generation
- We will be using an LLM to automatically generate prompts for image, audio, music and video generation instead of hand-crafting them.

|Provider|Model|
|---|---|
|OpenAI|GPT-5-mini|

### Audio Narration Generation
- These models and providers generate narrated audio given a text script in various voices and emotions.

|Provider|Model|
|---|---|
|Replicate|minimax/speech-02-hd|
|Replicate|elevenlabs/v3|
|Replicate|elevenlabs/turbo-v2.5|

### Image Generation
- These models and providers generate images based on text and/or image inputs

|Provider|Model|
|---|---|
|Replicate|bytedance/seedream-4|
|Replicate|google/imagen-4|
|Replicate|google/nano-banana|
|Replicate|tencent/hunyuan-image-3|

### Video Generation
- These models and providers generate videos based on text and/or image inputs

|Provider|Model|
|---|---|
|Replicate|bytedance/seedance-1-pro-fast|
|Replicate|bytedance/seedance-1-lite|
|Replicate|google/veo-3-fast|

### Music Generation

|Provider|Model|
|---|---|
|Replicate|stability-ai/stable-audio-2.5|

## Test Producers
- For each of the producer types (audio, ...), we have a test producer, which does not make any outgoing calls but simply generates a mock artefact. We need this both for automated tests and also for try runs as we develop the software. The real outgoing provider calls are very expensive so we don't want to run them while development as we troubleshoot things. 

# Architecture

## Goals and Constraints
- Decouple the planning logic in `tutopanda-core` from provider-specific SDK code while still allowing the planner to pick concrete models.
- Make switching providers or running with mock producers a configuration change rather than a code change.
- Centralise client creation, auth handling, and observability for each provider to avoid duplication inside CLI and server runtimes.
- Allow future providers (e.g. FAL or custom pipelines) to plug in without touching existing call sites.

## Package Topology
- `providers/src/mappings.ts` remains the canonical registry. Each entry declares the supported `(provider, model, environment)` triples and factories for both live and mock implementations.
- `providers/src/producers/<domain>/` groups handlers by artefact domain (script, prompt, image, video, audio, music). Each handler exports a `createProducer` factory that accepts a shared runtime context.
- `providers/src/common/` contains thin SDK wrappers (OpenAI, Replicate, ElevenLabs, etc.) and shared utilities such as retry helpers or response normalization. These wrappers own HTTP client configuration and rate limiting.
- `providers/src/index.ts` exports `createProviderRegistry` and associated types so the CLI and server packages can resolve handlers at runtime.

## Producer Descriptors (owned by the CLI)
- The CLI materialises a producer catalog at runtime based on the active settings file. Each entry includes the `(provider, model)` to use plus user-defined fallbacks.
- Planner output (`ProducerGraphNode`) carries the chosen provider/model combination so the execution plan is fully explicit.
- Per-movie overrides (e.g. “use `seedream-4` instead of `imagen-4`”) are persisted alongside the movie (`config.json` + `providers.json`) so later edits replay the exact same selections unless the user supplies new overrides.

## Provider Registry and Resolution
- `createProviderRegistry(options)` loads `mappings.ts`, instantiates provider clients, and wires factories. Options declare runtime mode (`live | mock`), telemetry hooks, and secret providers (environment variables, Vercel secure store, etc.).
- The registry exposes `resolve` / `resolveMany` helpers that accept `{ provider, model, environment }` descriptors.
- Registry lookups return a `ProducerHandler` object:
  ```ts
interface ProducerHandler<I, O = ProducerResult> {
  readonly provider: ProviderName;
  readonly model: string;
  readonly environment: 'local' | 'cloud';
  readonly mode: 'mock' | 'live';
  invoke(request: ProviderRequest<I>): Promise<O>;
  warmStart?(env: WarmStartContext): Promise<void>;
}
```
- `warmStart` is an optional lifecycle hook. When present the registry calls it during worker boot with a `WarmStartContext` (logger, caches, timeout budget) so handlers can pre-initialize heavyweight resources (e.g. refresh tokens, pre-create SDK sessions) without delaying the first `invoke`. Runners may skip it in fast-path test environments.
- `mappings.ts` is implemented as data plus factories:
  ```ts
  export const providerImplementations = [
    {
      match: { provider: '*', model: '*', environment: '*' },
      mode: 'mock',
      factory: createMockProducerHandler(),
    },
    // live handlers registered alongside the mock default
  ];
  ```

## Execution Contract
- `ProducerRequest` encapsulates everything a handler needs: job metadata, resolved inputs/artifacts, storage handles for uploading blobs, and utilities for logging/metrics. CLI and server code construct this request from the core plan.
- Handlers return a `ProducerResult` containing produced artefacts, structured provider metadata (raw provider response IDs, cost, retries), and an event payload ready for `EventLog.appendArtefact`.
- Shared utilities in `providers/src/common` centralise:
  - HTTP client configuration and token injection.
  - Automatic retries with backoff on retriable error codes.
  - Normalisation helpers that convert provider-specific payloads into core artefact metadata (e.g. unify audio duration, image URL, prompt text).
- Handlers **do not** touch manifests or event logs directly; they report their results back to the runner which then updates storage via core helpers. This keeps provider code side-effect free and testable.

## Configuration, Secrets, and Telemetry
- `ProviderRegistryOptions` accept `secretResolver` functions so API keys can be sourced from env vars, 1Password, Vercel KV, etc. The default resolver simply reads `process.env`, keeping the common path frictionless while still allowing alternative stores. Secrets are fetched once when the registry instantiates a provider client.
- The registry emits structured lifecycle events (`provider.invoke.start|end|error`) via an injected logger/metrics sink. CLI/server glue can forward these into console logs, Datadog, or OpenTelemetry depending on the environment.
- Rate-limiting is coordinated via a shared `RateLimiter` utility in `common/` keyed by the `Producer.rateKey` declared in core. This lets CLI and server share the same buckets while keeping provider logic simple.

## Mock & Test Producers
- Every mapping entry declares a `mock` factory returning deterministic artefacts for integration tests and sandboxes. Mock factories live under `providers/src/producers/<domain>/mock` to keep them separate from the live code.
- Runtime mode is determined per job: a CLI flag like `--use-mock=ScriptProducer,TextToMusicProducer` maps to registry overrides so we can mix real and fake producers within a run.
- Mock handlers return the same `ProducerResult` shape as live handlers and annotate responses with `meta.mocked = true` so manifests and audits can record the origin.

## Future Extensions
- Support for provider capability discovery (`registry.listModels(kind)`) so editor UIs can surface selectable models.
- Pluggable middleware in the registry (e.g. tracing wrapper, caching) implemented as a decorator around `invoke`.
- Shared validation schemas in `providers/src/common/schema.ts` to assert that handler inputs match the expectations of each provider before issuing API calls.

With this architecture the providers package becomes the single integration surface for external model APIs, while core remains responsible for planning, dirty detection, and writing manifests. The missing provider metadata in the core producer catalog becomes required, unlocking automatic routing through the registry during execution.
