 Executive Summary

  The Tutopanda system uses a sophisticated graph-based execution pipeline with 7+ different naming conventions that transform as
  values flow from TOML blueprints through to provider execution. While the architecture is well-separated (CLI → Core →
  Providers), the naming complexity creates significant cognitive overhead and makes the system harder to debug and maintain.

  ---
  End-to-End Value Propagation Flow

  1. Entry Point (cli/src/commands/query.ts)

  - Loads blueprint: image-only.toml
- Loads inputs: inputs.yaml
  - Calls generatePlan() then executeBuild()

  2. Blueprint Loading (cli/src/lib/blueprint-loader/)

  Functions:
  - loadBlueprintFromToml() - Recursively loads sub-blueprints
  - parseBlueprintToml() - Converts TOML to Blueprint objects
  - flattenBlueprint() - Merges parent/child blueprints with namespacing
  - resolveEdges() - Converts string references to structured node refs

  Naming transformation:
  TOML: "InquiryPrompt" → Parsed: {kind: 'InputSource', id: 'InquiryPrompt'}
  TOML: "ScriptGeneration.NarrationScript" → {kind: 'Artifact', id: 'ScriptGeneration.NarrationScript'}

  Key issue: InputSource nodes are NOT namespaced (global inputs), but all other nodes are. This creates asymmetric handling
  throughout the codebase.

  3. Input Loading (cli/src/lib/input-loader.ts)

