# Command Line Interface Definition

## Initialize Tutopanda
Initialize tutopanda CLI before use. Expected to be called once

```bash
tutopanda init --rootFolder=/Path/To/Folder --defaultConfig=/Path/To/DefaultConfig.json
```
- Creates the initial folder structures and default config file. 
    - If rootFolder is not specified, it uses ~/.tutopanda as the root.
        - The builds will go under a `builds/` folder (always)
        - Each build will be under a folder `movie-{movieId}` under `builds/`
    - If defaultConfig is not specified, it creates a default config
        - `{rootFolder}\default-config.json`

### Default Config Values:
Added some sane defaults to use (some of them not yet defined, will define in later milestones)
```json
{
  "General": {
    "UseVideo": false, // Global, can be overriden per segment
    "Audience": "general", // Enumerated audiences list, if set to custom then described in AudienceCustom
    "AudiencePrompt": "", // If Audience is set to custom then specified as prompt here. 
    "Language": "en", // Allowed values: en, de, es, fr, tr (for now)
    "Duration": 60, // in seconds, SegmentCount is deduced from Duration/10 (each segment always 10s)
    "AspectRatio": "16:9", // 1:1, 3:2, 2:3, 4:3, 3:4, 16:9, 9:16, 21:9
    "Size": "480p", // 480p, 720p, 1080p
    "Style": "Ghibli", // Enumerated list of styles, and there is the last option "Custom". Ghibli, Pixar, Anime, Watercolor, Cartoon, PhotoRealistic, Custom
    "CustomStyle": "", // Defines a prompt for a style definition if Style == Custom
  },
  "Audio" : {
    "Voice": "Atlas", // Will depend on the model and provider, this will be a user-friendly name and mapped by the Producer to an actual VoiceId that the model expects
    "Emotion": "dramatic", // Will depend on the model and provider
    "Model": "", // TBD
    "Provider": "", // TBD
  },
  "Music": {
    "Model": "", // TBD
    "Provider": "", // TBD
  },
  "ScriptGeneration": {
    "Model": "", // TBD
    "Provider": "", // TBD
    "ReasoningEffort": "", // If the model supports it, depends on the model
  },
  "Image": {
    "Format": "PNG | JPG", Enumerated list of formats PNG, JPG are supported
    "Model": "", // TBD
    "Provider": "", // TBD
    "ImagesPerSegment": 2, // Maximum is 5, cannot be 0
  },
  "Video": {
    "Model": "", // TBD
    "Provider": "", // TBD
    "ImageModel": "", // TBD if IsImageToVideo is true
    "ImageProvider": "", // TBD if IsImageToVideo is false
    "IsImageToVideo": false, // Global can be overriden per segment
    "ImageToVideo": { // Segments are 1 based
        "Segment_1": true, // Example of segment 1 overriding IsImageToVideo (not part of default)
    },
    "AssemblyStrategy": "speed-adjustment"  // Videos need to fit to narration audio which is usually not exactly 10s, so speed-adjustment basically adjusts the speed slightly to fit the video to the exact audio duration. Other option is fade-out-transition where the video fadesout slowly if it is less than audio to prevent black segments
  },
}
```

## Query to generate a video
- After initialization, users can start issuing prompts. Note that all the intermediate prompts to generate music, audio segments, images etc. are generated automatically by the LLMs in the setup. So the user is not expected provide those prompts manually and it is unwieldy to do so. So first generation is expected to be automated yet users can still provide prompts manually of course (most common case perhaps for the background music).
```bash
tutopanda query "Tell me about Civil war" --style="Pixar" --voice="Clara"
```
Following are available as shortcuts (commandline arguments): style, voice, useVideo, audience, language, duration, aspectRatio, size

- The above is a simple (most common) type of invocation with argument shortcuts, but if the users want to change (override defaults) to more config values, they can specify:
```bash
tutopanda query "Tell me about Civil war" --settings=Path/To/Config/config.json 
```
This will allow them to provide a JSON which is a subset of the Default config values. And the specified values will override the defaults.

- Running `tutopanda query` will return a `movieId` after successful completion. This can be used for subsequent regenerations to edit a generated movie. Here is what the `tutopanda query` returns as the final result (we will still specify all the intermediate notifications it will return as it creates and executes a plan, but this is the final summary)
```bash
> tutopanda query "Tell me about Civil war"

Succesfully created the movie with Id = q123456
Click this link to preview: http://localhost:5000/movie?id=q123456
```
> Note: We will be implementing the preview generation etc. at later stages. 

