# TOML configuration

I want to rehaul and consolidate all the provider, blueprint, llm settings into TOML file. All configuration will happen through these TOML files. I created some sample TOML files to describe what the desired interface is.

- We will define building blocks that describes producers (sub blueprints) with their inputs and outputs and their graph. You can see 2 examples of these here:
    - Script Generator -> `cli/blueprints/script-generate.toml`
    - Audio Generator -> `cli/blueprints/audio-generate.toml`
- And then we will stitch these sub blueprints in another TOML file to define and end to end blueprint. 
    - End to end blueprint -> `cli/blueprints/audio-only.toml`

Using the above, it should be possible to expand this to a fully expanded graph:
    - subBlueprints will get expanded into graphs with the lower level graphs with node types of inputRef, producerRef and outputRef
    - Introduced a notation to be able to create the right edges (connections) into the subBlueprints
E.g.:
``` 
{ from = "ScriptGeneration.NarrationScript", to = "AudioGeneration.TextInput", perSegment = true },
```
This above connects the output of ScriptGeneration called NarrationScript to the input of the AudioGeneration called TextInput and it needs to do it for an array of segments (perSegment = true)

Ultimately this should replace various scattered definitions in the current system which is very messy.
- Currently blueprints are defined in JSON files or in the codebase in the core package. 
- The provider configurations are in JSON files and the LLM settings are in TOML files. 

# Implementation Plan

We only care about the new TOML pipeline. No legacy sections, ports, or JSON blueprints need to survive. The plan below keeps everything in the CLI and uses the sample files (`audio-only.toml`, `script-generate.toml`, `audio-generate.toml`) as the MVP, then removes every hard-coded graph/type so the blueprint files are the single source of truth.

## Phase 1 — Execute the audio-only TOML graph end-to-end
1. **TOML ingestion hardening**
   - Keep `parseBlueprintToml` / `loadBlueprintFromToml` but add strict validation:
     - Check `meta`, `inputs`, `outputs`, `graph.nodes`, `graph.edges`, `graph.subBlueprints`, `[[producers]]`.
     - Resolve sub-blueprints recursively and fail fast when edges reference unknown nodes or namespaces.
     - Expose each blueprint’s producer configs (provider/model/settings/prompts) to callers.
   - Introduce an inputs parser that reads `[inputs]` from a separate TOML file, validates required fields against the active blueprint, and hands the resulting map to the planner.
2. **Single flattener in core**
   - Delete `core/src/blueprints.ts`’s legacy `flattenBlueprint`. Re-export `core/src/blueprint-loader/flattener.ts` as the only implementation.
   - Teach the flattener to resolve edge refs by looking them up in the actual node table, not through heuristics (`detectNodeKind` should disappear once nodes are validated).
3. **Planner runtime intake**
   - Update `expandBlueprint` / `createProducerGraph` so they accept a fully flattened `Blueprint` (nodes/edges/cardinality/conditions) rather than the hand-built `GraphBlueprint`.
   - Remove the section registry and helpers (`core/src/blueprints/*`, `GraphBlueprint`, `BlueprintSection`, ports).
4. **Dynamic identifiers**
   - Relax `InputSourceKind`, `ArtifactKind`, `ProducerKind`, and `ConditionKey` in `core/src/types.ts` to plain `string` types.
   - Update planner, manifest, providers, and schema modules to stop enumerating specific IDs.
   - Replace `InputValuesSchema` with a runtime-generated schema derived from the active blueprint’s `[[inputs]]`, so hashing only accepts what the blueprint declares.
5. **Planner wiring in the CLI**
   - Plumb a `blueprintPath` flag (default `cli/blueprints/audio-only.toml`) into `query` / `plan`.
   - Load + flatten the TOML blueprint (including subgraphs) before invoking the planner, and pass that graph into `createProducerGraph`.
   - Delete `createProducerGraphFromConfig`, JSON custom blueprint loaders, and any other code that references the old graph.

Deliverable: `tutopanda query ... --using-blueprint cli/blueprints/audio-only.toml` produces a valid plan using only TOML-defined graphs.

## Phase 2 — Producer catalog + provider settings driven by blueprints
1. **Producer discovery**
   - Scan flattened nodes for `ref.kind === 'Producer'` to derive the set of producer IDs the plan cares about. Delete `KNOWN_PRODUCERS`.
2. **Blueprint defaults**
   - Use the TOML `[[producers]]` array to seed provider/model/settings/prompt defaults for each producer.
   - When building the catalog, merge CLI settings overrides by matching producer names; error if a blueprint producer has no matching provider data after merges.
3. **Provider overrides & attachments**
   - Allow CLI settings to attach additional config files (TOML/JSON/text) per producer, keeping the existing attachment plumbing but keyed by blueprint producer ID.
4. **Docs**
   - Update provider settings documentation to reference blueprint producer names instead of section IDs.

## Phase 3 — Developer ergonomics (commands + docs)
1. **Blueprint CLI commands**
   - Rebuild `tutopanda blueprints:list|describe|validate` to work on TOML files:
     - `list` enumerates `.toml` files, printing `meta` + declared inputs/outputs.
     - `describe <path>` prints nodes, edges, conditions, producers, and sub-blueprints.
     - `validate <path>` runs the loader + flattener + schema checks, returning structured errors.
2. **Documentation + samples**
   - Document the TOML schema (meta/inputs/outputs/graph/producers) with the sample files as canonical references.
   - Remove every mention of sections/ports/custom JSON blueprints from CLI docs, provider docs, and design notes.
   - Provide a “how to build your own blueprint” walkthrough based on the audio-only example.

## Phase 4 — Cleanup + future-proofing
1. **Code pruning**
   - Remove unused helpers/tests tied to the old blueprint system (port composer, validation, etc.).
   - Delete hard-coded constants (input IDs, artefact IDs, condition keys) from schemas/tests that no longer apply.
2. **Testing**
   - Add unit tests covering:
     - TOML parsing and flattening (including nested sub-blueprints and dot-notation edges).
     - Planner + producer-graph generation with arbitrary node IDs.
     - Provider catalog assembly when blueprints introduce new producers.
3. **Extensibility hooks**
   - Ensure blueprint-defined inputs can declare cardinality/datatypes that the CLI validates dynamically.
   - Allow future blueprints to introduce their own conditional flags without hard-coded knowledge in core.

At completion, the TOML blueprints in `cli/blueprints/` are the only way graphs are defined, the CLI consumes them directly, and core treats every node/edge/producer/input as data rather than code.
