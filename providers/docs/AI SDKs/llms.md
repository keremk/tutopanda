# LLMs 
- For LLMs we will be using the AI SDK from Vercel. This unifies the APIs that we access. 
- For now we will use directly the providers using their APIKeys instead of the AIGateway from Vercel
- For now we won't use streaming, as this is mainly a build system and we will be sending more high level notifications as the build continues than reasoning or text as it is generated.
- The system prompts for these will be inlined in the codebased as const with string literal syntax

> Initial iteration only OpenAI API token available, but ensure that we can use different models with different API tokens.


## Producers using LLMs and which models
### ScriptProducer
- Provider: OpenAI (through VercelAI SDK)
- Model: openai/gpt5
- Reasoning: low/medium/high - default low

- Alternative models:
    - Model: google/gemini-2.5-flash 

- Producer should use direct object generation as it will create (JSON)
    - MovieTitle
    - MovieSummary
    - Script (which is a list of segments of written script for each segment)
- The producer will create txt based artefacts from that output (JSON) response.
    - *NarrationScript* (per segment, n segments, n artefacts)
    - *MovieSummary* 
    - *MovieTitle*

### TextToMusicPromptProducer
- Generates the prompt for the music model
- Model: openai/gpt5-mini
- Alternative models:
    - Model: google/gemini-2.5-flash 
- Producer uses text generation, as it will only generate the prompt text.
- It will create txt based artefacts:
    - *MusicPrompt* (single artefact)

### TextToImagePromptProducer
- Generates the prompt for the image model
- Model: openai/gpt5-mini
- Alternative models:
    - Model: google/gemini-2.5-flash 
- Producer uses text generation, as it will only generate the prompt text.
- It will create txt based artefacts:
    - *ImagePrompt* 

### TextToVideoPromptProducer: 
- Generates the prompt for the video model
- Model: openai/gpt5-mini
- Alternative models:
    - Model: google/gemini-2.5-flash 
- Producer uses text generation, as it will only generate the prompt text.
- It will create txt based artefacts:
    - *TextToVideoPrompt*

### ImageToVideoPromptProducer: 
- Generates the prompt for the video model
- Model: openai/gpt5-mini
- Alternative models:
    - Model: google/gemini-2.5-flash 
- Producer should use direct object generation as it will create (JSON)
    - A prompt to create an image that serves as a starting image
    - A prompt for the overall video direction.
- It will create txt based artefacts:
    - *StartImagePrompt*
    - *ImageToVideoPrompt*
