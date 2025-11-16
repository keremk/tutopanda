# Tutopanda CLI Reference

## Introduction

Tutopanda CLI is a command-line SDK for generating AI-powered multimedia content through declarative workflow blueprints. The system orchestrates multiple AI providers (OpenAI, Replicate, and custom Tutopanda services) to create narrated video content from simple text prompts.

### Scope

The CLI provides a complete toolkit for:

- **Declarative Workflow Definition**: Author reusable YAML blueprints that define multi-step generation pipelines
- **Dynamic Cardinality Management**: Automatically scale workflows based on input parameters (e.g., generate N segments with M images each)
- **Multi-Provider Orchestration**: Coordinate OpenAI, Replicate, and Tutopanda services in a single workflow
- **Artifact Management**: Track, inspect, and edit all generated assets (scripts, images, audio, timelines)
- **Interactive Editing**: Modify generated content and replay workflows with updated inputs
- **Blueprint Modularity**: Compose complex workflows from reusable modules
- **Playback Integration**: Launch Remotion-based viewer for previewing generated movies

### Architecture

The system operates on three core components:

1. **Blueprint YAML Files**: Define the workflow graph, provider configurations, and data flow
2. **Input YAML Files**: Supply runtime values for blueprint parameters
3. **Storage Directory**: Organize generated artifacts, manifests, and metadata per movie

All configuration is file-based. The CLI does not use runtime flags for overriding provider settings or workflow parameters—everything is declared in version-controlled YAML and TOML files.

---

## Getting Started

### Prerequisites

- Node.js 18+ and pnpm
- API credentials for providers (OpenAI, Replicate)
- Environment variables configured in `.env` file

### Installation

```bash
# From the Tutopanda monorepo
cd cli
pnpm install
pnpm build

# Make CLI available globally (optional)
pnpm link --global
```

### Environment Configuration

Create a `.env` file in the CLI directory or current working directory:

```bash
# OpenAI
OPENAI_API_KEY=sk-...

# Replicate
REPLICATE_API_TOKEN=r8_...

# Tutopanda (if using cloud services)
TUTOPANDA_API_KEY=...
```

### Initialization

Initialize the Tutopanda storage configuration:

```bash
tutopanda init --rootFolder=/path/to/storage
```

This creates:
- `~/.tutopanda/cli-config.json` with storage settings
- `~/.tutopanda/builds/` directory for movie outputs
- `~/.tutopanda/config/blueprints/` populated with bundled YAML blueprints

Optional flags:
- `--configPath`: Custom path for `cli-config.json` (default: `~/.tutopanda/`)
- `--rootFolder`: Storage root directory (required)

### Generate Your First Movie

1. **Create an inputs file** (`my-inputs.yaml`):

```yaml
inputs:
  InquiryPrompt: "Explain the water cycle"
  Duration: 30
  NumOfSegments: 3
  VoiceId: "Wise_Woman"
  ImageStyle: "Scientific illustration"
```

2. **Run the query command**:

```bash
tutopanda query \
  --inputs=my-inputs.yaml \
  --using-blueprint=~/.tutopanda/config/blueprints/image-audio.yaml
```

3. **View the result**:

```bash
tutopanda viewer --movie=movie-a1b2c3d4
```

---

## Core Concepts

### Blueprints

Blueprints are YAML files that define complete generation workflows. They specify:

- **Inputs**: Required and optional parameters
- **Artifacts**: Output types produced by the workflow
- **Loops**: Iteration dimensions for scaling operations
- **Modules**: References to reusable sub-blueprints
- **Connections**: Data flow between nodes
- **Producers**: Provider configurations (OpenAI, Replicate, Tutopanda)
- **Collectors**: Optional fan-in operations for aggregating array outputs

Blueprints are installed to `<root>/config/blueprints/` (default `~/.tutopanda/config/blueprints/`). When running from source, they also live under `cli/config/blueprints/`.

#### Available Blueprints

1. **audio-only.yaml**: Generate script and audio narration (no images)
2. **image-audio.yaml**: Full pipeline with images, audio, and timeline composition
3. **image-only.yaml**: Generate script and images without audio

### Modules

Modules are reusable blueprint components located in `<root>/config/blueprints/modules/` (the repo copy lives under `cli/config/blueprints/modules/`):

