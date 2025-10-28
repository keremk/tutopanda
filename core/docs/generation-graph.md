# Build System for Generating Short Movies

## Broad Context
This core library is a build system that allows users the specify a query (e.g. "Tell me about the Civil War") together with some configurations and the AI goes ahead, does a research, creates a script and creates all the necessary assets like images, videos, narration audio, background music etc. to create a timeline for a video presentation. The timeline will then be fed into a Remotion video to generate a full video presentation. 

The library will expose an API that will be used both from a locally running CLI and also from a cloud hosted system. The API will be asking for a generation or regeneration of a movie (using the timeline which is fed into Remotion along with links to the artefacts generated.) The storage here is intended for a single movie but will include all the metadata and revision information needed. Some important points:
- For the first generation: The API will accept a user inquiry prompt ("I want to learn about Civil War"), default configurations and user specified overrides. 
    - The outputs will be the generated timeline with links to assets, the generated prompts, error states (if there are errors)
- For the subsequent revision requests, so the API will accept the necessary parameters. 
    - It may be that the full generation did not end up generating all required artefacts and the movie timeline, so the user can change some of the configurations or simply retry.
    - User may change some of the generated prompts and retry the generation. Or chaneg some of the configurations (e.g. use different voice)

We expect multiple regenerations of the movie as the users try, tweak or error, so the revisions may grow in median case to 5-10 revision and in 90 percentile up to 20-30. This is intended for generating somewhat short movies (at least in the short term) due to the cost of generation of all artefacts via AI models. The duration will be initially capped to 5min, max 30 segments of 10s each. And the number of images per segment will be capped to 5. So at max we will be generating 150 images.

## Generation Graph Diagram
This diagram attempts to explain the data flow of the video timeline generation. 

- *Configuration & User Input*: (*InputSource*) These are denoted by rectangles and one diamond shape with a red background, where the user creates the initial input through configuration settings (e.g. edit-configuration) or editing prompts directly in the UI or by using the CLI.
    - The diamond shaped *UseVideo* and *IsImageToVideo* is a special one that instructs conditional generation (video or image based timeline)
    - If there is denotion on the top right corner (e.g. n, m, (n+m)), those show the cardinality of those. I.e. User Modified Script with n -> there may be n instances of those.
    - These are the user specified configurations or user editable (when editing a generated part of the overall video) fields.
        - *InquiryPrompt*: The user prompt that starts the overal video lecture generation
        - *Duration*: The user configured duration of the video. Number of segments(n) are deduced from this, as each segment is 10s long. The duration can only be multiples of 10s up to 3 minutes (in this initial MVP)
        - *Audience*: An enumerated list of intended audience for the video. This changes the tone, difficulty and depth of the script. 
        - *Language*: The language to use for generating the content, it is an enumerated list of languages
        - *MusicPromptInput*: User modified music prompt. User can edit the auto generated music generation prompt in the UI.
        - *SegmentNarrationInput*: User modified narration script for the segment. 
        - *VoiceId*: The voiceId that defines the voice to use to narrate the segment. Depends on the audio generation model.
        - *Emotion*: (Optional) emotion description that helps set the tone of the narration. Depends on the audio generation model.
        - *UseVideo*: (Default is False) an overall video level flag that instructs whether to use video or images (using KenBurns or similar effects) in each segment. This cannot be changed per segment (currently)
        - *ImagesPerSegment*: The number of images to generate per segment
        - *SegmentImagePromptInput*: User modified segment image prompt, if the user choose the modify to auto generated prompt.
        - *ImageStyle*: Enumerated list of image styles to set the style of image to be generated.
        - *Size*: Enumerated list of the size of image (or video) to be generated. This depends on the models.
        - *AspectRatio*: Enumerated list of aspect ratios for the image (or video) to be generated. This depends on the models.
        - *IsImageToVideo*: A flag to use image to video vs. text to video for video generation. (currently not implemented)
        - *StartingImagePromptInput*: User modified starting image prompt for the video in the segment.
        - *MovieDirectionPromptInput*: User modified movie direction prompt for the video in the segment.
        - *AssemblyStrategy*: An enumerated list of assembly strategy for segments that gets fed into the timeline assembler. Does not have any impact in the generations only impacts timeline assembly at the end.
