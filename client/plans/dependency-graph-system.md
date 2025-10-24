# Dependency Graph System for Smart Lecture Regeneration

## Overview
Build a dependency graph system that tracks relationships between configurations, generated content, and assets. When users make changes, mark affected nodes as "dirty" and regenerate only the dirty nodes and their downstream dependencies using a single executor function.

## Core Principles

1. **Dirty Flag Propagation**: Changes mark nodes dirty, which automatically propagates to all downstream dependencies
2. **Unit Testable Core**: All graph algorithms (traversal, dirty marking, topological sort) are pure functions with extensive unit test coverage
3. **Single Executor Pattern**: One Inngest function executes the regeneration plan instead of multiple specialized functions
4. **Non-Breaking Changes**: Build alongside existing system without modifying current Inngest functions
5. **Simple Storage**: Store graph as JSONB in existing `video_lectures` table

## 1. Database Schema Changes

### Update `video_lectures` table
```sql
ALTER TABLE video_lectures
ADD COLUMN dependency_graph JSONB;

CREATE INDEX idx_video_lectures_dependency_graph
ON video_lectures USING GIN (dependency_graph);
```

No separate table needed - keeps queries simple without joins.

## 2. Dependency Graph Structure

### TypeScript Types (`/client/src/types/dependency-graph.ts`)

```typescript
// Node types from the diagram
type NodeType =
  // User configurations (pink in diagram)
  | 'config:user-prompt'
  | 'config:system-prompt'
  | 'config:duration'
  | 'config:audience'
  | 'config:num-segments'
  | 'config:images-per-segment'
  | 'config:image-style'
  | 'config:size-aspect-ratio'
  | 'config:use-video'
  | 'config:assembly-strategy'

  // LLM/Model calls (circles in diagram)
  | 'llm:script-generation'
  | 'llm:video-summary'
  | 'llm:music-prompt'
  | 'llm:image-prompt'     // per segment, per image
  | 'llm:video-prompts'    // per segment (starting image + movie directions)

  // Generated content/assets (blue in diagram)
  | 'content:video-summary'
  | 'content:video-title'
  | 'content:script'
  | 'content:music-prompt'
  | 'content:starting-image-prompt'
  | 'content:image-prompt'
  | 'content:movie-direction-prompt'

  // Asset generation (model providers)
  | 'asset:starting-image'
  | 'asset:image'
  | 'asset:video'
  | 'asset:narration'
  | 'asset:music'

  // Assembler
  | 'assembler:timeline';

type NodeStatus = 'clean' | 'dirty' | 'generating' | 'failed' | 'pending';

interface DependencyNode {
  id: string;                    // e.g., "llm:image-prompt:segment[0]:image[1]"
  type: NodeType;
  category: 'config' | 'llm' | 'content' | 'asset' | 'assembler';

  // Cardinality tracking
  segmentIndex?: number;         // For segment-specific nodes
  itemIndex?: number;            // For multi-item nodes (e.g., images per segment)

  // Dependencies
  dependsOn: string[];           // IDs of nodes this depends on

  // Model provider tracking (for LLM and asset nodes)
  modelProvider?: string;        // e.g., "openai:gpt-4", "replicate:flux-1.1-pro"

  // Asset reference
  assetId?: string;              // Links to actual asset (image.id, video.id, etc.)

  // State tracking
  status: NodeStatus;
  isDirty: boolean;

  // Timestamps
  lastGenerated?: string;
  lastModified?: string;
}

interface DependencyGraph {
  lectureId: number;
  version: number;               // For optimistic locking
  nodes: Record<string, DependencyNode>;  // Map of nodeId -> node
  createdAt: string;
  updatedAt: string;
}

interface RegenerationStep {
  nodeId: string;
  node: DependencyNode;
  order: number;                 // Topological order
}

interface RegenerationPlan {
  steps: RegenerationStep[];
  totalSteps: number;
  affectedSegments: number[];    // Which segments will be regenerated
}
```

### Node ID Convention
- Config: `config:user-prompt`, `config:duration`, etc.
- Script generation: `llm:script-generation`
- Per-segment content: `content:script:segment[0]`, `content:script:segment[1]`
- Per-segment, per-item: `llm:image-prompt:segment[0]:image[0]`, `asset:image:segment[0]:image[1]`
- Video path: `llm:video-prompts:segment[0]`, `asset:starting-image:segment[0]`, `asset:video:segment[0]`
- Narration: `asset:narration:segment[0]`
- Music: `llm:music-prompt`, `asset:music`
- Timeline: `assembler:timeline`

## 3. Core Graph Algorithms (Pure Functions)

All functions in `/client/src/lib/dependency-graph/` - fully unit testable.