1. **script-generator.yaml**: Uses OpenAI to generate movie title, summary, and narration segments
2. **image-prompt-generator.yaml**: Creates detailed image prompts from narrative text
3. **image-generator.yaml**: Generates images using Replicate (seedream-4 model)
4. **audio-generator.yaml**: Generates audio using Replicate (minimax model)
5. **timeline-composer.yaml**: Composes images and audio into a timeline JSON manifest

### Inputs

Input files are YAML documents that provide runtime values for blueprint parameters. All required inputs from the blueprint's `inputs` section must be present.

Example:

```yaml
inputs:
  InquiryPrompt: "Tell me about the Battle of Waterloo"
  Duration: 30
  NumOfSegments: 2
  VoiceId: "Wise_Woman"
  ImageStyle: "Ghibli"
  Size: "1K"
  AspectRatio: "16:9"
```

### Artifacts

Artifacts are typed outputs produced by the workflow:

- **string**: Plain text
- **json**: Structured JSON data
- **image**: Image files (PNG, JPG)
- **audio**: Audio files (MP3, WAV)
- **video**: Video files (MP4)
- **array**: Single-dimensional array of items
- **multiDimArray**: Multi-dimensional array (e.g., images[segment][image])

Artifacts are stored in `~/.tutopanda/builds/movie-{id}/artefacts/`.

### Loops

Loops define iteration dimensions for scaling operations. They enable dynamic cardinality based on input values.

```yaml
loops:
  - name: segment
    description: Iterates over narration segments
    countInput: NumOfSegments
  - name: image
    description: Iterates over images per segment
    parent: segment
    countInput: NumOfImagesPerNarrative
```

Loops can be nested using the `parent` property, creating multi-dimensional iteration spaces.

### Index Notation

Connections use index notation to specify array cardinality:

- `Node.Output` - Scalar value
- `Node[segment].Output` - Single-dimensional array
- `Node[segment][image].Output` - Multi-dimensional array

Example:
```yaml
connections:
  - from: ScriptGenerator.NarrationScript[segment]
    to: AudioGenerator[segment].TextInput
```

This notation indicates that each `AudioGenerator` instance (one per segment) receives the corresponding narration text.

### Producers

Producers are provider configurations that execute actual generation tasks. Three types are supported:

1. **OpenAI**: LLM-based generation
2. **Replicate**: Model invocation for images and audio
3. **Tutopanda**: Built-in services (e.g., OrderedTimeline)

Producer configurations are embedded in blueprint modules under the `producers` section.

### Collectors

Collectors perform fan-in operations, aggregating array outputs for downstream nodes:

```yaml
collectors:
  - name: TimelineImages
    from: ImageGenerator[segment][image].SegmentImage
    into: TimelineComposer.ImageSegments
    groupBy: segment
    orderBy: image
```

This collects all images grouped by segment and ordered by image index.

---

## CLI Commands Reference

### `tutopanda init`

Initialize Tutopanda storage configuration.

**Usage:**
```bash
tutopanda init --rootFolder=/path/to/storage [--configPath=/custom/path]
```

**Options:**
- `--rootFolder` (required): Storage root directory
- `--configPath` (optional): Path for `cli-config.json` (default: `~/.tutopanda/`)

**Creates:**
- `cli-config.json` with storage settings
- `builds/` directory for movie outputs

**Example:**
```bash
tutopanda init --rootFolder=/Users/alice/tutopanda-storage
```

---

### `tutopanda query`

Generate and execute a new movie using a blueprint and inputs.

**Usage:**
```bash
tutopanda query --inputs=<path> --using-blueprint=<path> [--dryrun] [--nonInteractive]
```

**Options:**
- `--inputs` (required): Path to inputs YAML file
- `--using-blueprint` (required): Path to blueprint YAML file copied by `tutopanda init`
- `--dryrun` (optional): Execute a mocked run without calling providers
- `--nonInteractive` (optional): Skip confirmation prompt

**Behavior:**
1. Loads and validates the blueprint and inputs
2. Generates a unique movie ID (8-character UUID prefix, e.g., `q123456`)
3. Creates movie directory: `~/.tutopanda/builds/movie-{id}/`
4. Executes the workflow, invoking configured providers
5. Stores all artifacts, manifests, and metadata

**Example:**
```bash
tutopanda query \
  --inputs=~/.tutopanda/config/inputs-default.yaml \
  --using-blueprint=~/.tutopanda/config/blueprints/image-audio.yaml
```

