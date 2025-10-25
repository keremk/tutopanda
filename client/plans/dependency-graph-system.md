# Dependency Graph System for Smart Lecture Regeneration (Vercel Workflow)

## Overview
Build a dependency graph system that tracks relationships between configurations, generated content, and assets. The graph is created and persisted BEFORE execution starts. A single unified workflow executor processes the graph, executing only dirty nodes and their dependencies. Uses Vercel Workflow for durable, retriable execution.

## Core Principles

1. **Graph-First Approach**: Dependency graph is created and persisted BEFORE any execution begins
2. **Unified Execution**: One `execute-plan` workflow handles both initial generation and regeneration
3. **Dirty Flag Propagation**: Changes mark nodes dirty, which automatically propagates to all downstream dependencies
4. **Durable Steps**: All external API calls (LLM, image generation, etc.) are `"use step"` functions with automatic retries
5. **Unit Testable Core**: All graph algorithms are pure functions with 100% test coverage
6. **Non-Breaking Migration**: Build alongside existing Inngest system with flag-based routing
7. **Simple Storage**: Store graph as JSONB in existing `video_lectures` table

## Architecture Comparison

### Old (Inngest-based)
```
User Request → Inngest Functions Chain → Assets Generated → No Graph
```

### New (Vercel Workflow + Graph)
```
User Request → Create Graph → Persist Graph → Execute Workflow → Update Graph with Asset IDs
User Edit → Mark Dirty → Execute Workflow (dirty nodes only) → Update Graph
```

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

type NodeStatus = 'pending' | 'clean' | 'dirty' | 'generating' | 'failed';

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

  // Asset reference - populated during execution
  assetId?: string;              // Links to actual asset (image.id, video.id, etc.)
  assetData?: any;               // The actual generated content/asset

  // State tracking
  status: NodeStatus;
  isDirty: boolean;

  // Error tracking
  error?: {
    message: string;
    code: string;
    retryCount: number;
  };

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
 * Builds a complete dependency graph from configuration BEFORE execution starts
 * Pure function - no side effects
 *
 * Initial generation: All nodes start with status='pending', isDirty=false
 * Regeneration: Loads existing graph, dirty flags already set
 */
