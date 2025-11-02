# LLMs
- We use the Vercel AI SDK for LLM integrations so credential handling, retries, and response parsing share a common surface.
- Providers are addressed directly via their API keys (no AI Gateway for the first iteration).
- We avoid streaming responses today—the runners emit higher-level progress signals while builds are running.

## OpenAI Implementation

The OpenAI handler lives in `providers/src/producers/llm/openai.ts`. It is registered in `mappings.ts`, allowing any producer that resolves to `(provider: "openai", model: "...")` to reuse the same implementation. The handler consumes parsed configuration supplied by the CLI (system prompt templates, variable bindings, JSON schema, artefact mapping) and produces structured artefacts for the core runner.

### Configuration Contract

The CLI parses TOML/JSON configuration files and forwards them verbatim in `job.context.providerConfig`. The handler narrows that shape to:

```ts
interface OpenAiLlmConfig {
  systemPrompt: string;                     // may contain {{placeholders}}
  userPrompt?: string;
  variables?: Record<string, string>;       // template placeholder -> job input id
  responseFormat: {
    type: 'json_schema' | 'text';
    schema?: Record<string, unknown>;       // required when type === 'json_schema'
  };
  temperature?: number;
  maxOutputTokens?: number;
  presencePenalty?: number;
  frequencyPenalty?: number;
  artefactMapping: Array<{
    field: string;                          // dot path inside JSON response
    artefactId: string;
    kind?: string;                          // optional metadata for diagnostics
    statusField?: string;                   // optional dot path for status override
    output: 'inline' | 'blob';
    mediaType?: string;                     // required when output === 'blob'
  }>;
}
```

`job.context.extras?.resolvedInputs` supplies a generic `Record<string, unknown>` of input values derived by the CLI (prompt text, duration, style, etc.). The handler uses the `variables` map to substitute those values into the prompt templates—no provider-specific logic runs in the CLI.

When the configuration includes structured output metadata, the handler can use the AI SDK v6 helpers such as `jsonSchema` (or Zod-based schemas) to validate and forward JSON schema definitions directly into the Responses API payload.

### Warm Start

Warm start ensures failures surface before execution begins and caches the AI SDK client:

1. Resolve the API key using the registry’s `secretResolver` (default: `process.env.OPENAI_API_KEY`).
2. Instantiate a provider client via `createOpenAI({ apiKey, fetch, headers })` and retain it on the handler instance.
3. Optionally issue a lightweight `openai.responses.create` probe with a tiny prompt to validate credentials and model availability.

If warm start fails we throw during registry resolution so `tutopanda query|edit` can abort early with a descriptive error message.

### Invocation Flow

1. **Load & Validate Config**  
   ```ts
   const cfg = parseOpenAiConfig(job.context.providerConfig);
   const inputs = job.context.extras?.resolvedInputs ?? {};
   ```

2. **Render Prompts**  
   - Substitute placeholders in `cfg.systemPrompt` (and optional `cfg.userPrompt`) using `cfg.variables`.
   - Missing variables fall back to `""` and log a warning via the injected logger.

3. **Build Responses API Payload**  
   ```ts
   const request = {
     model: job.model,
     input: [
       { role: 'system', content: render(cfg.systemPrompt, cfg.variables, inputs) },
       cfg.userPrompt ? { role: 'user', content: render(cfg.userPrompt, cfg.variables, inputs) } : null,
     ].filter(Boolean),
     response_format: cfg.responseFormat.type === 'json_schema'
       ? { type: 'json_schema', json_schema: cfg.responseFormat.schema }
       : { type: 'text' },
     temperature: cfg.temperature,
     max_output_tokens: cfg.maxOutputTokens,
     presence_penalty: cfg.presencePenalty,
     frequency_penalty: cfg.frequencyPenalty,
   };
   ```

4. **Invoke OpenAI Responses API**  
   ```ts
   const client = await ensureClient();              // createOpenAI(...)
   const response = await client.responses.create(request);
   const primaryOutput = response.output_text ?? '';
   const parsed = cfg.responseFormat.type === 'json_schema'
     ? safeParseJson(primaryOutput)
     : { text: primaryOutput };
   ```
   Capture telemetry (duration, token usage) from `response.usage` for diagnostics.

5. **Map JSON → Artefacts**  
   - Iterate `cfg.artefactMapping` and pull values with a helper (`readPath(parsed, mapping.field)`).
   - Emit a `ProducedArtefact` per mapping:
     - `inline` payload for text/JSON snippets.
     - `blob` payload for larger data, converting to `Uint8Array` and tagging `mimeType`.
     - Use `mapping.statusField` to override status when the schema includes per-output flags.
   - Missing fields mark the artefact as `failed` and add diagnostics.