**Output:**
```
Movie ID: movie-q123456
Outputs stored in: ~/.tutopanda/builds/movie-q123456/
```

---

### `tutopanda edit`

Modify an existing movie with new inputs or interactive editing.

**Three Modes:**

#### 1. Direct Re-execution
Re-run the workflow with new inputs:

```bash
tutopanda edit \
  --movieId=movie-q123456 \
  --inputs=edited-inputs.yaml \
  [--using-blueprint=<path>]
```

**Options:**
- `--movieId` (required): Movie ID to edit
- `--inputs` (required): Path to updated inputs YAML file
- `--using-blueprint` (optional): New blueprint to use

#### 2. Interactive Setup
Create a workspace for manual artifact editing:

```bash
tutopanda edit --movieId=movie-q123456 --interactiveEdit
```

**Behavior:**
- Opens a menu to select artifacts
- Exports selected artifacts to `workspaces/movie-{id}/`
- Allows manual editing of files

#### 3. Interactive Submit
Apply edited artifacts and replay the workflow:

```bash
tutopanda edit --movieId=movie-q123456 --submitEdits
```

**Behavior:**
- Validates edited artifacts
- Re-executes the workflow from the edited node onward
- Updates movie with new outputs

**Example Workflow:**
```bash
# 1. Create workspace
tutopanda edit --movieId=movie-q123456 --interactiveEdit

# 2. Manually edit files in workspaces/movie-q123456/

# 3. Submit edits
tutopanda edit --movieId=movie-q123456 --submitEdits
```

---

### `tutopanda inspect`

Export movie data (prompts, artifacts, metadata) for inspection.

**Usage:**
```bash
tutopanda inspect --movieId=<id>
```

**Options:**
- `--movieId` (required): Movie ID to inspect

**Behavior:**
Displays:
- Movie metadata
- All artifacts with paths and types
- Prompts used in generation
- Plan structure

**Example:**
```bash
tutopanda inspect --movieId=movie-q123456
```

---

### `tutopanda providers:list`

Show configured providers and their readiness status.

**Usage:**
```bash
tutopanda providers:list --using-blueprint=<path>
```

**Options:**
- `--using-blueprint` (required): Path to the blueprint YAML file whose providers should be inspected

**Behavior:**
1. Loads the blueprint
2. Extracts all producer configurations
3. Attempts to warm-start each provider
4. Reports status (ready/failed)

**Example:**
```bash
tutopanda providers:list --using-blueprint=~/.tutopanda/config/blueprints/image-audio.yaml
```

**Output:**
```
Provider: openai (gpt-4o)
Status: Ready

Provider: replicate (bytedance/sdxl-lightning-4step)
Status: Ready
```

---

### `tutopanda blueprints:list`

List all available blueprint YAML files.

**Usage:**
```bash
tutopanda blueprints:list
```

**Behavior:**
Scans `<root>/config/blueprints/` (default `~/.tutopanda/config/blueprints/`) and displays all `.yaml` files with their metadata.

**Example Output:**
```
Available Blueprints:

1. audio-only.yaml
   - Audio-Only Narration
   - Generates script and audio narration

2. image-audio.yaml
   - Images with Audio Narration
   - Full pipeline with images, audio, and timeline

3. image-only.yaml
   - Image-Only Generation
   - Generates script and images without audio
```

---

### `tutopanda blueprints:describe`

Show detailed information about a specific blueprint.

**Usage:**
```bash
tutopanda blueprints:describe <path-to-blueprint.yaml>
```

**Options:**
- Positional argument (required): Path to the blueprint YAML file to describe

**Behavior:**
Displays:
- Blueprint metadata (name, description, version, author)
- Required and optional inputs
- Artifacts produced
- Loops defined
- Modules used
- Node/edge counts

**Example:**
```bash
tutopanda blueprints:describe ~/.tutopanda/config/blueprints/image-audio.yaml
```

---

### `tutopanda blueprints:validate`

Validate blueprint structure and references.

**Usage:**
```bash
tutopanda blueprints:validate <path-to-blueprint.yaml>
```

**Options:**
- Positional argument (required): Path to the blueprint YAML file to validate

**Behavior:**
- Validates YAML syntax
- Checks module references
- Validates connections
- Ensures all required fields are present

**Example:**
```bash
tutopanda blueprints:validate ~/.tutopanda/config/blueprints/image-audio.yaml
```

---

### `tutopanda viewer`