## Edit and regenerate a video
- After the first generation, in subsequent generations, users may want to hand-tweak some of the prompts. Since the prompts are usually longer strings, it is not feasible to provide them as commandline arguments. First the below command returns the prompts generated by the LLM executions in the graph
```bash
tutopanda inspect --movieId=q12345 --prompts=all --script --segment=all 
```
- The prompts asks for the generated prompts for all, inquiry, image, video, imageForVideo, music
- The script asks for the scripts for the narration segments
- The segment specifies which segment to return or all segments 
### Inspection TOML
The above command returns a TOML (for easy of editing), that can be edited by the users
```toml
[prompts.inquiry]
inquiry = "I want to learn about Civil War"
[prompts.image]
segment_1 = """
You are a helpful assistant.

## Guidelines
- Be concise
- Use examples

<important>
  No indentation needed at all!
</important>
"""

segment_2 = """
<task>
  Please analyze this code
</task>
"""
```
- You can edit these prompts in your favorite editor. The system will hash and compare the hash to the previous one to determine what to regenerate. The edit command starts the regeneration. You can also provide changed configs like in original query command 
```bash
tutopanda edit --movieId=q12345 --inputs=path/to/inputs.toml --style="Ghibli"
```

## Editing the Timeline
- Timeline can also be inspected manually and edited using a text editor

```bash
tutopanda inspect --movieId=q12345 --timeline
```

### Example Timeline JSON
- This is an example Timeline using isVideo=true 

> Note: Still work in progress and it is not the final schema. For example the assets need to be referenced according to the new design.

```json
{
  "id": "timeline-74e87d16-e7b3-4ee9-b7a3-df6200a5bb50",
  "name": "Timeline",
  "tracks": {
    "music": [
      {
        "id": "music-74e87d16-e7b3-4ee9-b7a3-df6200a5bb50",
        "kind": "music",
        "name": "Background Score",
        "status": "generated",
        "volume": 0.3,
        "duration": 31.103999999999996,
        "startTime": 0,
        "musicAssetId": "music-3ce236e2-d320-4621-a678-e82babd00006",
        "fadeInDuration": 2,
        "fadeOutDuration": 3
      }
    ],
    "voice": [
      {
        "id": "voice-0",
        "kind": "voice",
        "name": "Narration 1",
        "status": "generated",
        "volume": 1,
        "duration": 9.648,
        "startTime": 0,
        "narrationAssetId": "narration-3ce236e2-d320-4621-a678-e82babd00006-0"
      }, ...
    ],
    "visual": [
      {
        "id": "visual-0",
        "kind": "video",
        "name": "Segment 1 Video",
        "status": "generated",
        "volume": 0,
        "duration": 9.648,
        "startTime": 0,
        "videoAssetId": "video-3ce236e2-d320-4621-a678-e82babd00006-0",
        "speedAdjustment": 1.0364842454394694,
        "originalDuration": 10
      }, 
      {
        "id": "visual-1-0",
        "endX": 0,
        "endY": 30,
        "kind": "kenBurns",
        "name": "Segment 1 Image 1",
        "startX": 0,
        "startY": -40,
        "duration": 7.938,
        "endScale": 1.3,
        "startTime": 12,
        "effectName": "zoomInPanDown",
        "startScale": 1,
        "imageAssetId": "img-411be560-bde3-4a54-a507-9d48507db128-0-0"
      }, ...
    ],
  },
  "duration": 31.103999999999996,
  "assemblyStrategy": "speed-adjustment"
```

## Exporting the movie
- The movie will be exported to an Mp4 file (from Remotion)
> Note: This is a later stage development, just adding in for the CLI specification

```bash
tutopanda export --movieId=q12345 --format=mp4 
```
> Note: Once this is figured out more, we will likely be adding more options

## Advanced Inspections
- You can inspect more advanced generation artefacts:

### Inspecting the Artefacts
```bash
tutopanda inspect --movieId=q12345 --artefacts=all --segment=all 
```

### Inspecting the Plan
```bash
tutopanda inspect --movieId=q12345 --plan
```

### Inspecting the Errors
```bash
tutopanda inspect --movieId=q12345 --errors
```


## CLI Runtime Role
- The CLI is responsible for collecting user prompts, configurations, and edits. It serializes prompt edits to TOML purely as a user-facing format; core storage keeps prompts as plain text files (with full formatting) and the CLI converts between TOML and those files.
- For initial queries, the CLI merges the default config (from `tutopanda init`) with command-line overrides and the prompt argument, then invokes the core planner/runner pipeline.
- For regenerations, `tutopanda inspect` exports prompts/timeline to TOML/JSON for editing. When the user runs `tutopanda edit`, the CLI hashes each edited prompt individually, writes them back to the structured prompt files, and hands the hashes to core so only changed segments rerun.
- The CLI never writes to the content-addressed blob store directly; it delegates all persistence of artefacts to the core storage helpers.
- TOML/JSON exchanges are strictly CLI–user interfaces. Core services see structured prompt files and hashes, not TOML payloads.

