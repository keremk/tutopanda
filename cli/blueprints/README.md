# Custom Blueprint Examples

This directory contains example custom blueprint configurations for Tutopanda.

## Available Blueprints

### audio-only.json
Generate audio narration without video. Perfect for podcasts or audio-only content.

**Sections**: script, music, audio

**Usage**:
```bash
tutopanda query "Tell me about TypeScript" --using-blueprint=cli/blueprints/audio-only.json
```

### full-video.json
Complete video generation pipeline with generated images. This creates videos with AI-generated visuals.

**Sections**: script, music, audio, images, videoFromImage, assembly

**Usage**:
```bash
tutopanda query "The history of space exploration" --using-blueprint=cli/blueprints/full-video.json
```

### text-to-video.json
Generate video directly from text prompts without generating images first.

**Sections**: script, music, audio, videoFromText, assembly

**Usage**:
```bash
tutopanda query "Explain quantum computing" --using-blueprint=cli/blueprints/text-to-video.json
```

## Creating Custom Blueprints

You can create your own custom blueprint by creating a JSON file with the following structure:

```json
{
  "name": "my-custom-blueprint",
  "description": "Description of what this blueprint does",
  "version": "1.0",
  "sections": [
    "script",
    "audio",
    "assembly"
  ],
  "connections": [
    {
      "from": { "section": "script", "port": "narrationScript" },
      "to": { "section": "audio", "port": "narrationScript" }
    },
    {
      "from": { "section": "audio", "port": "segmentAudio" },
      "to": { "section": "assembly", "port": "segmentAudio" }
    }
  ],
  "autoConnect": false,
  "blueprintConfig": {
    "useVideo": false
  }
}
```

### Available Sections

- `script` - Generate narration script from user prompt
- `music` - Generate background music
- `audio` - Generate narration audio from script
- `images` - Generate images from script
- `videoFromText` - Generate video from text prompts
- `videoFromImage` - Generate video from images
- `assembly` - Assemble final video/audio

### Port Connections

Each section has input and output ports that can be connected. Use the Tutopanda CLI to list available ports:

```bash
tutopanda blueprints describe <section-name>
```

### Validation

You can validate your custom blueprint before using it:

```bash
tutopanda blueprints validate ./my-blueprint.json
```