Launch the Remotion-based viewer for playback.

**Usage:**
```bash
tutopanda viewer [--movie=<id>]
```

**Options:**
- `--movie` (optional): Movie ID to load on startup

**Behavior:**
- Launches a local web server with the Remotion viewer
- Loads the specified movie (if provided)
- Displays timeline with images, audio, and composition

**Example:**
```bash
tutopanda viewer --movie=movie-q123456
```

---

## Blueprint YAML Reference

### Complete Schema

```yaml
meta:
  name: <string>
  description: <string>
  id: <string>
  version: <semver>
  author: <string>
  license: <string>

inputs:
  - name: <string>
    description: <string>
    type: <string|int|array|collection>
    required: <boolean>
    default: <any>

artifacts:
  - name: <string>
    description: <string>
    type: <string|json|image|audio|video|array|multiDimArray>
    itemType: <string>  # For array types

loops:
  - name: <string>
    description: <string>
    countInput: <inputName>
    parent: <loopName>  # For nested loops

modules:
  - name: <string>
    path: <relativePath>
    loop: <loopName|loopName.childLoop>

connections:
  - from: <source>
    to: <target>

producers:
  - name: <string>
    providerName: <openai|replicate|tutopanda>
    modelName: <string>
    environment: <local|cloud>
    promptFile: <filename>  # OpenAI only
    jsonSchema: <schemaName>  # OpenAI only
    sdkMapping:
      <inputName>:
        field: <sdkFieldName>
        type: <string|number|boolean>
        required: <boolean>

collectors:
  - name: <string>
    from: <source>
    into: <target>
    groupBy: <loopName>
    orderBy: <loopName>
```

### Field Descriptions

#### `meta`
Metadata about the blueprint.

- `name`: Human-readable name
- `description`: Purpose and behavior
- `id`: Unique identifier (PascalCase)
- `version`: Semantic version
- `author`: Creator name
- `license`: License type (e.g., MIT)

#### `inputs`
Parameters accepted by the blueprint.

- `name`: Input identifier (PascalCase)
- `description`: Purpose and usage
- `type`: Data type (`string`, `int`, `array`, `collection`)
- `required`: Whether the input is mandatory
- `default`: Default value if not provided

**Example:**
```yaml
inputs:
  - name: Duration
    description: Desired movie duration in seconds
    type: int
    required: true
  - name: ImageStyle
    description: Visual style for images
    type: string
    required: false
    default: Photorealistic
```

#### `artifacts`
Outputs produced by the workflow.

- `name`: Artifact identifier (PascalCase)
- `description`: Purpose and content
- `type`: Output type
  - `string`, `json`, `image`, `audio`, `video`: Scalar types
  - `array`: Single-dimensional array
  - `multiDimArray`: Multi-dimensional array
- `itemType`: For array types, specifies the item type

**Example:**
```yaml
artifacts:
  - name: SegmentImage
    description: Images for each segment
    type: multiDimArray
    itemType: image
  - name: Timeline
    description: Composition manifest
    type: json
```

#### `loops`
Iteration dimensions for scaling operations.

- `name`: Loop identifier (lowercase)
- `description`: Purpose and behavior
- `countInput`: Input parameter that determines iteration count
- `parent`: Parent loop for nested iteration (optional)

**Example:**
```yaml
loops:
  - name: segment
    description: Iterate over narration segments
    countInput: NumOfSegments
  - name: image
    description: Iterate over images per segment
    parent: segment
    countInput: NumOfImagesPerNarrative
```

#### `modules`
References to reusable sub-blueprints.

- `name`: Module instance name (PascalCase)
- `path`: Relative path to module YAML file
- `loop`: Loop context (optional)
  - Single loop: `segment`
  - Nested loop: `segment.image`

**Example:**
```yaml
modules:
  - name: ScriptGenerator
    path: ./modules/script-generator.yaml
  - name: AudioGenerator
    path: ./modules/audio-generator.yaml
    loop: segment
  - name: ImageGenerator
    path: ./modules/image-generator.yaml
    loop: segment.image
```

#### `connections`
Data flow between nodes.

- `from`: Source node output
  - Blueprint input: `InputName`
  - Module output: `ModuleName.OutputName`
  - Array output: `ModuleName.OutputName[loop]`
  - Multi-dim array: `ModuleName.OutputName[loop1][loop2]`