function buildDependencyGraph(
  config: LectureConfig,
  numSegments: number  // Calculated from config.duration + config.segmentLength
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
 * Gets all dirty OR pending nodes in the graph
 * Pending = initial generation (never executed)
 * Dirty = regeneration (was clean, now needs re-execution)
 */
function getNodesToExecute(
  graph: DependencyGraph
): DependencyNode[]

/**
 * Clears dirty flag and sets status to 'clean' after successful execution
 */
function markClean(
  graph: DependencyGraph,
  nodeId: string,
  assetId?: string,
  assetData?: any
): DependencyGraph

/**
 * Marks node as failed with error info
 */
function markFailed(
  graph: DependencyGraph,
  nodeId: string,
  error: Error
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
 * Creates a topologically sorted execution plan from pending/dirty nodes
 * Pure function
 *
 * For initial generation: All nodes are pending, so full graph is executed
 * For regeneration: Only dirty nodes and their dependencies are executed
 */
function createExecutionPlan(
  graph: DependencyGraph
): RegenerationPlan

/**
 * Topological sort ensuring dependencies are executed first
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

/**
 * Get all config nodes
 */
function getConfigNodes(
  graph: DependencyGraph
): DependencyNode[]
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
  newNumSegments: number,
  config: LectureConfig
): DependencyGraph
```

## 4. Vercel Workflow Executor

### Main Workflow (`/client/src/workflows/execute-lecture-plan.ts`)

This single workflow replaces ALL existing Inngest generation functions.

```typescript
import { sleep } from 'workflow';
import { loadGraph, saveGraph, updateGraphNode } from '@/data/dependency-graph/repository';
import { createExecutionPlan } from '@/lib/dependency-graph/planner';
import { markClean, markFailed } from '@/lib/dependency-graph/dirty-propagation';
import * as generators from './steps/generators';

export async function executeLecturePlan(lectureId: number, userId: string) {
  'use workflow';

  // Load graph (created before workflow started)
  const graph = await loadGraph(lectureId);
  if (!graph) {
    throw new Error(`No dependency graph found for lecture ${lectureId}`);
  }

  // Create execution plan from pending/dirty nodes
  const plan = createExecutionPlan(graph);

  console.log(`Executing ${plan.totalSteps} steps for lecture ${lectureId}`);

  // Execute each step in topological order
  for (const step of plan.steps) {
    const { nodeId, node } = step;

    console.log(`Executing node: ${nodeId} (${node.type})`);

    try {
      // Update status to 'generating'
      await updateGraphNode(lectureId, nodeId, { status: 'generating' });

      // Execute the appropriate generator based on node type
      const result = await executeNode(node, graph, lectureId, userId);

      // Update graph with result
      let updatedGraph = markClean(graph, nodeId, result.assetId, result.data);
      await saveGraph(updatedGraph);

      console.log(`✓ Completed: ${nodeId}`);
    } catch (error) {
      console.error(`✗ Failed: ${nodeId}`, error);

      // Mark as failed
      let updatedGraph = markFailed(graph, nodeId, error as Error);
      await saveGraph(updatedGraph);

      // Propagate failure if non-retryable
      if (error instanceof FatalError) {
        throw error;
      }
    }
  }

  console.log(`Lecture plan execution complete: ${lectureId}`);
  return { lectureId, completedSteps: plan.totalSteps };
}

/**
 * Routes node to appropriate generator function
 * All generators are "use step" functions for retry/durability
 */
async function executeNode(
  node: DependencyNode,
  graph: DependencyGraph,
  lectureId: number,
  userId: string
): Promise<{ assetId?: string; data?: any }> {
  'use step';

  // Get dependencies' results from graph
  const dependencies = node.dependsOn.map(depId => {
    const depNode = graph.nodes[depId];
    return { nodeId: depId, data: depNode?.assetData };
  });

  // Route to appropriate generator
  switch (node.type) {
    case 'llm:script-generation':
      return await generators.generateScript(node, dependencies, lectureId, userId);

    case 'llm:image-prompt':
      return await generators.generateImagePrompt(node, dependencies, lectureId, userId);

    case 'asset:image':
      return await generators.generateImage(node, dependencies, lectureId, userId);

    case 'llm:video-prompts':
      return await generators.generateVideoPrompts(node, dependencies, lectureId, userId);

    case 'asset:starting-image':
      return await generators.generateStartingImage(node, dependencies, lectureId, userId);

    case 'asset:video':
      return await generators.generateVideo(node, dependencies, lectureId, userId);

    case 'asset:narration':
      return await generators.generateNarration(node, dependencies, lectureId, userId);

    case 'llm:music-prompt':
      return await generators.generateMusicPrompt(node, dependencies, lectureId, userId);

    case 'asset:music':
      return await generators.generateMusic(node, dependencies, lectureId, userId);

    case 'assembler:timeline':
      return await generators.assembleTimeline(node, dependencies, lectureId, userId);

    default:
      throw new Error(`Unknown node type: ${node.type}`);
  }
}
```

### Generator Steps (`/client/src/workflows/steps/generators.ts`)

All external API calls are `"use step"` functions with automatic retry/durability.

```typescript
/**
 * All generator functions follow this pattern:
 * 1. Receive node and dependencies
 * 2. Extract required data from dependencies
 * 3. Call external API (LLM, image provider, etc.)
 * 4. Store result in database/storage
 * 5. Return asset ID and data
 *
 * All are "use step" functions for automatic retry on failure
 */

export async function generateScript(
  node: DependencyNode,
  dependencies: Array<{ nodeId: string; data: any }>,
  lectureId: number,
  userId: string
): Promise<{ assetId: string; data: LectureScript }> {
  'use step';

  // Extract config from dependencies
  const userPrompt = findDependency(dependencies, 'config:user-prompt');
  const systemPrompt = findDependency(dependencies, 'config:system-prompt');
  // ... other config

  // Call LLM (automatically retriable on transient failures)
  const result = await streamText({
    model: openai(node.modelProvider || 'gpt-4'),
    system: systemPrompt,
    prompt: userPrompt,
    // ...
  });

  const script = await result.object;

  // Persist to database
  await updateLectureContent({
    lectureId,
    actorId: userId,
    payload: { script }
  });

  return {
    assetId: `script-${lectureId}`,
    data: script
  };
}

export async function generateImagePrompt(
  node: DependencyNode,
  dependencies: Array<{ nodeId: string; data: any }>,
  lectureId: number,
  userId: string
): Promise<{ data: string }> {
  'use step';

  const script = findDependency(dependencies, 'content:script');
  const imageStyle = findDependency(dependencies, 'config:image-style');
  const segmentIndex = node.segmentIndex!;

  // Call LLM to generate image prompt
  const prompt = await generatePromptFromSegment(
    script.segments[segmentIndex],
    imageStyle
  );

  return { data: prompt };
}

export async function generateImage(
  node: DependencyNode,
  dependencies: Array<{ nodeId: string; data: any }>,
  lectureId: number,
  userId: string
): Promise<{ assetId: string; data: ImageAsset }> {
  'use step';

  const prompt = findDependency(dependencies, `llm:image-prompt:segment[${node.segmentIndex}]:image[${node.itemIndex}]`);
  const sizeAspectRatio = findDependency(dependencies, 'config:size-aspect-ratio');

  // Call image provider (automatically retriable)
  const imageProvider = imageProviderRegistry.get(node.modelProvider);
  const imageUrl = await imageProvider.generate({
    prompt,
    aspectRatio: sizeAspectRatio,
    // ... other params
  });

  // Store image
  const storage = setupFileStorage();
  const storedPath = await storage.write(imageUrl, /* ... */);

  const imageAsset: ImageAsset = {
    id: generateId(),
    prompt,
    sourceUrl: storedPath,
    status: 'generated'
  };

  // Update lecture images array
  const lecture = await getLectureById({ lectureId });
  const images = [...(lecture.images || []), imageAsset];
  await updateLectureContent({
    lectureId,
    actorId: userId,
    payload: { images }
  });

  return {
    assetId: imageAsset.id,
    data: imageAsset
  };
}

export async function assembleTimeline(
  node: DependencyNode,
  dependencies: Array<{ nodeId: string; data: any }>,
  lectureId: number,
  userId: string
): Promise<{ assetId: string; data: Timeline }> {
  'use step';

  // Gather all assets from dependencies
  const images = findAllDependencies(dependencies, 'asset:image');
  const videos = findAllDependencies(dependencies, 'asset:video');
  const narrations = findAllDependencies(dependencies, 'asset:narration');
  const music = findDependency(dependencies, 'asset:music');
  const assemblyStrategy = findDependency(dependencies, 'config:assembly-strategy');

  // Assemble timeline (pure function from existing code)
  const timeline = assembleTimelineFromAssets({
    images,
    videos,
    narration: narrations,
    music: [music],
    runId: generateId(),
    strategy: assemblyStrategy
  });

  // Save timeline
  await updateLectureContent({
    lectureId,
    actorId: userId,
    payload: { timeline }
  });

  return {
    assetId: timeline.id,
    data: timeline
  };
}

// ... other generators (video, narration, music, etc.)

function findDependency(dependencies: Array<{ nodeId: string; data: any }>, pattern: string): any {
  const dep = dependencies.find(d => d.nodeId.includes(pattern));
  return dep?.data;
}

function findAllDependencies(dependencies: Array<{ nodeId: string; data: any }>, pattern: string): any[] {
  return dependencies.filter(d => d.nodeId.includes(pattern)).map(d => d.data);
}
```

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
 * Create initial graph from config BEFORE execution starts
 * All nodes start with status='pending', isDirty=false
 */
async function createGraph(
  lectureId: number,
  config: LectureConfig,
  numSegments: number
): Promise<DependencyGraph>

/**
 * Update specific node in graph (atomic operation)
 */
async function updateGraphNode(
  lectureId: number,
  nodeId: string,
  updates: Partial<DependencyNode>
): Promise<DependencyGraph>

/**
 * Mark nodes dirty and save
 */
async function markNodesDirty(
  lectureId: number,
  nodeIds: string[]
): Promise<DependencyGraph>
```

## 6. API Routes & Integration

### Create Lecture (`/client/src/app/api/lectures/create/route.ts`)

```typescript
import { start } from 'workflow/api';
import { executeLecturePlan } from '@/workflows/execute-lecture-plan';
import { createGraph } from '@/data/dependency-graph/repository';
import { calculateNumSegments } from '@/lib/lecture-utils';

export async function POST(request: Request) {
  const { userId, prompt, config } = await request.json();

  // Feature flag: use new graph-based system or old Inngest
  const useGraphSystem = process.env.USE_GRAPH_WORKFLOW === 'true';

  if (!useGraphSystem) {
    // Route to old Inngest system
    await inngest.send({
      name: 'app/start-lecture-creation',
      data: { userId, prompt, /* ... */ }
    });
    return Response.json({ message: 'Using legacy system' });
  }

  // NEW GRAPH-BASED SYSTEM

  // 1. Create lecture record
  const lecture = await createLecture({ userId, prompt, config });
  const lectureId = lecture.id;

  // 2. Calculate number of segments from config
  const numSegments = calculateNumSegments(config);

  // 3. Create dependency graph BEFORE execution starts
  const graph = await createGraph(lectureId, config, numSegments);
  console.log(`Created graph with ${Object.keys(graph.nodes).length} nodes`);

  // 4. Start workflow execution (async, non-blocking)
  await start(executeLecturePlan, [lectureId, userId]);

  return Response.json({
    lectureId,
    message: 'Lecture creation started',
    totalNodes: Object.keys(graph.nodes).length
  });
}
```

### Regenerate Lecture (`/client/src/app/api/lectures/[id]/regenerate/route.ts`)

```typescript
import { start } from 'workflow/api';
import { executeLecturePlan } from '@/workflows/execute-lecture-plan';
import { loadGraph } from '@/data/dependency-graph/repository';
import { getNodesToExecute } from '@/lib/dependency-graph/dirty-propagation';

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const lectureId = parseInt(params.id);
  const { userId } = await request.json();

  // Load existing graph (should have dirty flags already set by user edits)
  const graph = await loadGraph(lectureId);
  if (!graph) {
    return Response.json({ error: 'Graph not found' }, { status: 404 });
  }

  // Check what will be regenerated
  const nodesToExecute = getNodesToExecute(graph);
  console.log(`Will regenerate ${nodesToExecute.length} dirty nodes`);

  // Start workflow (same workflow, but only dirty nodes execute)
  await start(executeLecturePlan, [lectureId, userId]);

  return Response.json({
    lectureId,
    message: 'Regeneration started',
    dirtyNodes: nodesToExecute.length
  });
}
```

### Edit Lecture Content (`/client/src/app/api/lectures/[id]/edit/route.ts`)

```typescript
import { markNodesDirty } from '@/data/dependency-graph/repository';
import { handleScriptEdit, handlePromptEdit, handleConfigChange } from '@/lib/dependency-graph/change-handlers';
import { loadGraph, saveGraph } from '@/data/dependency-graph/repository';

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const lectureId = parseInt(params.id);
  const { editType, ...editData } = await request.json();

  let graph = await loadGraph(lectureId);
  if (!graph) {
    return Response.json({ error: 'Graph not found' }, { status: 404 });
  }

  // Apply edit and mark nodes dirty
  switch (editType) {
    case 'script':
      graph = handleScriptEdit(
        graph,
        editData.segmentIndex,
        editData.field,
        editData.newValue
      );
      break;

    case 'prompt':
      graph = handlePromptEdit(
        graph,
        editData.nodeId,
        editData.newPrompt
      );
      break;

    case 'config':
      graph = handleConfigChange(
        graph,
        editData.configKey,
        editData.newValue
      );
      break;

    default:
      return Response.json({ error: 'Unknown edit type' }, { status: 400 });
  }

  // Save updated graph with dirty flags
  await saveGraph(graph);

  const dirtyNodes = getNodesToExecute(graph);

  return Response.json({
    success: true,
    dirtyNodes: dirtyNodes.length,
    affectedNodeIds: dirtyNodes.map(n => n.id)
  });
}
```

## 7. Unit Testing Strategy

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
  - Test marking failed nodes

- **Planner**: 100% coverage
  - Test topological sort with various graphs
  - Test plan validation
  - Test detecting circular dependencies
  - Test empty plan (no dirty nodes)
  - Test partial plan (some dirty nodes)

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

### Example Tests

```typescript
// builder.test.ts
describe('buildDependencyGraph', () => {
  it('creates all nodes for basic config', () => {
    const config = DEFAULT_LECTURE_CONFIG;
    const graph = buildDependencyGraph(config, 3); // 3 segments

    // Should have config nodes
    expect(graph.nodes['config:user-prompt']).toBeDefined();
    expect(graph.nodes['config:image-style']).toBeDefined();

    // Should have 3 segment nodes
    expect(graph.nodes['content:script:segment[0]']).toBeDefined();
    expect(graph.nodes['content:script:segment[1]']).toBeDefined();
    expect(graph.nodes['content:script:segment[2]']).toBeDefined();

    // Should have timeline assembler
    expect(graph.nodes['assembler:timeline']).toBeDefined();
  });

  it('handles useVideo=true correctly', () => {
    const config = { ...DEFAULT_LECTURE_CONFIG, general: { ...DEFAULT_LECTURE_CONFIG.general, useVideo: true }};
    const graph = buildDependencyGraph(config, 2);

    // Should have video nodes instead of image nodes
    expect(graph.nodes['llm:video-prompts:segment[0]']).toBeDefined();
    expect(graph.nodes['asset:video:segment[0]']).toBeDefined();

    // Should NOT have image nodes
    expect(graph.nodes['llm:image-prompt:segment[0]:image[0]']).toBeUndefined();
  });
});

// dirty-propagation.test.ts
describe('markDirty', () => {
  it('marks node and all downstream dependents as dirty', () => {
    const graph = buildDependencyGraph(DEFAULT_LECTURE_CONFIG, 2);
    const updatedGraph = markDirty(graph, 'config:image-style');

    // All image prompt nodes should be dirty
    expect(updatedGraph.nodes['llm:image-prompt:segment[0]:image[0]'].isDirty).toBe(true);
    expect(updatedGraph.nodes['llm:image-prompt:segment[1]:image[0]'].isDirty).toBe(true);

    // All image asset nodes should be dirty
    expect(updatedGraph.nodes['asset:image:segment[0]:image[0]'].isDirty).toBe(true);

    // Timeline should be dirty
    expect(updatedGraph.nodes['assembler:timeline'].isDirty).toBe(true);

    // Unrelated nodes should NOT be dirty
    expect(updatedGraph.nodes['asset:narration:segment[0]'].isDirty).toBe(false);
  });
});
```

## 8. Migration Strategy

### Phase 1: Core Infrastructure
- Database schema update (add dependency_graph column)
- TypeScript types
- Graph builder (handles all node types from diagram)
- Unit tests for builder
- Repository layer (save/load from DB)

### Phase 2: Graph Algorithms
- Dirty propagation algorithm
- Topological sort for execution planning
- Change handlers
- Query functions
- Comprehensive unit tests (aim for 100% coverage)

### Phase 3: Vercel Workflow
- Create `execute-lecture-plan` workflow
- Extract generator step functions from existing Inngest code
- Test with simple scenarios

### Phase 4: API Integration
- Feature flag (`USE_GRAPH_WORKFLOW=true/false`)
- Create lecture API with graph creation
- Edit API with dirty marking
- Regenerate API

### Phase 5: Integration Testing
- End-to-end tests for common scenarios:
  - Initial generation (all nodes pending)
  - Edit script narration → regenerate narration + timeline
  - Edit image prompt → regenerate that image + timeline
  - Change image style config → regenerate all images + timeline
  - Change useVideo → rebuild graph + regenerate all visual assets
  - Edit segment count → rebuild graph + regenerate affected assets

### Phase 6: Production Rollout
- Deploy with flag disabled (`USE_GRAPH_WORKFLOW=false`)
- Test in staging with flag enabled
- Gradual rollout (10% → 50% → 100% of new lectures)
- Migration script for existing lectures (build graphs retroactively)
- Keep old Inngest functions for backwards compatibility

## 9. Example Scenarios

### Scenario 1: Initial Generation (First Time)
```typescript
// User creates new lecture
POST /api/lectures/create
{
  userId: "user123",
  prompt: "Explain quantum computing",
  config: { /* ... */ }
}

// Backend:
// 1. Create lecture record
// 2. Calculate numSegments = 5 (based on config)
// 3. Create dependency graph with 50+ nodes, all status='pending'
// 4. Start workflow: execute-lecture-plan(lectureId, userId)

// Workflow executes:
// - Creates plan from all 'pending' nodes (full graph)
// - Executes in topological order
// - Each step updates graph node with assetId and status='clean'
// - Timeline assembles at the end

// Result: Fully generated lecture with complete graph
```

### Scenario 2: Edit Narration Text for Segment 2
```typescript
// User edits narration in segment 2
PATCH /api/lectures/123/edit
{
  editType: 'script',
  segmentIndex: 2,
  field: 'narration',
  newValue: 'New narration text...'
}

// Backend:
// 1. Load graph
// 2. Call handleScriptEdit() - marks these dirty:
//    - content:script:segment[2]
//    - asset:narration:segment[2]
//    - assembler:timeline
// 3. Save graph with dirty flags

// User triggers regeneration:
POST /api/lectures/123/regenerate

// Workflow executes:
// - Creates plan from 'dirty' nodes only (3 nodes)
// - Executes: regenerate narration for segment 2, then timeline
// - Other segments NOT touched

// Result: Only affected assets regenerated
```

### Scenario 3: Change Image Style from Ghibli to Pixar
```typescript
// User changes global image style config
PATCH /api/lectures/123/edit
{
  editType: 'config',
  configKey: 'image-style',
  newValue: 'Pixar'
}

// Backend marks dirty:
// - config:image-style
// - All llm:image-prompt:segment[*]:image[*] nodes
// - All asset:image:segment[*]:image[*] nodes
// - assembler:timeline

// Regeneration:
// - Regenerates ALL image prompts
// - Regenerates ALL images
// - Reassembles timeline

// Result: All images regenerated with new style, everything else untouched
```

### Scenario 4: Edit Single Image Prompt
```typescript
// User edits prompt for segment 0, image 0
PATCH /api/lectures/123/edit
{
  editType: 'prompt',
  nodeId: 'llm:image-prompt:segment[0]:image[0]',
  newPrompt: 'A futuristic cityscape...'
}

// Backend marks dirty:
// - llm:image-prompt:segment[0]:image[0]
// - asset:image:segment[0]:image[0]
// - assembler:timeline

// Regeneration:
// - Regenerates ONLY that one image
// - Reassembles timeline

// Result: Surgical regeneration, minimal cost
```

## Key Benefits

1. **Unified Architecture**: One workflow for generation and regeneration
2. **Precise Regeneration**: Only regenerate what changed and its dependencies
3. **Cost Savings**: Avoid redundant API calls to expensive LLM/media providers
4. **Durable Execution**: Vercel Workflow handles retries, failures, resumption automatically
5. **Testable**: Core algorithms are pure functions with comprehensive tests
6. **Transparent**: Graph shows exactly what will execute
7. **Flexible**: Easy to add new node types or change dependencies
8. **Reliable**: Persisted graph state survives failures and can resume
9. **Non-Breaking**: Runs alongside existing system during development
10. **Graph-First**: Dependency graph exists before execution, enabling better planning and visualization

## Vercel Workflow Advantages

- **Automatic Retries**: Steps retry on transient failures without custom code
- **Durable Suspension**: Workflow can pause for external events without consuming resources
- **Observability**: Built-in logging, metrics, tracing in Vercel dashboard
- **Serialization**: Automatic handling of complex types (Request, Response, streams, etc.)
- **Idempotency**: Step IDs provide stable idempotency keys for external APIs
- **Human-in-the-Loop**: Hooks and webhooks for approval workflows
- **Type Safety**: Full TypeScript support with IDE hints

## Next Steps

1. Review and approve plan
2. Set up development environment with Vercel Workflow
3. Begin Phase 1: Core Infrastructure
4. Iterate with continuous feedback
