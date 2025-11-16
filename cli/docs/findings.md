 Findings

  - cli/config/blueprints/image-audio.toml:118-119 wires VoiceId and Emotion into AudioGenerator[i], but there are no [[inputs]] entries for
  either field anywhere in the file. The blueprint therefore fails schema validation (the parser won’t find those nodes) and the spec
  is incomplete because it never tells users how to supply a voice or emotion selection.
  - cli/config/blueprints/image-audio.toml:68-72 declares SegmentAudio with itemType = "image". Downstream docs and the timeline producer
  both treat SegmentAudio as MP3s, so this is an outright type mismatch that will make the planner treat narration audio artifacts
  as images.
  - The new fan-in edges are underspecified and clash with the refactor plan. Each SegmentImage[i][j] and SegmentAudio[i] edge
  funnels into a single TimelineComposer.ImageSegments / .AudioSegments input (cli/config/blueprints/image-audio.toml:122-124), yet the
  major-refactor doc explicitly limits input collapsing to cases with exactly one upstream artefact and drops alias maps entirely
  (cli/docs/major-refactor.md:184-197). That means the planner will either throw (“Input receives artefacts A and B”) or pass only
  canonical Artifact:SegmentImage[i][j] IDs to TimelineProducer. The Timeline docs still expect logical aliases like ImageSegments[i]
  (providers/docs/timeline-schema.md:129-188), so there is no defined way to express or consume this first fan-in node—the plan/graph
  can’t be built or executed as written.
  - TimelineProducer now requires a Duration input (cli/config/blueprints/timeline.toml:26-43, also fed from the parent blueprint at cli/
  blueprints/image-audio.toml:16-19 & 124), but the schema document never mentions it in the configuration examples or behavior
  descriptions (providers/docs/timeline-schema.md:119-199). Operators have no guidance on what the value represents (total movie
  length? override when no master track?), so the spec is inaccurate/outdated.
  - Because the refactor removes alias names after collapse (cli/docs/major-refactor.md:190-195), the clip configuration that
  references ImageSegments[i] / AudioSegments (providers/docs/timeline-schema.md:129-188; cli/config/blueprints/timeline.toml:55-57) can
  no longer be resolved: the runtime will only see canonical artefact IDs such as Artifact:SegmentImage[i][j], not the blueprint-
  local names. Until the spec is updated to state how clips bind canonical IDs (or the alias map is reinstated), the documented
  configuration cannot work.

  Next steps

  1. Fix the blueprint data model (add the missing VoiceId/Emotion inputs and correct SegmentAudio’s type) so the parser can load it.
  2. Update providers/docs/timeline-schema.md to cover the Duration input and describe how TimelineProducer consumes canonical IDs
  post-refactor.
  3. Define and implement explicit fan-in semantics (e.g., declare TimelineComposer.ImageSegments[i][j] targets or add a dedicated
  aggregation node) before trying to build or execute the new timeline graph.