- `to`: Target node input
  - Blueprint artifact: `ArtifactName[loop]`
  - Module input: `ModuleName.InputName`
  - Looped module input: `ModuleName[loop].InputName`

**Example:**
```yaml
connections:
  - from: InquiryPrompt
    to: ScriptGenerator.InquiryPrompt
  - from: ScriptGenerator.NarrationScript[segment]
    to: AudioGenerator[segment].TextInput
  - from: ImageGenerator[segment][image].SegmentImage
    to: SegmentImage[segment][image]
```

#### `producers`
Provider configurations for generation tasks.

**OpenAI Producer:**
```yaml
producers:
  - name: ScriptGenerator
    providerName: openai
    modelName: gpt-4o
    environment: local
    promptFile: generate-script.md
    jsonSchema: ScriptGeneratorOutput
```

- `promptFile`: Markdown file with prompt template (stored in `prompts/`)
- `jsonSchema`: TypeScript interface name for structured output

**Replicate Producer:**
```yaml
producers:
  - name: ImageGenerator
    providerName: replicate
    modelName: bytedance/sdxl-lightning-4step
    environment: local
    sdkMapping:
      Prompt:
        field: prompt
        type: string
        required: true
      Size:
        field: width
        type: number
        required: false
```

- `sdkMapping`: Maps blueprint inputs to SDK field names
  - `field`: SDK parameter name
  - `type`: Data type (`string`, `number`, `boolean`)
  - `required`: Whether the parameter is mandatory

**Tutopanda Producer:**
```yaml
producers:
  - name: TimelineComposer
    providerName: tutopanda
    modelName: OrderedTimeline
    environment: local
```

#### `collectors`
Fan-in operations for aggregating array outputs.

- `name`: Collector identifier
- `from`: Source node output (with indices)
- `into`: Target node input
- `groupBy`: Loop dimension for grouping
- `orderBy`: Loop dimension for ordering

**Example:**
```yaml
collectors:
  - name: TimelineImages
    from: ImageGenerator[segment][image].SegmentImage
    into: TimelineComposer.ImageSegments
    groupBy: segment
    orderBy: image
```

This collects all images, groups them by segment, orders by image index, and passes to `TimelineComposer`.

---

## Input YAML Reference

### Structure

Input files use YAML with a single `inputs` mapping:

```yaml
inputs:
  <InputName>: <value>
```

### Data Types

- **String**: Quoted text
- **Integer**: Numeric value (no quotes)
- **Array**: YAML array syntax

**Example:**
```yaml
inputs:
  InquiryPrompt: "Explain photosynthesis"
  Duration: 45
  NumOfSegments: 4
  VoiceId: "Wise_Woman"
  ImageStyle: "Scientific diagram"
  Size: "2K"
  AspectRatio: "16:9"
  Audience: "High school students"
```

### Validation Rules

1. All required inputs from the blueprint must be present
2. Optional inputs use blueprint defaults if omitted
3. Input names are case-sensitive and must match blueprint exactly
4. Type mismatches cause validation errors

### Special Inputs

#### `InquiryPrompt`
Stored in two locations:
- `builds/movie-{id}/inputs.yaml`
- `builds/movie-{id}/prompts/inquiry.txt`

This allows providers to reference it as both a config value and a prompt file.

---

## Provider Configuration

### Provider Types

#### 1. OpenAI
Uses LLM for text generation with structured outputs.

**Configuration:**
```yaml
producers:
  - name: ScriptGenerator
    providerName: openai
    modelName: gpt-4o
    environment: local
    promptFile: generate-script.md
    jsonSchema: ScriptGeneratorOutput
```

**Prompt File (`prompts/generate-script.md`):**
```markdown
You are a creative scriptwriter. Generate a movie script based on the following:

Topic: {InquiryPrompt}
Duration: {Duration} seconds
Segments: {NumOfSegments}
Audience: {Audience}
```

**JSON Schema (TypeScript Interface):**
```typescript
interface ScriptGeneratorOutput {
  MovieTitle: string;
  MovieSummary: string;
  NarrationScript: string[];
}
```

#### 2. Replicate
Invokes models for image and audio generation.

**Configuration:**
```yaml
producers:
  - name: ImageGenerator
    providerName: replicate
    modelName: bytedance/sdxl-lightning-4step
    environment: local
    sdkMapping:
      Prompt:
        field: prompt
        type: string
        required: true
      Size:
        field: width
        type: number
        required: true
```

