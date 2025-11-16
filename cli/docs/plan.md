1. Revamp Blueprint Parsing & Types
      - Align the TOML parser in cli/src/lib/blueprint-loader/toml-parser.ts:18-316 with the new spec (cli/docs/TOML-based-
        config.md:1-58): treat [[inputs]], [[artefacts]], [[outputs]], [[producers]], [[producers.sdkMapping]], and [[subBlueprints]]
        as first-class sections, parse countInput, itemType, and nested config tables (see cli/config/blueprints/script-generate.toml:41-71,
        image-generate.toml:30-59, audio-generate.toml:28-62).
      - Update core/src/types.ts:4-195 to model the new schema (distinct input/artefact/prod definitions, sdk mapping records, output
        metadata, universal node id type). Extend ProducerConfig to capture parsed sdkMapping and outputs.
      - Adjust cli/src/lib/blueprint-loader/loader.ts:24-109 so sub-blueprints use the new name/path fields, keep a registry of
        namespaces, and no longer expect the legacy graph.nodes. Validate during load that TOMLs in cli/config/blueprints already match the
        proposed format (e.g., cli/config/blueprints/image-only.toml:9-96).
  2. Implement Universal Node IDs & Dimension Expansion
      - Replace the current flattening logic in core/src/blueprint-loader/flattener.ts:32-178 with a builder that synthesizes
        canonical IDs of the form NodeType:Namespace.Name[indices] (per cli/docs/proposed.md:98-136).
      - Parse edge index placeholders like [i], [j] (cli/config/blueprints/image-only.toml:82-95) and map them to concrete counts using the
        source artefact’s countInput and live input values. Maintain a registry of dimension variables (doc cli/docs/proposed.md:152-
        185).
      - Collapse Input⇄Artefact pairs as described in cli/docs/TOML-based-config.md:33-51, ensuring the final graph only stores
        artefact IDs when data flows from producer to producer.
      - Update core/src/blueprints.ts:1-190 to expand producers/artefacts by enumerating every combination of dimension variables,
        producing job IDs like Producer:ImageGenerator[1][0].TextToImageProducer.
  3. Propagate Alias Metadata Through Planner & Runner
      - Rework core/src/planner.ts:100-520 so createProducerGraph records, for each job, the exact inputs (canonical IDs) plus a
        deterministic inputBindings map { alias: canonicalId }. This replaces the current heuristic aliasing (buildInputAliasMap/
        canonicalizeInputs).
      - Embed inputBindings, sdkMapping, and any producer output metadata into JobDescriptor.context (doc example cli/docs/
        proposed.md:98-112).
      - Simplify mergeResolvedArtifacts in core/src/runner.ts:410-455 to use those bindings instead of buildResolvedInputAliases/
        buildInputAliasIndex so resolved inputs are produced deterministically for both alias names and canonical IDs.
      - Update core/src/artifact-resolver.ts:18-138 and anywhere else that parses IDs to handle the new Artefact: prefix and multi-
        dimensional [i][j] notation while still accepting legacy Artifact: IDs for existing manifests/logs.
  4. Update CLI Planning/Build Pipeline
      - When generating a plan, feed actual input values into expansion so countInput values (e.g., cli/config/blueprints/script-
        generate.toml:53-59, image-prompt-generate.toml:41-55) drive the dimension math (cli/src/lib/planner.ts:98-204).
      - Persist the blueprint-provided inputBindings/sdkMapping in the plan output so cli/src/lib/build.ts:143-413 can merge them
        with global inputs when invoking providers. Ensure buildProviderContext now forwards these structures (probably under
        context.extras).
      - Verify all TOML blueprints under cli/config/blueprints/ either adopt the new format or are migrated as part of this work; update cli/        docs/TOML-based-config.md and cli/docs/proposed.md:144-218 once behavior matches the doc.
  5. Provider Runtime & SDK Support
      - Extend providers/src/sdk/runtime.ts:21-106 so resolved inputs can be addressed by canonical IDs and aliases, and surface
        request.context.sdkMapping / inputBindings via the runtime (e.g., runtime.inputs.getByNodeId(...)).
      - Introduce a shared helper (new module under providers/src/sdk/) that takes { resolvedInputs, sdkMapping } and produces the
        provider payload while validating required fields/types.
      - Update providers/src/sdk/openai/artefacts.ts:11-200 to accept a per-artefact mapping (likely derived from blueprint output
        definitions) instead of inferring camelCase from IDs. This lets us drop the fallback heuristics that currently guess JSON
        field names.
  6. Refactor Provider Implementations To Use Mapping
      - providers/src/producers/llm/openai.ts:16-115: use the new runtime helper to fetch input values, and provide
        buildArtefactsFromResponse with the explicit artefact→field map so IDs like Artefact:ScriptGenerator.NarrationScript[i] are
        resolved without guessing.
      - providers/src/producers/image/replicate-text-to-image.ts:24-249: delete resolvePrompt/buildReplicateInput heuristics and
        instead iterate the sdkMapping defined in cli/config/blueprints/image-generate.toml:53-56. Each job already represents a single (i,j)        combination, so the prompt value fetched via canonical ID is singular.
      - providers/src/producers/audio/replicate-audio.ts:20-199: drop resolveText/resolveVoice and use the new resolved-input helper
        plus the mapping from cli/config/blueprints/audio-generate.toml:56-59. Preserve the existing defaults/customAttributes merge but let
        mapping dictate which field to populate.
      - Leave plannerContext available only for diagnostics; business logic should rely purely on the universal IDs.
  7. Provider SDK Components & Diagnostics
      - Adjust Replicate helpers (providers/src/sdk/replicate) to accept pre-built payloads and only handle transport concerns (client        warm-up, output normalization).
      - Ensure diagnostics emitted by providers include the canonical node IDs they consumed/produced so artefact logs remain
        traceable under the new scheme.
  8. Testing, Back-Compat, & Docs
      - Update/extend unit tests across core (blueprint loader, expansion, planner, runner in core/src/**/*.test.ts) to cover multi-
        dimension graphs, node collapsing, and legacy-ID handling.
      - Refresh provider unit/integration tests (e.g., providers/tests/integration/openai.int.test.ts, replicate-audio.int.test.ts,
        replicate-music.int.test.ts) to assert that resolved inputs now come from the mapping and that SDK payloads match the TOML
        definitions.
      - Document the new workflow in cli/docs/TOML-based-config.md, cli/docs/proposed.md, and provider docs (providers/docs/replicate-        producer-sdk.md).
      - Manual verification: re-run representative flows (pnpm --filter tutopanda-core test, pnpm --filter tutopanda-providers test,
        pnpm --filter tutopanda-cli test) plus an end-to-end CLI run once the new IDs are in place.