- *Text or Assets Generated*: (*Artifact*) These are denoted by rectangles with blue background and are generated through the process. When the flow is first run, they don't exist. In subsequent runs new versions are generated replacing the older ones.
    - If there is denotion on the top right corner denoted by n, m, (n+m), that shows the cardinality. If there is nothing denoted, then cardinality is 1. E.g. SegmentNarration with n -> there are n instances of those. (n: # of segments in video, m: # of images per segment)
    - These are the assets we generate:
        - *SegmentNarration*: Contains the text of the script to be narrated per segment (n)
        - *MovieSummary*: Contains the summary of the script. (1)
        - *MovieTitle*: Contains the title of the script. (1)
        - *MusicPrompt*: Contains the text prompt for generating music. (1)
        - *MusicTrack*: The music asset (mp3) for the whole video. (1)
        - *SegmentAudio*: The narration audio asset (mp3). (n)
        - *SegmentImagePrompt*: Contains the prompt to generate segment images. (n*m)
        - *SegmentImage*: The image asset. (n*m)
        - *StartingImagePrompt*: Contains the prompt to generate starting images for the video in a segment. (n)
        - *TextToMovieDirectionPrompt*: Contains the prompt for generating the video using text only. (n)
        - *ImageToMovieDirectionPrompt*: Contains the prompt for generating the video using both image and text. (n)
        - *StartingImage*: The image asset used as an input to generate video in a segment. (n)
        - *SegmentVideo*: The video asset in a segment. (n)
- *Producers*: (*Producer*) These are denoted by circles with a green background. They are external API calls to LLMs, or model (audio, video, music etc.) generators to generate text or other asset types. 
    - The incoming arrows show the input for those generators and they represent their dependencies. I.e. if any of the incoming sources change (e.g. user changing a setting or prompt, or a generated asset changing because of an upstream generator) then they need to regenerate the text or assets.
    - We denote the number of executions (i.e. calls to these API providers to generate) as 1, n, m execution. Since these generations take multiple minutes or more time, it is important to be able to concurrently send those requests. But at the same time, if we send too many requests than we run the risk of being rate limited (Also the classic n+1 queries problem, but in these case 1 user request causing n+1 -- even more requests to API providers downstream)
    - These are the current generators (Producers) we have: (n: # of segments in video, m: # of images per segment)
        - *ScriptProducer*: LLM call that generates the full text script of the video in n segments. (1 call generates n text scripts, summary and title)
        - *TextToMusicPromptProducer*: LLM call that generates a music generation prompt. (1 call to the model )
        - *MusicProducer*: Music generation model call that takes the prompt and generates music -- background score. (1 call to the model)
        - *AudioProducer*: Voice audio generation model call that takes the script (for a given segment out of n) and produces an audio narration. (n calls to the model) 
        - *TextToImagePromptProducer*: LLM call that generates a prompt for the image. (n calls to the model each generating m prompts for a total of (n*m))
        - *TextToImageProducer*: Image generation model call that takes the image prompt and generates image. (n*m calls to the model)
        - *TextToVideoPromptProducer*: LLM call that generates a prompt generating video from text only. (n calls to the model)
        - *ImageToVideoPromptProducer*: LLM call to generate a movie direction prompt and a prompt for a starting image. (n calls to the model)
        - StartingImageProducer (*TextToImageProducer*): Image generation model call that takes image prompt and generates the starting image. This image is only used as an input to the ImageToVideoProducer. (n calls to the model)
        - *TextToVideoProducer*: Video generation model call to generate video from text. (n calls to the model)
        - *ImageToVideoProducer*: Video generation model call to generate video from an image and text. (n calls to the model)
- Types of Generation: These are denoted by not-filled rectangles surrounding the related nodes. The represent a logical grouping types of asset generation for the timeline.
    - There are 5 of them. From left to right: 
        - *MusicGeneration*
        - *AudioNarrationGeneration* 
        - *ImageGeneration*
        - *VideoFromTextGeneration*
        - *VideoFromImageGeneration*
    - These finally make up all the tracks and clips in those tracks in the timeline
- Timeline Assembler: Denoted by a yellow background rectangle. Takes all the generations and creates a stitched timeline with tracks to be fed into remotion to play or render.

## Other observations:
- This is a directed acyclic graph composed of edges (arrows) that connects InputSources and Artifacts to Producers.
    - Each Producer has an incoming and outgoing nodes. Incoming nodes are the dependencies of the Producer. If one of them is dirty, the Producer needs to run again and generate the outgoing nodes.
    - InputSources don't have any incoming nodes (i.e. dependencies). They are edited by the users.
    - Artifacts always have an incoming node, which always is a Producer. The Artifacts are generated by Producers. 
    - The nodes are shown as single rectangles, circles on the diagram but they have a cardinality number on their left corner which shows the actual numbes of instance of each node. (For Artifacts they are identified as "x executions" where x = 1, n, (n*m) etc.)
    - Here is how you can use cardinality numbers to expand the diagram to the actual number of nodes and edges: 
        - If the cardinality of the incoming node is 1, and the cardinality of the outgoing node is also 1, then it is equivalent to 1 node connected to another with 1 edge. (e.g. MusicPrompt -> MusicProducer -> MusicTrack)
        - If the cardinality of the incoming node is 1, and the cardinality of the outgoing node is n, then it means that the incoming node is fanning out to n nodes through n edges. (e.g. User Prompt ->LLM (ScriptProducer) -(n)-> SegmentNarration1, SegmentNarration2 ...)
        - If the cardinality of the incoming node is n, and the cardinality of the outgoing node is n, then it means that there are n nodes connecting to n other nodes through n edges with a matching index. (E.g. StartingImagePrompt1 -> TextToImageProducer1, StartingImagePrompt2 -> TextToImageProducer2, ... )
        - If the cardinality of the incoming node is n, and the cardinality of the outgoing node is 1, then it means that the incomings nodes are fanning in to 1 node as their n dependency nodes. Currently there is no example of such node.
- IMPORTANT SIMPLIFICATION:
    - InputSources do not actually have to be in the fully expanded final tree, since they are not generated and always user specified. They can only be annotations to the Producer nodes as dependencies. This simplifies the tree and dependency management significantly.
    - If a Producer node is creating 2 or more different types of Artifacts but in a single pass (and usually in reality this will be one asset of JSON type), then we can special case this as follows:
        - ScriptProducer creating MovieSummary, MovieTitle and SegmentNarration(n) - 3 types of assets.
- Producer nodes correspond to the place where we gather the incoming node data and feed that into the API call for the LLM or the Asset Gen Model. And we decide if a Producer needs run, by looking at their incoming nodes and see if any of them are dirty (i.e. changed). If so then the Producer needs to run. 
- For the 5 different types of generation:
    - MusicGeneration: 1 + 1 calls. Two stages LLM -> MusicProducer
    - AudioNarrationGeneration: n calls. One stage AudioProducer. All parallelizable 
    - ImageGeneration: n + (n x m) calls. Two stages LLM -> TextToImageProducer. First n parallelizable then (n x m) parallelizable
    - VideoFromTextGeneration: n + n calls. Two stages LLM -> TextToVideoProducer. All stages n parallelizable, waiting on previous stage.
    - VideoFromImageGeneration: n + n + n calls. Three stages LLM -> TextToImageProducer -> ImageToVideoProducer. All stages n parallelizable, waiting on previous stage.
- Latency: (made up numbers for illustration)
    - Median
        - ScriptProducer = 50s
        - TextToMusicPromptGen = 5s
        - MusicProducer = 10s
        - AudioProducer = 10s
        - TextToImagePromptProducer = 5s
        - TextToImageProducer = 30s
        - TextToVideoPromptProducer = 5s
        - TextToVideoProducer = 90s
        - ImageToVideoPromptProducer = 5s
        - StartingImageProducer = 30s
        - ImageToVideoProducer = 120s
- Latency Formula: (max parallization) 
    - MusicGeneration = TextToMusicPromptGen + MusicProducer
    - AudioNarrationGeneration = AudioProducer (all parallelizable)
    - ImageGeneration = TextToImagePromptProducer + TextToImageProducer
    - VideoFromTextGeneration = TextToVideoPromptProducer + TextToVideoProducer
    - VideoFromImageGeneration = ImageToVideoPromptProducer +  StartingImageProducer + ImageToVideoProducer
    - !UseVideo:
        - ScriptProducer + max(MusicProducer, AudioNarrationGeneration, ImageGeneration) 
    - UseVideo & !IsImageToVideo:
        - ScriptProducer + max(MusicProducer, AudioNarrationGeneration, VideoFromTextGeneration)
    - UseVideo & IsImageToVideo:
        - ScriptProducer + max(MusicProducer, AudioNarrationGeneration, VideoFromImageGeneration)
- Median Latency (if all parallel): 
    - !UseVideo: 50 + max(15, 10, 35) = 85s
    - UseVideo & !IsImageToVideo: 50 + max(15, 10, 95) = 145s
    - UseVideo & IsImageToVideo: 50 + max(15, 10, 155s) = 205s
- Inherent parallelism: Parallelism depends simply on the depth of the tree where depth is the # of Producer nodes in a given branch. 

## Generation and Regenaration Process
- We will always need a pass of the algorithm as below for preparation of jobs and then run the runner to execute them

### Blueprint Graphs
- We will create 3 blueprint subgraphs encoded in a typescript file. There is no plan for creating these blueprints using UI. 
    - *ImageOnlyGraph*: This one is for users who specify *UseVideo*=false configuration, which generates a movie with image only segments that are animated using traditional effects like KennBurns etc.
        - In the Graph image, this corresponds to the branch under UseVideo=no, up to the SegmentImage node, also conveniently specified within an empty rectangle (ImageGeneration)
    - *VideoByTextGraph*: This one is for user who specify *UseVideo*=true && *IsImageToVideo*=false configuration, which generates video segments but generates the video from a text only. These are faster and cheaper to generate but the starting images can not be specified.
        - In the Graph image, this corresponds to the branch under UseVideo=yes && IsImageToVideo=no, up to the SegmentVideo node, also conveniently specified within an empty rectangle (VideoFromTextGeneration)
    - *VideoByImageGraph*: This one is for users who specify *UseVideo*=true && *IsImageToVideo*=true configuration, which generates video segments from starting images and text prompts. These are slower and more expensive but has the potential to give better results.
        - In the Graph image, this corresponds to the branch under UseVideo=yes && IsImageToVideo=yes, up to the SegmentVideo node, also conveniently specified within an empty rectangle (VideoFromImageGeneration)
- We will create 2 other blueprint subgraphs:
    - *MusicGeneration* & *AudioNarrationGeneration* (again as seen in their corresponding boxes)
- There will be a final encapsulating blueprint graph that composes the above subgraphs with their names and conditions. 
- The blueprint graphs indicate the cardinalities but does not expand those as they can only be expanded when the user wants to generate the movie with their inputs (n, m, useVideo, isImageToVideo)

### What triggers a regenaration:
- This is always an explicit call by the user. But below cases may require a regeneration request by user:
    - Initial pass has some errors that were not resolved by retrying in the Workflow tool and possibly required user intervention to change prompts (4xx type errors). Or the retries did not succeed within the allowed attempts but a later try can resolve (5xx type errors)
    - User does not like some of the generations and manually edits the prompts or configurations.

### Planning Algorithm
- Planning needs to first expand the blueprint graphs according to the cardinality and conditions specified in the inputs.
    - The conditions useVideo and isImageToVideo can be specified on a per segment basis or can be globally set for the whole movie. So the expansion needs to take that into account when choosing the subgraphs to create the full expanded graph.
- We need to initalize the storage structure (folders, revisions etc.) for the movie generation 
- We will use a topological search using Kahn's algorithm to generate layers of executions queued up based on readiness of their inputs. Planning runs always before a generation and regeneration to identify which subgraphs need to be executed and produce new artifacts.

### Execution
- The plan generated (in the form of queues and lists of jobs that can be done in parallel in queues), the executor will go through the plan and start issuing requests to LLM and model providers through the adopters. 
- The artefact and all necessary metadata storage: (using FlyStorage abstraction and plugins)
    - LocalStorage Plugin: Stored locally in the machines (or sandbox) filesystem
    - S3Storage Plugin: Stored in an S3 compatible cloud store.
- Producers:
    - These are API calls to various LLM and Model providers using different models. 
    - These will be implemented in this core package and used by CL
- Execution Loop:
    - The implementation of this loop is highly dependent on whether it is happening locally on a machine or in a cloud using Vercel Workflow.
    - Rate limiting, batching/grouping of concurrent requests are also highly dependent.
    - At this point we will have 2 separate implementations in the CLI and Server packages.
    - The reusable utility calls will be implemented here.

## Data Storage Strategy
- **Self-containment**: Each movie (ID: e.g., `movie_civilwar_001`) lives in its own root folder (local FS: `./builds/${movieId}/`; S3: `s3://bucket/videos/${movieId}/`).
- **Versioning**: Incremental partial revisions (`revN/`) for efficiency during regens, with app-level path resolution (no symlinks, app-level resolution; string prefix swaps via `metadata.active_assets_prefix`). Periodic consolidation (every 3-4 revs) flattens to self-contained full-rev folders to prevent fragmentation.
- **Append-Only Metadata**: JSONL for history (e.g., `inputSources.jsonl`, `artifacts.jsonl`) ensures audits without overwrites.
- **Robustness**: Atomic writes (temp → rename); idempotency via hashes; S3 lifecycle rules for auto-prune (e.g., expire rev<3 after 7 days).
- **CLI/UI Agnostic**: Paths are relative; core lib abstracts FS/S3.

The structure is lightweight: ~1MB metadata + 50-200MB assets per movie (post-consolidation). Consolidation runs automatically post-rev (e.g., via runner hook) or on CLI `movie-builder consolidate`.

#### Complete Folder Structure
```
builds/movie_civilwar_001/  # Root (per-movie; S3 prefix: videos/movie_civilwar_001/)
├── metadata.json            # High-level summary (1KB)
├── configuration.json       # Current editable MovieConfig (5-10KB)
├── assets/                  # Binary assets (50-200MB total)
│   ├── current/             # Virtual alias to active rev (no files; resolved in code)
│   ├── rev0/                # Initial full rev (self-contained post-consolidation)
│   │   ├── narration/       # Audio clips
│   │   │   ├── seg0.mp3
│   │   │   ├── seg1.mp3
│   │   │   └── seg2.mp3
│   │   ├── images/          # Image assets (n=3 segments, m=2 images/seg)
│   │   │   ├── seg0/
│   │   │   │   ├── img0.png
│   │   │   │   └── img1.png
│   │   │   ├── seg1/
│   │   │   │   ├── img0.png
│   │   │   │   └── img1.png
│   │   │   └── seg2/
│   │   │       ├── img0.png
│   │   │       └── img1.png
│   │   ├── music/           # Background music
│   │   │   └── background.mp3
│   │   └── starting_images/ # Optional: For video mode (not used here)
│   │       ├── seg0.png
│   │       └── seg1.png
│   ├── rev1/                # Partial: e.g., new audio only (pre-consolidation)
│   │   └── narration/
│   │       ├── seg0.mp3     # Updated voice
│   │       ├── seg1.mp3
│   │       └── seg2.mp3
│   └── rev3/                # Consolidated full (post-merge of rev0-2; renames drop "_cons")
│       ├── narration/       # All from rev1 + others copied
│       │   ├── seg0.mp3
│       │   ├── seg1.mp3
│       │   └── seg2.mp3
│       ├── images/          # All from rev0 + rev2 seg1 tweaks
│       │   ├── seg0/
│       │   │   ├── img0.png
│       │   │   └── img1.png
│       │   ├── seg1/
│       │   │   ├── img0.png  # Tweaked
│       │   │   └── img1.png
│       │   └── seg2/
│       │       ├── img0.png
│       │       └── img1.png
│       └── music/
│           └── background.mp3
└── dag/                     # Build metadata (~500KB cumulative)
    ├── producers.json       # Static expanded DAG (10-20KB)
    ├── inputSources.jsonl   # Append-only InputSource history (1-5KB per rev)
    ├── artifacts.jsonl      # Append-only Artifact history (5-20KB per rev)
    ├── snapshots/           # Per-rev states (5-10KB each)
    │   ├── rev0.json
    │   ├── rev1.json
    │   └── rev3.json        # Consolidated
    ├── plans/               # Per-rev job plans (2-5KB each)
    │   ├── rev0-plan.json
    │   ├── rev1-plan.json
    │   └── rev3-plan.json
    ├── jobs/                # Per-job outcomes (1-2KB each)
    │   ├── j1-script_producer-rev0.json
    │   └── j2-audio_producer-seg0-rev1.json
    └── checkpoints/         # Per-rev layer recovery (1KB each)
        ├── rev0-layer3-complete.json
        └── rev1-layer1-complete.json
```

#### Detailed Explainers
Each top-level item and sub-folder is explained below, including purpose, contents, usage, and lifecycle (e.g., how it handles regens/consolidation). Files are JSON (unless noted); sizes are approximate for n=3, m=2.

- **metadata.json** (Root; ~1KB; updated on every build/regen/consolidation):
  - **Purpose**: Single source of truth for the movie's high-level state; used by CLI/UI for status polling (e.g., "is dirty?") and path resolution (e.g., active prefix for `current/`).
  - **Contents**: `{movie_id: "movie_civilwar_001", status: "succeeded|planned|running|failed", latest_revision: 3, active_assets_prefix: "assets/rev3/", oldest_kept_rev: 1, total_size_gb: 0.15, created_at: "2025-10-26T10:00:00Z", updated_at: "..."}`.
  - **Usage**: 
    - Init: Written with defaults (status="planned", rev=0).
    - Regen: Increment rev, update status/updated_at.
    - Consolidation: Set active_prefix to new consolidated rev; bump oldest_kept_rev.
    - CLI: `movie-builder status` reads this for overview.
  - **Lifecycle**: Always present; atomic update (temp write + rename). Pruned only on full movie delete.

- **configuration.json** (Root; ~5-10KB; overwritten on edits):
  - **Purpose**: Editable user config (MovieConfig schema); serves as the "current" InputSources for planning/dirty detection.
  - **Contents**: Full Zod-validated MovieConfig JSON: `{general: {duration: "30", audience: "Adults", voiceID: "deep_narrator", useVideo: false}, image: {imagesPerSegment: 2, segmentPrompts: ["auto0", "tweaked1", "auto2"]}, narration: {voiceID: "deep_narrator"}, ...}`. Includes per-segment overrides (e.g., segmentPrompts array for tweaks).
  - **Usage**: 
    - Init: From defaults + inputs (e.g., query → inquiry_prompt).
    - Edit: CLI `movie-builder edit --field voiceID --value "deep_narrator"` patches via jq-like logic; validates schema.
    - Dirty Detection: Hash whole file vs. snapshot's inputSource_hashes to detect changes.
  - **Lifecycle**: Overwritten on edits (backup via inputSources.jsonl). Not versioned here—history in dag/.

- **assets/** (~50-200MB; binaries only):
  - **Purpose**: Stores generated files (MP3, PNG, MP4); versioned by rev to support rollbacks without data loss.
  - **Sub-Folders & Contents**:
    - **current/**: Virtual (no files). Purpose: Standardized paths in timelines (e.g., "assets/current/narration/seg0.mp3"). Usage: Core lib resolves to active_prefix (e.g., via `resolvePath("assets/current/...") → "assets/rev3/..."`). App-level string replace; CLI: Transparent—`movie-builder preview` uses resolved paths.
    - **revN/** (e.g., rev0, rev1, rev3; per-rev folders, ~10-100MB each): 
      - Purpose: Versioned binaries; partial during regens (e.g., rev1: only new narration/), full post-consolidation (rev3: all assets copied).
      - Contents: Semantic sub-paths: `narration/seg{0-2}.mp3` (audio), `images/seg{0-2}/img{0-1}.png` (images), `videos/seg{0-2}.mp4` (if useVideo), `music/background.mp3`, `starting_images/seg{0-2}.png` (video intermediates). No text—binaries only.
      - Usage: Written during Producer execution (e.g., audio_producer → upload MP3 to current rev prefix). Referenced in artifacts.jsonl (`asset_path`) and snapshots.timeline (`imageUrl`, `audioUrl`). CLI: `movie-builder download --asset narration_asset_0` resolves and saves.
  - **Lifecycle**: 
    - Init: rev0/ created full.
    - Regen: New revN/ with partials (e.g., only changed binaries).
    - Consolidation: Copy referenced files to rev{new}_cons/ (S3 CopyObject; local cp); rename to rev{new}/; prune old revs.
    - Prune: S3 lifecycle (expire non-active >7 days); CLI `prune --keep-last 2` deletes oldest revs.

- **dag/** (~500KB cumulative; metadata for builds):
  - **Purpose**: All non-binary state; enables planning, dirty propagation, and audits. Append-only where possible for immutability.
  - **Sub-Files/Folders & Contents**:
    - **producers.json** (~10-20KB; static post-init):
      - Purpose: Immutable DAG definition; used for BFS dirty propagation and topo planning.
      - Contents: `{producers: [{id: "script_producer", inputs: ["inquiry_prompt"], outputs: ["movie_summary", "segment_script_0", ...], provider: "openai", cardinality: {in: "1", out: "n"}}], edges: [{from: "inquiry_prompt", to: "script_producer"}, ...], config: {n:3, m:2, useVideo: false}, metadata: {expanded_at: "2025-10-26T10:00:00Z"}}`.
      - Usage: Loaded during planning to expand subgraph (e.g., dirty "narration_config" → traverse edges to affected Producers/Artifacts).
      - Lifecycle: Written once on init (expanded from templates); re-written only if config toggles branches (e.g., useVideo=true).
    - **inputSources.jsonl** (~1-5KB per rev; append-only):
      - Purpose: History of user/system edits to config (InputSources); enables hash-based dirty detection.
      - Contents: JSON lines (one per InputSource per rev): e.g., `{"id": "narration_config", "rev": 1, "content": {voiceID: "deep_narrator"}, "hash": "sha:xyz987", "edited_by": "user", "created_at": "2025-10-26T10:05:00Z"}`.
      - Usage: Tail for latest per ID; compare hashes to snapshots for changes (e.g., CLI edit appends line). Pruned to keep >oldest_kept_rev.
      - Lifecycle: Appended on edits (e.g., voiceID tweak); consolidated revs append "mirrored" lines with new paths.
    - **artifacts.jsonl** (~5-20KB per rev; append-only):
      - Purpose: Full history of Producer outputs (Artifacts); tracks text/binary provenance for regens/audits.
      - Contents: JSON lines (one per Artifact per rev): Text: `{"id": "segment_script_0", "rev": 0, "content_hash": "sha:fgh123", "full_hash": "sha:full0", "deps": ["script_producer"], "content": "The war began...", "asset_path": null, "status": "succeeded", "produced_by": "script_producer", "created_at": "..."}`; Binary: `{"id": "narration_asset_0", "rev": 1, ..., "content": null, "asset_path": "assets/rev1/narration/seg0.mp3"}`. Includes non-timeline like prompts/starting_images.
      - Usage: Query for latest by ID/rev (e.g., CLI `view --artifact segment_image_prompt_1_0` extracts content/path). Hashes for idempotency (skip if unchanged).
      - Lifecycle: Appended per Producer run; pruned old lines on consolidation; S3 lifecycle for full file if >1MB.
    - **snapshots/** (Per-rev; ~5-10KB each):
      - Purpose: Point-in-time full state for rollback/comparison; embeds timeline for quick export.
      - Contents: Per `revN.json`: `{revision: 1, inputSource_hashes: {...}, artifact_hashes: {...}, plan_ref: "plans/rev1-plan.json", timeline: {duration: 30, tracks: {visual: {clips: [...]}, voice: {clips: [...]}, ...}}, status: "succeeded", changed_since_prev: ["narration_config"], created_at: "..."}`. Timeline refs resolved paths (e.g., "assets/rev1/narration/seg0.mp3").
      - Usage: Load latest for current state; diff for history (CLI `diff --from 0 --to 1`). Timeline for Remotion render (CLI `render --rev 1`).
      - Lifecycle: One per rev; keep 2-3 latest (prune older); consolidated revs copy+remap from priors.
    - **plans/** (Per-rev; ~2-5KB each):
      - Purpose: Serialized job queues for execution; enables partial regens.
      - Contents: `rev1-plan.json`: `{layers: [[{jobId: "j2", producer: "audio_producer", parallel: 3, deps: ["segment_script_0"]}], ...], queue_hash: "sha:plan1"}`.
      - Usage: Runner consumes for topo execution; CLI `plan --dry-run` previews layers.
      - Lifecycle: Generated per build/regen; deleted post-execution (keep for debug).
    - **jobs/** (Per-job; ~1-2KB each):
      - Purpose: Detailed outcomes for observability/retries (e.g., cost, errors).
      - Contents: `j2-audio_producer-seg0-rev1.json`: `{jobId: "j2", producer: "audio_producer", status: "succeeded", outputs: ["narration_asset_0"], cost: 0.05, provider: "elevenlabs", error: null, started_at: "...", completed_at: "..."}`.
      - Usage: Aggregate for billing (sum costs); debug failures (CLI `logs --job j2`). Retries reference this for idempotency.
      - Lifecycle: Created per Producer call; kept indefinitely (small); S3 lifecycle prune >90 days.
    - **checkpoints/** (Per-rev/layer; ~1KB each):
      - Purpose: Resume points for long-running builds (e.g., after crash mid-layer).
      - Contents: `rev1-layer1-complete.json`: `{revision: 1, layer: 1, completed_jobs: ["j2"], next_layer: 2, updated_at: "..."}`.
      - Usage: Runner polls on resume; skips completed layers.
      - Lifecycle: Written per layer; cleared post-rev success.