**SDK Mapping:**
- Maps blueprint inputs to Replicate SDK field names
- Supports type conversion (string to number)
- Enforces required/optional fields

#### 3. Tutopanda
Built-in providers for specialized tasks.

**Configuration:**
```yaml
producers:
  - name: TimelineComposer
    providerName: tutopanda
    modelName: OrderedTimeline
    environment: local
```

**Available Models:**
- `OrderedTimeline`: Composes images and audio into a timeline JSON manifest

### Environment Configuration

- **`local`**: Uses local environment (CLI reads `.env` files)
- **`cloud`**: Reserved for future cloud-based execution

### Credentials

The CLI reads credentials from `.env` files in:
1. CLI directory (`cli/.env`)
2. Current working directory (`.env`)

**Required Variables:**
```bash
OPENAI_API_KEY=sk-...
REPLICATE_API_TOKEN=r8_...
```

---

## Storage Structure

### Directory Layout

```
~/.tutopanda/
├── cli-config.json          # Storage configuration
└── builds/
    └── movie-{id}/
        ├── inputs.yaml      # Original inputs
        ├── plan.json        # Execution plan
        ├── manifest.json    # Artifact metadata
        ├── artefacts.log    # Execution log
        ├── prompts/
        │   └── inquiry.txt  # InquiryPrompt
        └── artefacts/
            ├── node-{id}-output.txt
            ├── node-{id}-output.json
            ├── node-{id}-output.png
            └── node-{id}-output.mp3
```

### File Descriptions

#### `cli-config.json`
Storage configuration created by `init`.

```json
{
  "storage": {
    "root": "/path/to/storage",
    "basePath": "builds"
  }
}
```

#### `inputs.yaml`
Original inputs provided to the workflow.

#### `plan.json`
Execution plan with nodes, edges, and dependencies.

#### `manifest.json`
Artifact metadata with types, paths, and node IDs.

#### `artefacts.log`
Execution log with timestamps and status.

#### `prompts/`
Directory for prompt files referenced by producers.

#### `artefacts/`
Directory for all generated artifacts. Files are named:
- `node-{nodeId}-{outputName}.{ext}`

Node IDs are deterministic and derived from:
- Module name
- Loop indices (if looped)
- Instance counter (for arrays)

**Example:**
- `node-ScriptGenerator-MovieTitle.txt`
- `node-AudioGenerator-0-SegmentAudio.mp3`
- `node-ImageGenerator-0-1-SegmentImage.png`

---

## Advanced Topics

### Interactive Editing Workflow

The interactive editing feature allows manual modification of generated artifacts.

**Workflow:**

1. **Create workspace:**
   ```bash
   tutopanda edit --movieId=movie-q123456 --interactiveEdit
   ```
   - Presents a menu of artifacts
   - Exports selected artifacts to `workspaces/movie-q123456/`

2. **Edit artifacts:**
   - Manually edit files in the workspace
   - Modify text, replace images, adjust audio

3. **Submit edits:**
   ```bash
   tutopanda edit --movieId=movie-q123456 --submitEdits
   ```
   - Validates edited artifacts
   - Re-executes workflow from edited node onward
   - Generates new downstream artifacts

**Use Cases:**
- Fix LLM-generated script errors
- Replace unsatisfactory images
- Adjust audio narration
- Tweak timeline composition

### Blueprint Modules

Modules enable blueprint composition and reuse.

**Creating a Module:**

1. **Define module YAML** (`modules/my-module.yaml`):
   ```yaml
   meta:
     name: My Module
     id: MyModule

   inputs:
     - name: InputText
       type: string
       required: true

   outputs:
     - name: OutputData
       type: json

   producers:
     - name: MyProducer
       providerName: openai
       modelName: gpt-4o
       promptFile: my-prompt.md
   ```

2. **Reference in parent blueprint:**
   ```yaml
   modules:
     - name: MyModuleInstance
       path: ./modules/my-module.yaml

   connections:
     - from: ParentInput
       to: MyModuleInstance.InputText
     - from: MyModuleInstance.OutputData
       to: ParentArtifact
   ```

**Benefits:**
- Reuse common patterns (script generation, image generation)
- Isolate provider configurations
- Simplify complex blueprints
- Enable testing of individual components

### Index Notation Deep Dive

Index notation specifies array cardinality in connections.

**Scalar Connections:**
```yaml
- from: InquiryPrompt
  to: ScriptGenerator.InquiryPrompt
```
Both source and target are scalars (single values).