- Parses inputs.yaml
  - Returns flat map: {InquiryPrompt: "Tell me about...", Duration: 30, ...}
  - Extracts expansion config: {segmentCount: 3, imagesPerSegment: 1}

  4. Blueprint Expansion (core/src/blueprints.ts)

  Functions:
  - expandBlueprint() - Creates node instances based on cardinality
  - expandNodeInstances() - Generates dimensional instances
  - formatInstanceKey() - Creates instance keys with dimension suffixes

  Naming transformation:
  single:         "Producer:ScriptProducer" (index: {})
  perSegment:     "Producer:ImagePromptProducer[segment=0]" (index: {segment: 0})
  perSegmentImage: "Producer:TextToImageProducer[segment=0][image=0]" (index: {segment: 0, image: 0})

  Key issue: O(N*M) instance explosion for perSegmentImage, even for inactive nodes.

  5. Producer Graph Creation (core/src/planner.ts)

  Functions:
  - createProducerGraph() - Builds dependency graph
  - collectInputDependencies() - Finds upstream nodes
  - buildInputAliasMap() - Maps input names to artifact sources
  - canonicalizeInputs() - Converts to canonical format

  Naming transformation:
  "InputSource:InquiryPrompt" → "Input:InquiryPrompt"
  "Artifact:ScriptGeneration.NarrationScript[segment=0]" → (unchanged)

  Key issue: Complex input alias system creates multiple levels of indirection. Blueprint edges use input names (e.g.,
  "NarrativeText"), but runtime needs full artifact IDs.

  6. Execution Planning (core/src/planner.ts)

  Functions:
  - computePlan() - Creates execution plan
  - determineDirtyInputs() - Finds changed inputs
  - propagateDirtyJobs() - Cascades dirty flags downstream
  - buildExecutionLayers() - Topological sort for parallel execution

  Key issue: All-or-nothing dirty propagation. Changing one input invalidates entire downstream graph, no partial re-execution.

  7. Job Execution (core/src/runner.ts)

  Functions:
  - execute() - Runs plan layer by layer
  - executeJob() - Runs individual jobs
  - resolveArtifactsFromEventLog() - Loads artifact values
  - mergeResolvedArtifacts() - Builds resolvedInputs map

  Resolved inputs example:
  {
    "NarrativeText": "Napoleon was a military genius...",
    "ScriptGeneration.NarrationScript": "Napoleon was a military genius...",  // Dual representation!
    "OverallSummary": "Documentary about Napoleon...",
    "ImageStyle": "Ghibli"
  }

  Key issue: Artifacts stored with BOTH short name ("NarrativeText") AND full ID. Providers can use either key, creating
  confusion.

  8. Provider Invocation (cli/src/lib/build.ts → providers/)

  Functions:
  - createProviderProduce() - Wraps provider calls and pipes logging
  - buildProviderContext() - Packages configuration + resolvedInputs
  - Provider invoke() - Processes request
  - buildArtefactsFromResponse() - Maps JSON to artifacts

  Naming transformation (THE MOST FRAGILE):
  Artifact ID: "MovieTitle" → JSON field: "movieTitle" (PascalCase → camelCase)
  JSON field: "narrationScript" → Artifact: "NarrationScript" (camelCase → PascalCase)

  Key issue: IMPLICIT naming convention - breaks if not followed, no compile-time validation. Array artifacts automatically split
  into dimensional artifacts based on position.

  ---
  Naming Strategy: 7 Different Formats

  | Layer              | Format             | Example                                                |
  |--------------------|--------------------|--------------------------------------------------------|
  | TOML               | Plain/dot notation | "InquiryPrompt", "ScriptGeneration.NarrationScript"    |
  | Parsed Node        | {kind, id}         | {kind: 'InputSource', id: 'InquiryPrompt'}             |
  | Node Key           | Kind:id            | "InputSource:InquiryPrompt"                            |
  | Instance Key       | Kind:id[dims]      | "Producer:ImagePromptProducer[segment=0]"              |
  | Canonical Input    | Input:id           | "Input:InquiryPrompt"                                  |
  | Canonical Artifact | Artifact:id[dims]  | "Artifact:ScriptGeneration.NarrationScript[segment=0]" |
  | JSON Field         | camelCase          | "inquiryPrompt", "narrationScript"                     |

  ---
  Top 10 Issues Identified

  1. Naming Complexity ⚠️ CRITICAL

  - 7+ transformation functions: normalizeInputId, stripDimensions, extractArtifactKind, formatResolvedKey, etc.
  - Hard to trace values through system
  - Error-prone transformations

  2. Implicit JSON Mapping ⚠️ CRITICAL

  const fieldName = toCamelCase(kindBase);  // "MovieTitle" → "movieTitle"
  const fieldValue = response[fieldName];   // Magic!
  - Fragile, breaks silently
  - Not visible in blueprint
  - No validation

  3. Dual Artifact Representation ⚠️ HIGH

  resolvedByKind.set("NarrationScript", value);  // Short name
  resolvedById.set("ScriptGeneration.NarrationScript[segment=0]", value);  // Full ID
  - Providers can use either key
  - Confusing which to use
  - Duplicate storage

  4. InputSource Namespace Exception ⚠️ HIGH

  const namespacedRef = node.ref.kind === 'InputSource'
    ? node.ref  // No namespace!
    : prefixNodeRef(node.ref, subRef.id);
  - Asymmetric handling
  - Special cases scattered everywhere

  5. Complex Input Aliasing ⚠️ MEDIUM

  - Multiple levels of indirection (NarrativeText → ScriptGeneration.NarrationScript)
  - Alias resolution happens at multiple points
  - Hard to debug

  6. Eager Instance Expansion ⚠️ MEDIUM

  - Creates O(N*M) instances even if inactive
  - Memory overhead for large graphs

  7. All-or-Nothing Dirty Propagation ⚠️ MEDIUM

  - Changing one input invalidates entire downstream
  - Wasteful for expensive operations

  8. Array Auto-Splitting ⚠️ LOW

  - Arrays automatically become dimensional artifacts
  - Position-based (array index = segment index)
  - No way to produce single array artifact

  9. Edge Dimension Matching ⚠️ LOW

  - Subtle behavior (empty dims = broadcast, missing dim = ignore)
  - Hard to debug connectivity issues

  10. No Runtime Cycle Detection ⚠️ LOW

  - Only checks circular sub-blueprint loading
  - Runtime cycles possible

  ---
  Simplification Opportunities

  🎯 High Impact, Low-Medium Effort

  1. Unified Naming Scheme

  Use single format: {Kind}:{Namespace}.{Name}[dimensions]
  - Eliminates 80% of transformation functions
  - Clearer tracing

  2. Explicit Output Mapping in TOML

  [producers.outputMapping]
  MovieTitle = "movieTitle"
  NarrationScript = "narrationScript[]"  # [] = array split
  - No magic conventions
  - Self-documenting
  - Validation possible

  3. Namespace Everything (including InputSource)

  - Consistent handling
  - Eliminates special cases
  - Better scoping

  🎯 Medium Impact, Higher Effort

  4. Job-Level Input Hashing

  - Hash inputs per job instead of global dirty flags
  - Finer-grained invalidation
  - Better caching

  5. Lazy Node Instantiation

  - Create instances on-demand
  - Reduced memory overhead
  - Faster planning

  6. Explicit Aliases in Blueprint

  [nodes.inputs]
  NarrativeText = "ScriptGeneration.NarrationScript"  # Explicit!

  ---
  Key Files Reference

  Blueprint Processing

  - cli/src/lib/blueprint-loader/loader.ts - Recursive loading
  - cli/src/lib/blueprint-loader/toml-parser.ts - TOML parsing
  - core/src/blueprint-loader/flattener.ts - Namespace merging
  - core/src/blueprint-loader/resolver.ts - Edge resolution

  Execution

  - core/src/blueprints.ts - Instance expansion
  - core/src/planner.ts - Graph building, dirty tracking
  - core/src/runner.ts - Job execution
  - core/src/artifact-resolver.ts - Artifact loading

  Providers

  - cli/src/lib/build.ts - Provider integration
  - providers/src/producers/llm/openai.ts - OpenAI producer
  - providers/src/sdk/openai/artefacts.ts - JSON↔Artifact mapping

  ---
  Recommendations

  Phase 1: Quick Wins (1-2 weeks)

  1. Add explicit output mapping to producer configs
  2. Document naming transformations
  3. Add validation for JSON field mappings

  Phase 2: Structural Improvements (3-4 weeks)

  1. Unify naming scheme to single canonical format
  2. Namespace InputSource nodes for consistency
  3. Implement job-level input hashing

  Phase 3: Performance (2-3 weeks)

  1. Lazy node instantiation
  2. Optimize artifact resolution
  3. Add runtime cycle detection

  ---
  Would you like me to:
  1. Create a detailed implementation plan for any of these simplifications?
  2. Fix specific bugs you're currently experiencing?
  3. Add documentation explaining the current flow?
  4. Create visualization diagrams of the value propagation?