### Graph Builder (`builder.ts`)
```typescript
/**
 * Builds a complete dependency graph from lecture data and configuration
 * Pure function - no side effects
 */
function buildDependencyGraph(
  lecture: LectureContent,
  config: LectureConfig
): DependencyGraph

/**
 * Creates dependency relationships based on the diagram
 * Handles useVideo conditional logic
 * Handles cardinality (n segments, m images per segment)
 */
function buildNodeDependencies(
  nodeId: string,
  nodeType: NodeType,
  config: LectureConfig,
  segmentIndex?: number,
  itemIndex?: number
): string[]
```

### Dirty Propagation (`dirty-propagation.ts`)
```typescript
/**
 * Marks a node and all downstream dependencies as dirty
 * Pure function - returns new graph
 */
function markDirty(
  graph: DependencyGraph,
  nodeId: string
): DependencyGraph

/**
 * Marks multiple nodes dirty (batch operation)
 */
function markMultipleDirty(
  graph: DependencyGraph,
  nodeIds: string[]
): DependencyGraph

/**
 * Gets all dirty nodes in the graph
 */
function getDirtyNodes(
  graph: DependencyGraph
): DependencyNode[]

/**
 * Clears dirty flag after successful regeneration
 */
function clearDirty(
  graph: DependencyGraph,
  nodeId: string
): DependencyGraph

/**
 * Finds all downstream dependents of a node
 */
function findDownstreamNodes(
  graph: DependencyGraph,
  nodeId: string
): string[]
```

### Regeneration Planner (`planner.ts`)
```typescript
/**
 * Creates a topologically sorted regeneration plan from dirty nodes
 * Pure function
 */
function createRegenerationPlan(
  graph: DependencyGraph
): RegenerationPlan

/**
 * Topological sort ensuring dependencies are regenerated first
 */
function topologicalSort(
  nodes: DependencyNode[],
  graph: DependencyGraph
): DependencyNode[]

/**
 * Validates that plan is executable (no circular dependencies)
 */
function validatePlan(
  plan: RegenerationPlan
): { valid: boolean; errors: string[] }
```

### Graph Queries (`queries.ts`)
```typescript
/**
 * Find nodes by type
 */
function findNodesByType(
  graph: DependencyGraph,
  type: NodeType
): DependencyNode[]

/**
 * Find nodes for specific segment
 */
function findNodesForSegment(
  graph: DependencyGraph,
  segmentIndex: number
): DependencyNode[]

/**
 * Get node by ID
 */
function getNode(
  graph: DependencyGraph,
  nodeId: string
): DependencyNode | undefined

/**
 * Check if node exists
 */
function hasNode(
  graph: DependencyGraph,
  nodeId: string
): boolean
```

### Change Handlers (`change-handlers.ts`)
```typescript
/**
 * Handles script segment edit (narration text change)
 * Returns updated graph with dirty flags
 */
function handleScriptEdit(
  graph: DependencyGraph,
  segmentIndex: number,
  field: 'narration' | 'backgroundMusic' | 'effect',
  newValue: string
): DependencyGraph

/**
 * Handles prompt edit for images/videos
 */
function handlePromptEdit(
  graph: DependencyGraph,
  nodeId: string,
  newPrompt: string
): DependencyGraph

/**
 * Handles configuration change
 * Propagates to all dependent nodes
 */
function handleConfigChange(
  graph: DependencyGraph,
  configKey: string,
  newValue: unknown
): DependencyGraph

/**
 * Handles model provider change
 */
function handleModelChange(
  graph: DependencyGraph,
  nodeId: string,
  newModel: string
): DependencyGraph

/**
 * Handles segment count change (add/remove segments)
 * Rebuilds graph to adjust cardinality
 */
function handleSegmentCountChange(
  graph: DependencyGraph,
  lecture: LectureContent,
  config: LectureConfig
): DependencyGraph
```

## 4. Graph Executor

### Executor (`/client/src/lib/dependency-graph/executor.ts`)
```typescript
/**
 * Executes regeneration plan by dispatching to appropriate generators
 * This is the orchestrator that replaces individual Inngest functions
 */
async function executeRegenerationPlan(
  lectureId: number,
  graph: DependencyGraph,
  plan: RegenerationPlan,
  context: {
    userId: string;
    runId: string;
    logger: Logger;
    onProgress?: (step: number, total: number, message: string) => Promise<void>;
  }
): Promise<DependencyGraph>

/**
 * Executes a single step in the plan
 */
async function executeStep(
  step: RegenerationStep,
  lectureId: number,
  context: ExecutionContext
): Promise<{
  success: boolean;
  assetId?: string;
  error?: Error;
}>

/**
 * Maps node type to actual generation function
 */
function getGeneratorForNode(
  node: DependencyNode
): GeneratorFunction
```