**Array Connections:**
```yaml
- from: ScriptGenerator.NarrationScript[segment]
  to: AudioGenerator[segment].TextInput
```
- Source is an array (one narration per segment)
- Target is looped (one AudioGenerator instance per segment)
- Each instance receives the corresponding array element

**Multi-Dimensional Connections:**
```yaml
- from: ImageGenerator[segment][image].SegmentImage
  to: SegmentImage[segment][image]
```
- Source is a 2D array (segments × images)
- Target artifact is also 2D
- Preserves array structure

**Fan-In Connections:**
```yaml
- from: AudioGenerator[segment].SegmentAudio
  to: TimelineComposer.AudioSegments
```
- Source is an array
- Target expects the full array
- Collector handles aggregation

### Dry Run Mode

Dry run mode executes a mocked workflow without calling providers.

**Usage:**
```bash
tutopanda query --inputs=my-inputs.yaml --dryrun
```

**Behavior:**
- Validates blueprint and inputs
- Generates execution plan
- Creates movie directory
- Generates mock artifacts (placeholder files)
- Does not call OpenAI, Replicate, or Tutopanda APIs

**Use Cases:**
- Test blueprint structure
- Validate input files
- Preview execution plan
- Check artifact output paths

### Non-Interactive Mode

Non-interactive mode skips confirmation prompts.

**Usage:**
```bash
tutopanda query --inputs=my-inputs.yaml --nonInteractive
```

**Use Cases:**
- CI/CD pipelines
- Automated workflows
- Batch processing

---

## Examples

### Example 1: Audio-Only Narration

**Blueprint:** `~/.tutopanda/config/blueprints/audio-only.yaml`

**Inputs (`audio-inputs.yaml`):**
```yaml
inputs:
  InquiryPrompt: "Explain the history of the Roman Empire"
  Duration: 60
  NumOfSegments: 4
  VoiceId: "Wise_Man"
  Audience: "Adults"
```

**Command:**
```bash
tutopanda query \
  --inputs=audio-inputs.yaml \
  --using-blueprint=~/.tutopanda/config/blueprints/audio-only.yaml
```

**Outputs:**
- `MovieTitle.txt`
- `MovieSummary.txt`
- `NarrationScript-0.txt`, `NarrationScript-1.txt`, `NarrationScript-2.txt`, `NarrationScript-3.txt`
- `SegmentAudio-0.mp3`, `SegmentAudio-1.mp3`, `SegmentAudio-2.mp3`, `SegmentAudio-3.mp3`

---

### Example 2: Images with Audio

**Blueprint:** `~/.tutopanda/config/blueprints/image-audio.yaml`

**Inputs (`image-audio-inputs.yaml`):**
```yaml
inputs:
  InquiryPrompt: "Tell me about the Solar System"
  Duration: 90
  NumOfSegments: 6
  NumOfImagesPerNarrative: 2
  ImageStyle: "Space photography"
  Size: "2K"
  AspectRatio: "16:9"
  VoiceId: "Wise_Woman"
  Audience: "Children"
```

**Command:**
```bash
tutopanda query \
  --inputs=image-audio-inputs.yaml \
  --using-blueprint=~/.tutopanda/config/blueprints/image-audio.yaml
```

**Outputs:**
- Script artifacts (title, summary, narration)
- Audio artifacts (6 segments)
- Image artifacts (6 segments × 2 images = 12 images)
- Timeline JSON manifest

**View Result:**
```bash
tutopanda viewer --movie=movie-{id}
```

---

### Example 3: Interactive Editing

**Scenario:** Fix a typo in the generated script.

**Step 1: Generate movie**
```bash
tutopanda query --inputs=my-inputs.yaml
# Output: movie-a1b2c3d4
```

**Step 2: Inspect artifacts**
```bash
tutopanda inspect --movieId=movie-a1b2c3d4
```

**Step 3: Create workspace**
```bash
tutopanda edit --movieId=movie-a1b2c3d4 --interactiveEdit
# Select "NarrationScript[0]" from menu
```

**Step 4: Edit artifact**
```bash
# Edit workspaces/movie-a1b2c3d4/NarrationScript-0.txt
# Fix typo: "The Romen Empire" → "The Roman Empire"
```

**Step 5: Submit edits**
```bash
tutopanda edit --movieId=movie-a1b2c3d4 --submitEdits
```

