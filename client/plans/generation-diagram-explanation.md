# Generation Diagram & Algorithm

## Broad Context
This application allow users the send a query (e.g. "Tell me about the Civil War") and the AI goes ahead, does a research, creates a script and creates all the necessary assets like images, videos, narration audio, background music etc. to create a timeline for a video presentation using Remotion. We built it as an MVP in a not so robust way and this is a proposal to rewrite the whole generation process. 

### Problems
- We are not efficiently dispatching requests to external providers, which lasts in more latency to generate the final presentation. We could be making use of more parallelization while respecting rate limits and resource constraints.
- We are not handling any errors in generation in a robust manner.
- We are not handling regeneration at all. Everything needs to rerun which is very wasteful as each generation cost quite a lot.
- The UI for editing is ok, but regenerating is not really robust and it is wasteful.
- We are currently using Inngest. Vercel just announced a new Workflow product, which seems to be easier to deploy and use for us. The documentation of it is here: `client/docs/vercel-workflow`
- The current codebase is very convoluted and also not using "steps" properly as it batches a whole bunch of external calls under one "step" defeating the purpose of being able to use retries etc. We are not making use of Inngest (or Vercel Workflow) with the current architecture well.
- The testability is very much lacking, and requires manually running the whole generation flow to debug and diagnose as well.

### Non-goals
- This is not an application that is released. We can re-write major chunks without worrying about compatibility etc. Compatibility is not a goal, we will develop this in a separate branch.

## Diagram
This diagram attempts to explain the data flow of the video timeline generation. 

- *Configuration & User Input*: (*CUI*) These are denoted by rectangles and one diamond shape with a red background, where the user creates the initial input through configuration settings (e.g. edit-configuration) or editing prompts in the edit UI (like visuals-editor, narration-editor etc. components)
    - The diamond shaped useVideo is a special one that instructs conditional generation (video or image based timeline)
    - If there is denotion on the top right corner (e.g. n, m, (n+m)), those show the cardinality of those. I.e. User Modified Script with n -> there may be n instances of those.
    - These are the user specified configurations or user editable (when editing a generated part of the overall video) fields.
        - *InquiryPrompt*: The user prompt that starts the overal video lecture generation
        - *Duration*: The user configured duration of the video. Number of segments(n) are deduced from this, as each segment is 10s long. The duration can only be multiples of 10s up to 3 minutes (in this initial MVP)
        - *Audience*: An enumerated list of intended audience for the video. This changes the tone, difficulty and depth of the script. 
        - *MusicPromptMod*: User modified music prompt. User can edit the auto generated music generation prompt in the UI.
        - *NarrationSegmentScriptMod*: User modified narration script for the segment. 
        - *VoiceId*: The voiceId that defines the voice to use to narrate the segment. Depends on the audio generation model.
        - *Emotion*: (Optional) emotion description that helps set the tone of the narration. Depends on the audio generation model.
        - *UseVideo*: (Default is False) an overall video level flag that instructs whether to use video or images (using KenBurns or similar effects) in each segment. This cannot be changed per segment (currently)
        - *ImagesPerSegment*: The number of images to generate per segment
        - *SegmentImagePromptMod*: User modified segment image prompt, if the user choose the modify to auto generated prompt.
        - *ImageStyle*: Enumerated list of image styles to set the style of image to be generated.
        - *Size*: Enumerated list of the size of image (or video) to be generated. This depends on the models.
        - *AspectRatio*: Enumerated list of aspect ratios for the image (or video) to be generated. This depends on the models.
        - *IsImageToVideo*: A flag to use image to video vs. text to video for video generation. (currently not implemented)
        - *StartingImagePromptMod*: User modified starting image prompt for the video in the segment.
        - *MovieDirectionPromptMod*: User modified movie direction prompt for the video in the segment.
        - *AssemblyStrategy*: An enumerated list of assembly strategy for segments that gets fed into the timeline assembler. Does not have any impact in the generations only impacts timeline assembly at the end.
