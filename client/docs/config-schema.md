# Config schema and options

- This will evolve as I build out the application, adding more features that comes with new configuration options. Our design
  needs to evolve in a backwards compatible way. 
- For now, we will have these sections: General, Image, NarrationAudio, BackgroundMusic, and SoundEffects. 

General Section:
- Duration (full duration of video, Options: 30s, 1min, 3min): For now it is capped at 3min 
- Script Model (will be one of a list of available LLM models, make it string since we will add to these models over time),
- Audience (a list possible options: Kids, Teens, Young Adults, Adults, Older Adults, Family-Friendly, Academic, Enthusiast/Niche)
- Use subtitles (boolean)
- Language (string, English is supported initially, specified in the form two lettered standard. E.g en for English)
- Subtitle Language (string, specified same as language)
- Use Video (a boolean that allows generating video segments - video is expensive so it is an option)
- Max # of Video Segments (if use video is true, the top value is # of segments)

Image Section:
- Size (string, with possible options like 480, 720, 1080)
- Aspect Ratio (16:9, 9:16, 1:1, 4:3, 3:4, 21:9)
- ImagesPerSegment (# of images per segment, will be capped at 2),
- Style (string, we will have values like Ghibli,Pixar, Animated, Realistic etc. which will be fed into the image generation models)
- Format (string, with options JPG and PNG)
- Model (for image generation, with options like NanoBanana, SeaDream, QWEN Image) This will be an ever changing list

Video Section: (size and aspect ratio are informed by the image configuration)
- Model: (for video generation, Seadance, Kling, Wan_video Veo etc.) - For now we will only support Seadance-1-lite with beginning and last image
- Duration: (string, 5s, 10s)

Narration Audio Section:
- Segment Length: (5s, 10s, 15s) This will break the whole script into segments based on this length
- Voice: (string, that represents the name of voice-model, should map to an internal voice_id to be fed into the model)
- Model: (string. E.g. MiniMax Speech) 
- Emotion: (string: )

Background Music Section:
- Model: (string, E.g. Stable Audio, ElevenLabs)

Sound Effects Section:
- Model: (string, E.g. Declare Lab Tango, ElevenLabs)

# Summary of configs:
We will be showing a summary of the key configuration options to the user in the agent-progress section of the app and invite the user to either accept those and go on to the creation or alternatively edit them. In the summary we should show these:

- Duration of clip
- Language and subtitle (if available) language
- The aspect ratio and size
- Style 