### Generator Functions (refactored from existing code)
These are the actual asset generation functions extracted from current Inngest functions:
- `generateScript()` - from create-lecture-script.ts
- `generateImagePrompt()` - from generate-segment-images.ts
- `generateImage()` - from generate-segment-images.ts
- `generateVideoPrompts()` - from generate-segment-videos.ts
- `generateStartingImage()` - from generate-segment-videos.ts
- `generateVideo()` - from generate-segment-videos.ts
- `generateNarration()` - from generate-narration.ts
- `generateMusicPrompt()` - from generate-music.ts
- `generateMusic()` - from generate-music.ts
- `assembleTimeline()` - from generate-timeline.ts (already exists as pure function)

## 5. Database Layer

### Repository (`/client/src/data/dependency-graph/repository.ts`)
```typescript
/**
 * Load graph from video_lectures.dependency_graph
 */
async function loadGraph(lectureId: number): Promise<DependencyGraph | null>

/**
 * Save graph with optimistic locking (version increment)
 */
async function saveGraph(graph: DependencyGraph): Promise<DependencyGraph>

/**
 * Create initial graph after first generation
 */
async function createGraph(
  lectureId: number,
  lecture: LectureContent,
  config: LectureConfig
): Promise<DependencyGraph>

/**
 * Update specific nodes in graph (atomic operation)
 */
async function updateGraphNodes(
  lectureId: number,
  updates: Partial<Record<string, Partial<DependencyNode>>>
): Promise<DependencyGraph>
```

## 6. New Inngest Function (Simplified)

### Single Regeneration Function (`/client/src/inngest/functions/regenerate-lecture-graph.ts`)

Replaces all individual regenerate-* functions with one unified executor:

```typescript
export const regenerateLectureGraph = inngest.createFunction(
  { id: "regenerate-lecture-graph" },
  { event: "app/regenerate-lecture" },
  async ({ event, publish, logger, step }) => {
    const { userId, runId, lectureId } = event.data;

    // Load graph
    const graph = await step.run("load-graph", async () => {
      return await loadGraph(lectureId);
    });

    // Create regeneration plan from dirty nodes
    const plan = await step.run("create-plan", async () => {
      return createRegenerationPlan(graph);
    });

    // Execute plan
    const updatedGraph = await step.run("execute-plan", async () => {
      return executeRegenerationPlan(lectureId, graph, plan, {
        userId,
        runId,
        logger,
        onProgress: async (step, total, message) => {
          await publishStatus(message, step, total);
        }
      });
    });

    // Save updated graph
    await step.run("save-graph", async () => {
      return saveGraph(updatedGraph);
    });

    return { runId, success: true };
  }
);
```

This single function replaces:
- `create-lecture-script` (for re-generation)
- `generate-segment-images` (for re-generation)
- `generate-segment-videos` (for re-generation)
- `generate-narration` (for re-generation)
- `generate-music` (for re-generation)
- `generate-timeline` (for re-generation)

**Note**: Keep existing functions for initial generation. Only use graph-based regeneration for updates.

## 7. Integration with Existing Workflow

### Initial Generation (`start-lecture-creation.ts`)
After successful first-time generation:
```typescript
// At the end of start-lecture-creation
await step.run("create-dependency-graph", async () => {
  const lecture = await getLectureById({ lectureId });
  const config = await getProjectSettings(userId);
  return await createGraph(lectureId, lecture, config);
});
```

All nodes start with `status: 'clean'`, `isDirty: false`.

### User Edits
When user edits in the UI:
1. Call appropriate change handler to mark nodes dirty
2. Save updated graph to database
3. Optionally trigger regeneration immediately or let user trigger manually

## 8. Unit Testing Strategy

### Test Coverage Requirements
- **Builder**: 100% coverage
  - Test graph construction with different configs
  - Test useVideo=true vs false paths
  - Test cardinality (1 segment, 5 segments, varying images per segment)
  - Test all dependency relationships match diagram

- **Dirty Propagation**: 100% coverage
  - Test marking single node dirty propagates correctly
  - Test marking multiple nodes
  - Test finding downstream nodes
  - Test clearing dirty flags

- **Planner**: 100% coverage
  - Test topological sort with various graphs
  - Test plan validation
  - Test detecting circular dependencies
  - Test empty plan (no dirty nodes)

- **Change Handlers**: 100% coverage
  - Test each type of edit (script, prompt, config, model)
  - Test segment count changes (add/remove)
  - Test batch edits

- **Queries**: 100% coverage
  - Test all query functions with various graph states