- *Text or Assets Generated*: (*TAG*) These are denoted by rectangles with blue background and are generated through the process. When the flow is first run, they don't exist. In subsequent runs new versions are generated replacing the older ones.
    - If there is denotion on the top right corner denoted by n, m, (n+m), that shows the cardinality. If there is nothing denoted, then cardinality is 1. E.g. NarrationSegmentScript with n -> there are n instances of those. (n: # of segments in video, m: # of images per segment)
    - These are the assets we generate:
        - *NarrationSegmentScript*: Contains the text of the script to be narrated per segment (n)
        - *VideoSummary*: Contains the summary of the script. (1)
        - *VideoTitle*: Contains the title of the script. (1)
        - *MusicPrompt*: Contains the text prompt for generating music. (1)
        - *MusicAsset*: The music asset (mp3) for the whole video. (1)
        - *SegmentNarrationAudioAsset*: The narration audio asset (mp3). (n)
        - *SegmentImagePrompt*: Contains the prompt to generate segment images. (n*m)
        - *SegmentImageAsset*: The image asset. (n*m)
        - *StartingImagePrompt*: Contains the prompt to generate starting images for the video in a segment. (n)
        - *TextToMovieDirectionPrompt*: Contains the prompt for generating the video using text only. (n)
        - *ImageToMovieDirectionPrompt*: Contains the prompt for generating the video using both image and text. (n)
        - *StartingImageAsset*: The image asset used as an input to generate video in a segment. (n)
        - *SegmentVideoAsset*: The video asset in a segment. (n)
- *Generators*: (*GEN*) These are denoted by circles with a green background. They are external API calls to LLMs, or model (audio, video, music etc.) generators to generate text or other asset types. 
    - The incoming arrows show the input for those generators and they represent their dependencies. I.e. if any of the incoming sources change (e.g. user changing a setting or prompt, or a generated asset changing because of an upstream generator) then they need to regenerate the text or assets.
    - We denote the number of executions (i.e. calls to these API providers to generate) as 1, n, m execution. Since these generations take multiple minutes or more time, it is important to be able to concurrently send those requests. But at the same time, if we send too many requests than we run the risk of being rate limited (Also the classic n+1 queries problem, but in these case 1 user request causing n+1 -- even more requests to API providers downstream)
    - These are the current generators (GENs) we have: (n: # of segments in video, m: # of images per segment)
        - *ScriptGen*: LLM call that generates the full text script of the video in n segments. (1 call generates n text scripts, summary and title)
        - *TextToMusicPromptGen*: LLM call that generates a music generation prompt. (1 call to the model )
        - *MusicGen*: Music generation model call that takes the prompt and generates music -- background score. (1 call to the model)
        - *AudioGen*: Voice audio generation model call that takes the script (for a given segment out of n) and produces an audio narration. (n calls to the model) 
        - *TextToImagePromptGen*: LLM call that generates a prompt for the image. (n calls to the model each generating m prompts for a total of (n*m))
        - *ImageGen*: Image generation model call that takes the image prompt and generates image. (n*m calls to the model)
        - *TextToVideoPromptGen*: LLM call that generates a prompt generating video from text only. (n calls to the model)
        - *ImageToVideoPromptGen*: LLM call to generate a movie direction prompt and a prompt for a starting image. (n calls to the model)
        - *StartingImageGen*: Image generation model call that takes image prompt and generates the starting image. This image is only used as an input to the ImageToVideoGen. (n calls to the model)
        - *TextToVideoGen*: Video generation model call to generate video from text. (n calls to the model)
        - *ImageToVideoGen*: Video generation model call to generate video from an image and text. (n calls to the model)
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
- This is a directed acyclic graph composed of edges (arrows) that connects CUIs and TAGs to GENs.
    - Each GEN has an incoming and outgoing nodes. Incoming nodes are the dependencies of the GEN. If one of them is dirty, the GEN needs to run again and generate the outgoing nodes.
    - CUIs don't have any incoming nodes (i.e. dependencies). They are edited by the users.
    - TAGs always have an incoming node, which always is a GEN. The TAGs are generated by GENs. 
    - The nodes are shown as single rectangles, circles on the diagram but they have a cardinality number on their left corner which shows the actual numbes of instance of each node. (For TAGs they are identified as "x executions" where x = 1, n, (n*m) etc.)
    - Here is how you can use cardinality numbers to expand the diagram to the actual number of nodes and edges: 
        - If the cardinality of the incoming node is 1, and the cardinality of the outgoing node is also 1, then it is equivalent to 1 node connected to another with 1 edge. (e.g. Music Prompt -> Music Model -> Music Asset)
        - If the cardinality of the incoming node is 1, and the cardinality of the outgoing node is n, then it means that the incoming node is fanning out to n nodes through n edges. (e.g. User Prompt ->LLM (Script Generator) -(n)-> NarrationSegment1, NarrationSegment2 ...)
        - If the cardinality of the incoming node is n, and the cardinality of the outgoing node is n, then it means that there are n nodes connecting to n other nodes through n edges with a matching index. (E.g. StartingImagePrompt1 -> ImageModel1, StartingImagePrompt2 -> ImageModel2, ... )
        - If the cardinality of the incoming node is n, and the cardinality of the outgoing node is 1, then it means that the incomings nodes are fanning in to 1 node as their n dependency nodes. Currently there is no example of such node.
- IMPORTANT SIMPLIFICATION:
    - CUIs do not actually have to be in the fully expanded final tree, since they are not generated and always user specified. They can only be annotations to the GEN nodes as dependencies. This simplifies the tree and dependency management significantly.
    - If a GEN node is creating 2 or more different types of TAGs but in a single pass (and usually in reality this will be one asset of JSON type), then we can special case this as follows:
        - ScriptGen creating VideoSummary, VideoTitle and NarrationSegmentScript(n) - 3 types of assets.
- GEN nodes correspond to the place where we gather the incoming node data and feed that into the API call for the LLM or the Asset Gen Model. And we decide if a GEN needs run, by looking at their incoming nodes and see if any of them are dirty (i.e. changed). If so then the GEN needs to run. 
- For the 5 different types of generation:
    - MusicGeneration: 1 + 1 calls. Two stages LLM -> MusicGen
    - AudioNarrationGeneration: n calls. One stage AudioGen. All parallelizable 
    - ImageGeneration: n + (n x m) calls. Two stages LLM -> ImageGen. First n parallelizable then (n x m) parallelizable
    - VideoFromTextGeneration: n + n calls. Two stages LLM -> VideoGen. All stages n parallelizable, waiting on previous stage.
    - VideoFromImageGeneration: n + n + n calls. Three stages LLM -> ImageGen -> VideoGen. All stages n parallelizable, waiting on previous stage.
- Latency: (made up numbers for illustration)
    - Median
        - ScriptGen = 50s
        - TextToMusicPromptGen = 5s
        - MusicGen = 10s
        - AudioGen = 10s
        - TextToImagePromptGen = 5s
        - ImageGen = 30s
        - TextToVideoPromptGen = 5s
        - TextToVideoGen = 90s
        - ImageToVideoPromptGen = 5s
        - StartingImageGen = 30s
        - ImageToVideoGen = 120s
- Latency Formula: (max parallization) 
    - MusicGeneration = TextToMusicPromptGen + MusicGen
    - AudioNarrationGeneration = AudioGen (all parallelizable)
    - ImageGeneration = TextToImagePromptGen + ImageGen
    - VideoFromTextGeneration = TextToVideoPromptGen + TextToVideoGen
    - VideoFromImageGeneration = ImageToVideoPromptGen +  StartingImageGen + ImageToVideoGen
    - !UseVideo:
        - ScriptGen + max(MusicGen, AudioNarrationGeneration, ImageGeneration) 
    - UseVideo & !IsImageToVideo:
        - ScriptGen + max(MusicGen, AudioNarrationGeneration, VideoFromTextGeneration)
    - UseVideo & IsImageToVideo:
        - ScriptGen + max(MusicGen, AudioNarrationGeneration, VideoFromImageGeneration)
- Median Latency (if all parallel): 
    - !UseVideo: 50 + max(15, 10, 35) = 85s
    - UseVideo & !IsImageToVideo: 50 + max(15, 10, 95) = 145s
    - UseVideo & IsImageToVideo: 50 + max(15, 10, 155s) = 205s
- Inherent parallelism: Parallelism depends simply on the depth of the tree where depth is the # of GEN nodes in a given branch. 

## Generation and Regenaration Process
- We will always need a pass of the algorithm as below for preparation of jobs and then run the runner to execute them

### What triggers a regenaration:
- Initial pass has some errors that were not resolved by retrying in the Workflow tool and possibly required user intervention to change prompts (4xx type errors). Or the retries did not succeed within the allowed attempts but a later try can resolve (5xx type errors)
- User does not like some of the generations and manually edits the prompts or configurations.

### Algorithm:
- Start from the top GEN node (ScriptGen) and do a breadth first search of the fully expanded tree with the cardinality numbers. Note that the nodes under the conditionals useVideo, IsImageToVideo will be pruned based on those values.
- Search down the tree until hit a GEN node, note the TAG node as you search
    - If full pass add that to the array of jobs, and that TAG node as a dependency that will be used for generation.
    - If regeneration pass,
        - Check if the TAG node is dirty, if not than do not add that GEN node following it to the array of jobs.
        - Check if the TAG node failed to be generated in a prior pass. If it was not, then do not add that GEN node following it to the array of jobs.
    - Check if the GEN node has been added before. If it has:
        - Is it on the same array? Then it means we are visiting it again. (E.g. ScriptGen->VideoSummary->TextToMusicPromptGen and then ScriptGen->VideoTitle->TextToMusicPromptGen) So we need to change the array entry and add the new tag to the dependencies (e.g. now TextToMusicPromptGen has both VideoSummary and VideoTitle as dependencies but one generation job)
        - Is it on a different array? Then it was added to a prior queue prematurely as it now has a new dependency that requires another pass. So remove it from that array and add it to this array and add both dependencies. Now it is on the right queue. 
            - E.g. ImageToVideoPromptGen -> ImageToMovieDirectionPrompt -> ImageToVideoGen adds ImageToVideoGen as a job in the first bread-wise pass into that pass's array. In the second bread-wise pass StartingImageGen -> StartingImageAsset -> ImageToVideoGen attempts to add it again to the new array but it was already add before to an array that came before it. We need to remove and add it to this new array with 2 dependencies ImageToMovieDirectionPrompt, StartingImageAsset
    - Also keep an internal hash table of TAGs to mark that they are added and to which array. We need this as seen in the previous step for the lookup.
- Go back up to the parent GEN node and do the same for all outgoing nodes. 
    - (Executor Note) Now all the nodes added in the array can execute in parallel but apply batching based on rateLimit adherence. E.g. for a given provider if the maxConcurrency = 5 and we have 10 jobs lined up, we will have to do the 2 parallel executions during execution time, which will increase latency.
- Once all the outgoing nodes of the GEN node are travelled, we successfully identified all the jobs in an array. Add that array to a FIFO queue.
- Now go back and for each of the GEN nodes that were travelled, recursively travel their outgoing nodes as above, until all GEN nodes are visited. 

### Runner (Executor)
- The above algorithm only prepares a plan of jobs and which order they can be executed with what parallelism.
    - Queue (of array of jobs) identifies the order and ensures that the required dependencies are available and generated.
    - Array of jobs identifies the parallel executions with no conflict of unready dependencies. Potentially all can be parallel but there is the reality of rate limits, resource issues etc.
- Runner's job is to generate or regenarate TAGs with the least possible latency and not running into rate limit and resource constraints.
- Runner starts reading the arrays in the queue and starts the Vercel Workflow.
    - Rate limits apply to jobs to the same provider (i.e. if we are sending 10 calls to OpenAI LLM provider, we don't want to run into their rate limiting but sending 5 calls to OpenAI, 5 calls to Replicate is ok as they are different providers with different limits)
    - Use configurable parallel jobs limits to group and batch calls to the same provider and create another queue of those. (e.g. QueueEntry1 (5 calls to OpenAI, 5 calls to Replicate), QueueEntry2 (5 calls to OpenAI) etc.) 
    - For each queueEntry send the calls with a Promise.all(all step function calls in the first queue entry). 
    - Iterate over all queueEntries.
    - If an error happens and generation fails, then we need 2 things:
        - For the current run, the dependency will simplify not be available as it failed to be generated, so the GEN with not existing dependency will not be scheduled to run and skipped. This will cause all the downstream GENs not to run as their dependencies won't be available.
        - But we need to mark this as a failure so that a next regeneration can be run and that GEN node following that TAG node can be added as job. We should add the TAG node as a failure also if it was a downstream GEN (see above point). This way all dependent TAGS are also marked as failures and will be added to the regeneration queues as jobs.
