# Custom Blueprint Configuration System - Design Plan

##Overview

 Enable users to create custom blueprints via configuration files that select and compose existing blueprint sections, allowing
 workflows like "Video from an image" without code changes.

 Current System Analysis

 Blueprint Sections Available:
 - script - Generate script/narration
 - music - Generate background music
 - audio - Generate voiceover audio
 - images - Generate images (text-to-image)
 - video-text - Generate video from text
 - video-image - Generate video from images
 - assembly - Assemble final timeline
 - connections - Cross-section edges

 Current Composition: All 8 sections always included, filtered by conditions (useVideo, isImageToVideo)

 Proposed Solution

 1. Custom Blueprint Configuration Format (JSON)

 File Location: blueprints/video-from-image.json

 {
   "name": "Video from Image",
   "description": "Generate video segments from provided images",
   "version": "1.0",

   "sections": [
     "script",
     "music",
     "audio",
     "video-image",
     "assembly"
   ],

   "config": {
     "segmentCount": 6,
     "imagesPerSegment": 1,
     "useVideo": true,
     "isImageToVideo": true
   },

   "inputs": {
     "required": [
       "InquiryPrompt",
       "SegmentStartImage"
     ],
     "optional": [
       "VoiceId",
       "ImageStyle",
       "Duration"
     ]
   },

   "customEdges": [
     {
       "from": {"kind": "Artifact", "id": "SegmentImage"},
       "to": {"kind": "Producer", "id": "ImageToVideoProducer"},
       "dimensions": ["segment"],
       "note": "Use generated images if not provided"
     }
   ],

   "overrides": {
     "nodes": {
       "StartImageProducer": {
         "when": [
           [{"key": "hasStartingImage", "equals": false}]
         ]
       }
     }
   }
 }

 Alternative Formats Considered:
 - YAML (more readable, requires parser)
 - TOML (good for config, less suitable for nested structures)
 - JSON (best for structured data, already in use)

 2. Implementation Architecture

 Phase 1: Core Blueprint System Extensions

 New Files:
 1. core/src/blueprints/custom.ts - Custom blueprint loader and validator
 2. core/src/blueprints/composer.ts - Blueprint composition logic
 3. core/src/schema/blueprint-config.ts - TypeScript types and validators

 Key Types:
 interface CustomBlueprintConfig {
   name: string;
   description?: string;
   version: string;
   sections: BlueprintSectionId[]; // Select which sections
   config: Partial<BlueprintExpansionConfig>; // Override defaults
   inputs?: {
     required?: InputSourceKind[];
     optional?: InputSourceKind[];
   };
   customEdges?: CustomEdgeDefinition[]; // Add custom connections
   overrides?: {
     nodes?: Record<string, Partial<BlueprintNode>>;
     edges?: Record<string, Partial<BlueprintEdge>>;
   };
 }

 type BlueprintSectionId =
   | "script"
   | "music"
   | "audio"
   | "images"
   | "video-text"
   | "video-image"
   | "assembly"
   | "connections";

 interface CustomEdgeDefinition {
   from: { kind: NodeKind; id: string };
   to: { kind: NodeKind; id: string };
   dimensions?: CardinalityDimension[];
   when?: Condition[];
   note?: string;
 }

 Core Functions:
 // Load and validate custom blueprint
 export function loadCustomBlueprint(
   configPath: string
 ): CustomBlueprintConfig;

 // Compose blueprint from config
 export function composeCustomBlueprint(
   custom: CustomBlueprintConfig,
   availableSections: Record<string, BlueprintSection>
 ): GraphBlueprint;

 // Validate blueprint is complete
 export function validateBlueprint(
   blueprint: GraphBlueprint,
   inputs: InputValues
 ): ValidationResult;

 Phase 2: CLI Integration

 New Files:
 1. cli/src/commands/query.ts - Update to accept --using-blueprint flag
 2. cli/src/lib/blueprint-loader.ts - Load custom blueprints from user directory

 CLI Changes:
 // Add flag to query command
 tutopanda query "Video from an image" \
   --using-blueprint=./blueprints/video-from-image.json \
   --images=./img1.png,./img2.png

 // Or use named blueprints from library
 tutopanda query "Video from an image" \
   --using-blueprint=video-from-image \
   --images=./img1.png,./img2.png

 Blueprint Search Paths:
 1. Absolute path: /path/to/blueprint.json
 2. Relative path: ./blueprints/custom.json
 3. User directory: ~/.tutopanda/blueprints/custom.json
 4. Built-in library: <install-dir>/blueprints/video-from-image.json

 Integration Points:
 // In cli/src/commands/query.ts
 export async function queryCommand(options: {
   query: string;
   usingBlueprint?: string;
   // ... other options
 }) {
   let blueprint: GraphBlueprint;

   if (options.usingBlueprint) {
     // Load custom blueprint
     const customConfig = await loadBlueprintConfig(options.usingBlueprint);
     blueprint = composeCustomBlueprint(customConfig, blueprintSections);
   } else {
     // Use default generation blueprint
     blueprint = generationBlueprint;
   }

   // Rest of query logic...
   const expanded = expandBlueprint(blueprintConfig);
   const graph = createProducerGraph(expanded, catalog);
   // ...
 }

 Phase 3: Built-in Blueprint Library

 Create Standard Blueprints:
 1. blueprints/full-generation.json - Complete workflow (default)
 2. blueprints/video-from-image.json - Image-to-video workflow
 3. blueprints/images-only.json - Still images with audio
 4. blueprints/slideshow.json - Image slideshow with transitions
 5. blueprints/audio-only.json - Podcast/audiobook workflow
 6. blueprints/music-video.json - Music video generation

 Example: images-only.json:
 {
   "name": "Images Only",
   "description": "Generate still images with audio narration",
   "version": "1.0",
   "sections": [
     "script",
     "music",
     "audio",
     "images",
     "assembly"
   ],
   "config": {
     "useVideo": false,
     "isImageToVideo": false,
     "imagesPerSegment": 2
   }
 }

 Phase 4: Validation & Error Handling

 Validation Checks:
 1. All required sections present
 2. All node references valid
 3. No orphaned nodes (nodes without edges)
 4. Required inputs provided
 5. Edge dimensions match node cardinality
 6. Circular dependencies detected
 7. Output artifacts defined

 Error Messages:
 Error: Invalid custom blueprint 'video-from-image.json'
   - Missing required section: 'assembly'
   - Node 'ImageToVideoProducer' requires input 'SegmentStartImage' but no edge provides it
   - Circular dependency detected: ScriptProducer -> AudioProducer -> ScriptProducer

 3. Implementation Roadmap

 Milestone 1: Core Blueprint Composition (Week 1)

 - Create CustomBlueprintConfig types in core
 - Implement composeCustomBlueprint() function
 - Section selection logic
 - Custom edge injection
 - Node override application
 - Unit tests for composition

 Milestone 2: Validation System (Week 1)

 - Blueprint validator implementation
 - Dependency graph analysis
 - Input/output validation
 - Comprehensive error messages
 - Unit tests for validation

 Milestone 3: CLI Integration (Week 2)

 - Add --using-blueprint flag to query command
 - Blueprint file loader
 - Search path resolution
 - Integration with existing query flow
 - CLI error handling
 - Integration tests

 Milestone 4: Built-in Blueprint Library (Week 2)

 - Create 6 standard blueprint configs
 - Documentation for each blueprint
 - Example usage in docs
 - Test all built-in blueprints

 Milestone 5: Documentation & Polish (Week 3)

 - User guide: "Creating Custom Blueprints"
 - API reference for blueprint config format
 - Migration guide for existing users
 - CLI help text updates
 - Example blueprints in repo

 4. User Experience Flow

 # Discover available blueprints
 tutopanda blueprints list

 # Show blueprint details
 tutopanda blueprints show video-from-image

 # Use custom blueprint
 tutopanda query "Create a product demo" \
   --using-blueprint=video-from-image \
   --images=./product-*.png \
   --voice=professional \
   --output=./demo.mp4

 # Validate custom blueprint before using
 tutopanda blueprints validate ./my-custom-blueprint.json

 # Create new blueprint from template
 tutopanda blueprints init --name=my-workflow

 5. Technical Considerations

 Backward Compatibility:
 - Default behavior unchanged (uses full generation blueprint)
 - Existing ProjectConfig continues to work
 - Custom blueprints opt-in via CLI flag

 Performance:
 - Blueprint composition happens once at planning time
 - No runtime overhead
 - Cached expanded blueprints for repeated queries

 Extensibility:
 - Plugin system for custom sections (future)
 - Blueprint inheritance (future: extend existing blueprints)
 - Parameterized blueprints (future: template variables)

 Security:
 - No code execution in config files (JSON only)
 - Schema validation on load
 - Sandboxed composition (no file system access)

 6. Alternative Approaches Considered

 Option A: Programmatic Blueprint Builder API
 const blueprint = new BlueprintBuilder()
   .addSection('script')
   .addSection('video-image')
   .addSection('assembly')
   .connect('SegmentImage', 'ImageToVideoProducer')
   .build();
 ❌ Requires code changes, not user-friendly

 Option B: DSL (Domain Specific Language)
 blueprint "Video from Image" {
   sections: script, video-image, assembly
   connect SegmentImage -> ImageToVideoProducer [segment]
 }
 ❌ Requires custom parser, learning curve

 Option C: YAML Configuration ✓ Alternative format
 name: Video from Image
 sections:
   - script
   - video-image
   - assembly
 config:
   useVideo: true
   isImageToVideo: true
 ✅ Could support alongside JSON

 7. Success Criteria

 - User can create custom blueprint in < 5 minutes
 - Custom blueprint loads in < 100ms
 - Validation errors are clear and actionable
 - Built-in blueprints cover 80% of use cases
 - Documentation complete with examples
 - Zero breaking changes to existing API

 8. Future Enhancements

 Phase 2 Features:
 - Blueprint templates with variables
 - Visual blueprint editor (web UI)
 - Blueprint marketplace/sharing
 - Conditional sections based on inputs
 - Blueprint versioning and migration

 Example Templated Blueprint:
 {
   "name": "Multi-Language Video",
   "parameters": {
     "languages": ["en", "es", "fr"]
   },
   "sections": ["script", "audio-{{language}}", "video", "assembly"]
 }

 Recommendation

 Start with Milestone 1-3 (Core composition + CLI integration). This provides immediate value and validates the design before
 investing in the full library and documentation.

 JSON format is the best choice for initial implementation, with YAML support added later if needed.

 Critical Success Factor: Blueprint validation must provide excellent error messages, as this is where users will spend time
 debugging.