### Test Files
```
/client/src/lib/dependency-graph/__tests__/
  builder.test.ts
  dirty-propagation.test.ts
  planner.test.ts
  change-handlers.test.ts
  queries.test.ts
  integration.test.ts  // End-to-end graph scenarios
```

## 9. Implementation Phases

### Phase 1: Core Graph Infrastructure
- Database schema update (add dependency_graph column)
- TypeScript types
- Graph builder (handles all node types from diagram)
- Unit tests for builder
- Repository layer (save/load from DB)

### Phase 2: Graph Algorithms
- Dirty propagation algorithm
- Topological sort for regeneration planning
- Change handlers
- Query functions
- Comprehensive unit tests (aim for 100% coverage)

### Phase 3: Executor
- Extract generator functions from existing Inngest code
- Build executor that dispatches to generators
- Map node types to generators
- Progress tracking

### Phase 4: New Inngest Function
- Create `regenerate-lecture-graph` function
- Integrate with existing workflow (create graph after initial generation)
- Test regeneration scenarios

### Phase 5: Integration Testing
- End-to-end tests for common scenarios:
  - Edit script narration → regenerate narration + timeline
  - Edit image prompt → regenerate that image + timeline
  - Change image style config → regenerate all images + timeline
  - Change useVideo → rebuild graph + regenerate all visual assets
  - Edit segment count → rebuild graph + regenerate affected assets

### Phase 6: Migration Path
- Document how to transition from old functions to new graph-based system
- Provide migration script for existing lectures (build graphs retroactively)
- Keep old functions for backwards compatibility during transition

## 10. Example Scenarios

### Scenario 1: Edit Narration Text for Segment 2
```typescript
// User edits narration in segment 2
let graph = await loadGraph(lectureId);

// Mark dirty
graph = handleScriptEdit(graph, 2, 'narration', newNarrationText);

// Save
await saveGraph(graph);

// Trigger regeneration
await inngest.send({
  name: "app/regenerate-lecture",
  data: { userId, lectureId, runId }
});

// What regenerates:
// - content:script:segment[2] (script change)
// - asset:narration:segment[2] (depends on script)
// - assembler:timeline (depends on all narration assets)
```

### Scenario 2: Change Image Prompt for Segment 0, Image 1
```typescript
// User edits image prompt
let graph = await loadGraph(lectureId);

// Mark dirty
graph = handlePromptEdit(
  graph,
  'llm:image-prompt:segment[0]:image[1]',
  newPrompt
);

await saveGraph(graph);

// What regenerates:
// - llm:image-prompt:segment[0]:image[1] (prompt changed)
// - asset:image:segment[0]:image[1] (depends on prompt)
// - assembler:timeline (depends on all images)
//
// Does NOT regenerate:
// - Other images for segment 0
// - Any other segment's assets
```

### Scenario 3: Change Image Style from Ghibli to Pixar
```typescript
// User changes global image style config
let graph = await loadGraph(lectureId);

// Mark dirty - propagates to ALL image nodes
graph = handleConfigChange(graph, 'image-style', 'Pixar');

await saveGraph(graph);

// What regenerates:
// - All llm:image-prompt:segment[*]:image[*] nodes
// - All asset:image:segment[*]:image[*] nodes
// - assembler:timeline
```

### Scenario 4: Toggle useVideo from false to true
```typescript
// User toggles useVideo config
let graph = await loadGraph(lectureId);
const lecture = await getLectureById(lectureId);
const config = await getProjectSettings(userId);

// This requires rebuilding the graph because the structure changes
graph = buildDependencyGraph(lecture, { ...config, general: { ...config.general, useVideo: true }});

// Mark all visual asset nodes as dirty
graph = markMultipleDirty(graph, [
  ...findNodesByType(graph, 'llm:video-prompts'),
  ...findNodesByType(graph, 'asset:starting-image'),
  ...findNodesByType(graph, 'asset:video'),
  'assembler:timeline'
]);

await saveGraph(graph);

// What regenerates:
// - All video-related prompts and assets (new nodes in graph)
// - Timeline with video clips instead of ken burns
```

## Key Benefits

1. **Simplified Architecture**: One regeneration function instead of many
2. **Precise Regeneration**: Only regenerate what changed and its dependencies
3. **Cost Savings**: Avoid redundant API calls to expensive LLM/media providers
4. **Testable**: Core algorithms are pure functions with comprehensive tests
5. **Transparent**: Users can see exactly what will regenerate
6. **Flexible**: Easy to add new node types or change dependencies
7. **Reliable**: Persisted graph state survives failures and can resume
8. **Non-Breaking**: Runs alongside existing system during development