6. **Return ProviderResult**  
   ```ts
   const status = artefacts.some((a) => a.status === 'failed') ? 'failed' : 'succeeded';
   return {
     jobId: job.jobId,
     status,
     artefacts,
     diagnostics: {
       provider: 'openai',
       model: job.model,
       responseId: response.id,
       usage: response.usage,
     },
   };
   ```

### Pseudo Code

```ts
import { createOpenAI } from '@ai-sdk/openai';
import type { ProviderHandler, ProviderJobContext, ProviderResult } from '../../types.js';

export function createOpenAiLLMHandler(descriptor: ProviderDescriptor, deps: HandlerDeps): ProviderHandler {
  let client: ReturnType<typeof createOpenAI> | null = null;

  async function ensureClient() {
    if (client) return client;
    const apiKey = await deps.secretResolver.getSecret('OPENAI_API_KEY');
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is required for OpenAI provider.');
    }
    client = createOpenAI({
      apiKey,
      headers: deps.extraHeaders,
      fetch: deps.fetchWrapper,
    });
    return client;
  }

  return {
    kind: descriptor.kind,
    provider: 'openai',
    model: descriptor.model,
    environment: descriptor.environment ?? 'cloud',
    mode: deps.mode,

    async warmStart() {
      await ensureClient();
    },

    async invoke(job: ProviderJobContext): Promise<ProviderResult> {
      const cfg = parseOpenAiConfig(job.context.providerConfig);
      const inputs = job.context.extras?.resolvedInputs ?? {};
      const systemPrompt = renderTemplate(cfg.systemPrompt, cfg.variables, inputs);
      const userPrompt = cfg.userPrompt
        ? renderTemplate(cfg.userPrompt, cfg.variables, inputs)
        : undefined;

      const openai = await ensureClient();
      const response = await openai.responses.create({
        model: job.model,
        input: [
          { role: 'system', content: systemPrompt },
          userPrompt ? { role: 'user', content: userPrompt } : null,
        ].filter(Boolean),
        response_format: cfg.responseFormat.type === 'json_schema'
          ? { type: 'json_schema', json_schema: cfg.responseFormat.schema }
          : { type: 'text' },
        temperature: cfg.temperature,
        max_output_tokens: cfg.maxOutputTokens,
        presence_penalty: cfg.presencePenalty,
        frequency_penalty: cfg.frequencyPenalty,
      });

      const parsed = cfg.responseFormat.type === 'json_schema'
        ? safeParseJson(response.output_text ?? '{}')
        : { text: response.output_text ?? '' };

      const artefacts = cfg.artefactMapping.map((mapping) => {
        const value = readPath(parsed, mapping.field);
        if (value === undefined) {
          return {
            artefactId: mapping.artefactId,
            status: 'failed',
            diagnostics: { reason: 'missing_field', field: mapping.field },
          };
        }
        if (mapping.output === 'blob') {
          return {
            artefactId: mapping.artefactId,
            status: 'succeeded',
            blob: {
              mimeType: mapping.mediaType ?? 'application/json',
              data: toUint8Array(value),
            },
          };
        }
        return {
          artefactId: mapping.artefactId,
          status: 'succeeded',
          inline: typeof value === 'string' ? value : JSON.stringify(value, null, 2),
        };
      });

      const status = artefacts.some((a) => a.status === 'failed') ? 'failed' : 'succeeded';
      return {
        jobId: job.jobId,
        status,
        artefacts,
        diagnostics: {
          provider: 'openai',
          model: job.model,
          responseId: response.id,
          usage: response.usage,
        },
      };
    },
  };
}
```

### Error Handling & Retries

- Wrap the invocation with shared retry helpers that back off on `429` and `5xx` responses. If retries exhaust, throw a `ProviderFailure` flagged as retryable so the produce wrapper can attempt fallbacks.
- Validation errors (missing config, schema mismatch) return `status: 'failed'` with detailed diagnostics; they are not retried automatically.
- Include contextual telemetry in diagnostics (latency, prompt length, token usage) so the CLI/server can expose meaningful feedback to users.

This implementation demonstrates the full path from CLI-supplied configuration through warm start, prompt rendering, JSON-schema based invocation, and artefact materialisation, ensuring the OpenAI provider can be delivered without additional glue code in the CLI.
