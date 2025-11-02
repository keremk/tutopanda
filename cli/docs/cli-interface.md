# Command Line Interface Definition

## Initialize Tutopanda
Initialize tutopanda CLI before use. Expected to be called once

```bash
tutopanda init --rootFolder=/Path/To/Folder --defaultSettings=/Path/To/DefaultSettings.json
```
- Creates the initial folder structures and default settings file. 
    - If rootFolder is not specified, it uses ~/.tutopanda as the root.
        - The builds will go under a `builds/` folder (always)
        - Each build will be under a folder `movie-{movieId}` under `builds/`
    - If defaultSettings is not specified, it creates a default settings
        - `{rootFolder}\default-settings.json`

### Default Settings Values:
Added some sane defaults to use (some of them not yet defined, will define in later milestones)

> There is significant change from the prior version of this. 
> Also the casing is changed from PascalCasing to camelCasing.

- Many of the providers in the producers list will either use some of the general attributes or need custom some custom attributes. 
  - The general attributes are always provided to all providers and they can either use what is in there, or use the overrides in the `customAttributes` per provider. It is up to the provider to do the mapping as long as they are given the general attributes
- Note that the providers are not always calls to external AI model providers. For example TimelineAssembler will use a `tutopanda/timeline-assembler` component built in the providers package to generate timeline artefact. The "model" attribute is therefore refers to the special instance of the component. 
> TODO: Perhaps we should consider changing name `model` to something else to support other types of providers. They essentially form a (category, subcategory) type lookup request to source the correct implementation. 

```json
{
  "general": {
    "useVideo": false, // Global, can be overriden per segment
    "audience": "general", // Enumerated audiences list, if set to custom then described in AudienceCustom
    "audiencePrompt": "", // If Audience is set to custom then specified as prompt here. 
    "language": "en", // Allowed values: en, de, es, fr, tr (for now)
    "duration": 60, // in seconds, SegmentCount is deduced from Duration/10 (each segment always 10s)
    "aspectRatio": "16:9", // 1:1, 3:2, 2:3, 4:3, 3:4, 16:9, 9:16, 21:9
    "size": "480p", // 480p, 720p, 1080p
    "style": "Ghibli", // Enumerated list of styles, and there is the last option "Custom". Ghibli, Pixar, Anime, Watercolor, Cartoon, PhotoRealistic, Custom
    "customStyle": "", // Defines a prompt for a style definition if Style == Custom
    "useVideo": true,
    "IsImageToVideo": false, // Global can be overriden per segment
    "ImageToVideo": { // Segments are 1 based
        "Segment_1": true, // Example of segment 1 overriding IsImageToVideo (not part of default)
    }
  },
  "producers": [
    {
      "producer": "ScriptProducer",
      "providers": [
        {
          "priority": "main",
          "provider": "openai",
          "model": "openai/gpt5",
          "configFile": "script-producer.toml",
          "customAttributes": {
          }  
        }
      ]
    },
    {
      "producer": "TextToMusicPromptProducer",
      "providers": [
        {
          "priority": "main",
          "provider": "openai",
          "model": "openai/gpt5-mini",
          "configFile": "text-to-music-prompt-producer.toml"
        },
      ]
    },
    {
      "producer": "TextToMusicProducer",
      "providers": [
        {
          "priority": "main",
          "provider": "replicate",
          "model": "stability-ai/stable-audio-2.5",
          "customAttributes": {
            "cfg_scale": 1,
          }  
        }
      ]
    },
    {
      "producer": "AudioProducer",
      "providers": [
        {
          "priority": "main",
          "provider": "replicate",
          "model": "minimax/speech-02-hd",
          "customAttributes": {
            "emotion": "auto",
            "voice_id": "English_CaptivatingStoryteller",
          }  
        },
        {
          "provider": "replicate",
          "model": "elevenlabs/v3",
          "customAttributes": {
            "voice": "Grimblewood",
            "speed": 0.9
          }  
        }
      ]
    },
    {
      "producer": "TextToImagePromptProducer",
      "providers": [
        {
          "priority": "main",
          "provider": "openai",
          "model": "openai/gpt5-mini",
          "configFile": "text-to-image-prompt-producer.toml",
          "customAttributes": {
            "imagesPerSegment": 2, // Maximum is 5, cannot be 0
          }
        },
      ]
    },
    {
      "producer": "TextToImageProducer",
      "providers": [
        {
          "priority": "main",
          "provider": "replicate",
          "model": "bytedance/seedream-4",
          "customAttributes": {
            "cfg_scale": 1,
          }  
        }
      ]
    },
    {
      "producer": "TextToVideoPromptProducer",
      "providers": [
        {
          "priority": "main",
          "provider": "openai",
          "model": "openai/gpt5-mini",
          "configFile": "text-to-video-prompt-producer.toml"
        },
      ]
    },
    {
      "producer": "TextToVideoProducer",
      "providers": [
        {
          "priority": "main",
          "provider": "replicate",
          "model": "bytedance/seedance-1-pro-fast",
          "customAttributes": {
            "resolution": "480p",
            "duration": 10,
          }  
        },
        {
          "provider": "replicate",
          "model": "bytedance/seedance-1-lite",
          "customAttributes": {
            "resolution": "480p",
            "duration": 10,
          }  
        }
      ]
    },
    {
      "producer": "ImageToVideoPromptProducer",
      "providers": [
        {
          "priority": "main",
          "provider": "openai",
          "model": "openai/gpt5-mini",
          "configFile": "image-to-video-prompt-producer.toml"
          "customAttributes": {
          }
        },
      ]
    },
    {
      "producer": "StartImageProducer",
      "providers": [
        {
          "priority": "main",
          "provider": "replicate",
          "model": "bytedance/seedream-4",
          "customAttributes": {
            "cfg_scale": 1,
          }  
        }
      ]
    },
    {
      "producer": "ImageToVideoProducer",
      "providers": [
        {
          "priority": "main",
          "provider": "replicate",
          "model": "bytedance/seedance-1-pro-fast",
          "customAttributes": {
            "resolution": "480p",
            "duration": 10,
          }  
        }
      ]
    },
    {
      "producer": "TimelineAssembler",
      "providers": [
        {
          "priority": "main",
          "provider": "tutopanda",
          "model": "tutopanda/timeline-assembler",
          "customAttributes": {
            "assemblyStrategy": "speed-adjustment"
          }
        }
      ]
    }
  ]
}
```