**Result:**
- Updated narration text
- Re-generated audio for segment 0
- Timeline updated with new audio

---

### Example 4: Custom Blueprint Module

**Create a custom sentiment analyzer module.**

**File:** `<root>/config/blueprints/modules/sentiment-analyzer.yaml`
```yaml
meta:
  name: Sentiment Analyzer
  id: SentimentAnalyzer
  version: 0.1.0

inputs:
  - name: TextInput
    description: Text to analyze
    type: string
    required: true

outputs:
  - name: SentimentScore
    description: Sentiment score (-1 to 1)
    type: json

producers:
  - name: SentimentAnalyzer
    providerName: openai
    modelName: gpt-4o
    environment: local
    promptFile: analyze-sentiment.md
    jsonSchema: SentimentAnalyzerOutput
```

**Prompt File:** `cli/prompts/analyze-sentiment.md`
```markdown
Analyze the sentiment of the following text and provide a score from -1 (very negative) to 1 (very positive):

{TextInput}
```

**Schema:**
```typescript
interface SentimentAnalyzerOutput {
  score: number;
  explanation: string;
}
```

**Use in Blueprint:**
```yaml
modules:
  - name: SegmentSentiment
    path: ./modules/sentiment-analyzer.yaml
    loop: segment

connections:
  - from: ScriptGenerator.NarrationScript[segment]
    to: SegmentSentiment[segment].TextInput
```

---

## Troubleshooting

### Common Issues

**1. Missing API Credentials**
```
Error: OPENAI_API_KEY not found
```
**Solution:** Add credentials to `.env` file in CLI directory or current working directory.

**2. Invalid Blueprint Path**
```
Error: Blueprint file not found: /path/to/blueprint.yaml
```
**Solution:** Use absolute paths or paths relative to current directory.

**3. Missing Required Input**
```
Error: Required input 'InquiryPrompt' not found in inputs.yaml
```
**Solution:** Ensure all required inputs from blueprint are present in YAML file.

**4. Module Reference Error**
```
Error: Module not found: ./modules/missing-module.yaml
```
**Solution:** Check module path is relative to blueprint file location.

**5. Provider Configuration Error**
```
Error: Invalid sdkMapping for Replicate producer
```
**Solution:** Ensure all required SDK fields are mapped in `sdkMapping` section.

### Debug Mode

Set environment variable for verbose logging:
```bash
DEBUG=tutopanda:* tutopanda query --inputs=my-inputs.yaml
```

### Validation Commands

**Validate blueprint:**
```bash
tutopanda blueprints:validate --using-blueprint=my-blueprint.yaml
```

**Check providers:**
```bash
tutopanda providers:list --using-blueprint=my-blueprint.yaml
```

**Dry run:**
```bash
tutopanda query --inputs=my-inputs.yaml --dryrun
```

---

## Appendix

### Configuration File Locations

- **CLI Config:** `~/.tutopanda/cli-config.json` (or custom via `--configPath`)
- **Environment:** `.env` in CLI directory or current working directory
- **Blueprints:** `~/.tutopanda/config/blueprints/*.yaml` (copied during `tutopanda init`)
- **Modules:** `~/.tutopanda/config/blueprints/modules/*.yaml`
- **Prompts:** `cli/prompts/*.md`
- **Settings:** `cli/tutosettings.json`

### Movie ID Format

Movie IDs are 8-character prefixes of UUIDs:
- Generated: `a1b2c3d4-5678-9abc-def0-123456789abc`
- Stored as: `movie-a1b2c3d4`

### Supported File Types

- **Blueprints:** `.yaml`
- **Inputs:** `.yaml`
- **Prompts:** `.md`, `.txt`
- **Artifacts:** `.txt`, `.json`, `.png`, `.jpg`, `.mp3`, `.wav`, `.mp4`

### Default Values

- **Blueprint:** *(none – always pass `--using-blueprint`)*
- **Config Path:** `~/.tutopanda/`
- **Storage Base Path:** `builds/`
- **Environment:** `local`

---

## Additional Resources

- **Source Code:** `/home/keremk/developer/tutopanda/cli`
- **Example Blueprints:** `~/.tutopanda/config/blueprints/`
- **Example Inputs:** `<root>/config/inputs-default.yaml`
- **Default Settings:** `cli/tutosettings.json`

For feature requests and bug reports, please open an issue in the Tutopanda repository.