### Default System Prompts
- The LLM providers are further configured with 
  - systemPrompt
  - textFormat: For the output, it can be either `jsonSchema` or `text`
  - reasoning: The model reasoning effort. Either of `minimal`, `low`, `medium`, `high`
  - jsonSchema: for structured outputs that produces multiple artefacts. We need to create multiple artefacts so makes sure the dependencies can refer to them separately. Only string values are supported in properties or arrays.
    - Each string property value is represented in a text file.
    - For arrays of strings, they are represented each as a text file.
  - variables: Comma delimited list of variables that can be used in system prompt
    - Each variable mentioned here must also be declared in the settings.json file customAttributes section.
  - tools: Comma delimited list of tools
    - Currently only WebSearch for gpt-5 models from OpenAI is supported 
- The configuration is a TOML file as configured in settings under the configFile attribute for the provider.

Example: `image-to-video-prompt-producer.toml`
```toml
[system_prompt]
textFormat = "json_schema" 
jsonSchema = """
{
  "name": "segment_image_movie_description",
  "strict": true,
  "reasoning": "low",
  "schema": {
    "type": "object",
    "properties": {
      "segment_start_image": {
        "type": "string",
        "description": "Prompt describing the starting image for the video segment as determined from the narrative."
      },
      "movie_directions": {
        "type": "string",
        "description": "Prompt describing the movie generator's directions, including camera moves, style, and cut-scene descriptions."
      }
    },
    "required": [
      "segment_start_image",
      "movie_directions"
    ],
    "additionalProperties": false
  }
}
"""
variables = "foo,bar"
tools = "WebSearch"
systemPrompt = """
You are an expert in {foo}. You should generate {bar}.
"""
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
This will allow them to provide a JSON which is a subset of the default settings values. And the specified values will override the defaults.

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
## Selecting Producer Implementations
- In the default settings we mentioned how user can specify the default producer implementations (provider, model). Here we showing how these can be changed per generation or regeneration.
> The implementation of this will use the providers package APIs to ask for the correct function given `(provider, model)`; the CLI automatically tags the request with `environment="local"` today.

### Specifying Provider & Models
- Users should be able to specify different (provider, model) pairs for each producer type with a fallback pair and for each segment generation.
- This can be specified either in first generation or subsequent edits (regenerations)
- The specified providers override the existing ones.
- Per (provider, model) custom attributes can also be specified here.
- Producer names should match the available producer kinds for the current setup otherwise it returns error with a message saying which producer(s) did not match.
- If a given `(provider, model)` is not available for the `local` environment, an error is returned saying which pair failed resolution.
- Some (provider, model) may require custom attributes or different values enumerations for an already specified attribute. Adding customAttributes here will override the top level settings.config.
  - E.g. (1) `size` may be specified at the General Settings level but the model is expecting a different value, or we want to limit that model to a lower size
  - E.g. (2) qwen/qwen-image model requires a custom model called `guidance` which can be specified here.
- Multiple providers per producer can be specified mainly for "fallback" logic. The main provider is marked by {priority = "main"}
- As in the settings, you can also specify system prompts, variables etc. (See the above defaults section) using the configFile attribute for providers.

Specify during query
```bash
tutopanda query "Tell me about the Waterloo war" --providers=path/To/providers.json
```
or during edit
```bash
tutopanda edit --movieId=q12345 --providers=path/To/providers.json
```

```json
{
  "producers": [
    {
      "producer": "ScriptProducer",
      "providers": [
        {
          "priority": "main",
          "provider": "openai",
          "model": "openai/gpt5",
          "configFile": "script-producer.toml",
          "customAttributes": {
            "reasoning": "low"
          }  
        },
        {
          "provider": "google",
          "model": "google/gemini-flash-2.5",
        }
      ]
    }
  ]
}
```

## CLI Runtime Role
- The CLI is responsible for collecting user prompts, configurations, and edits. It serializes prompt edits to TOML purely as a user-facing format; core storage keeps prompts as plain text files (with full formatting) and the CLI converts between TOML and those files.
- For initial queries, the CLI merges the default settings (from `tutopanda init`) with command-line overrides and the prompt argument, then invokes the core planner/runner pipeline.
- For regenerations, `tutopanda inspect` exports prompts/timeline to TOML/JSON for editing. When the user runs `tutopanda edit`, the CLI hashes each edited prompt individually, writes them back to the structured prompt files, and hands the hashes to core so only changed segments rerun.
- The CLI never writes to the content-addressed blob store directly; it delegates all persistence of artefacts to the core storage helpers.
- TOML/JSON exchanges are strictly CLI–user interfaces. Core services see structured prompt files and hashes, not TOML payloads.
