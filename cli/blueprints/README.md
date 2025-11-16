# Bundled Blueprint Reference

This folder contains the YAML blueprints that ship with the Tutopanda CLI. When you run `tutopanda init`, these files (and the `modules/` subtree) are copied into your CLI root at `<root>/blueprints/` (defaults to `~/.tutopanda/blueprints`). The files under `cli/blueprints/` remain the source of truth for development or when you want to inspect the latest examples directly from the repo.

Use the CLI commands to explore what’s available:

```bash
tutopanda blueprints:list
tutopanda blueprints:describe audio-only.yaml
tutopanda blueprints:validate image-audio.yaml
```

## Blueprint Overview

| File              | Summary                                                                  |
| ----------------- | ------------------------------------------------------------------------ |
| `audio-only.yaml` | Generates narration scripts and audio segments only                      |
| `image-only.yaml` | Creates narration plus prompt-driven images (no audio)                   |
| `image-audio.yaml`| Full workflow: narration, images, audio, and timeline composition        |
| `modules/*.yaml`  | Reusable building blocks (script generation, image prompts, timeline, …) |

Each YAML blueprint follows the format documented in `core/docs/yaml-blueprint-spec.md`. At a high level, you declare:

- `meta`: id, name, version, author info
- `inputs`: required/optional inputs users must provide
- `artifacts`: outputs the workflow produces
- `loops`: optional iteration dimensions (e.g., segment, image)
- `modules`: imported sub-blueprints (from `modules/`)
- `connections`: wiring between inputs, modules, and artefacts

## Running a Blueprint

After `tutopanda init`, you can invoke the CLI with a positional inquiry prompt:

```bash
tutopanda query "Tell me about Waterloo" \
  --inputs=~/movies/waterloo-inputs.yaml \
  --using-blueprint=audio-only.yaml
```

- `--inputs`: path to your YAML inputs file (`inputs: { InquiryPrompt: ..., Duration: ... }`)
- `--using-blueprint`: either a path or a file name. When you pass only the file name, the CLI resolves it relative to `<root>/blueprints/` first, then falls back to the bundled copy.

You can list providers for a blueprint:

```bash
tutopanda providers:list --using-blueprint=image-audio.yaml
```

Or inspect/validate:

```bash
tutopanda blueprints:describe image-only.yaml
tutopanda blueprints:validate ~/.tutopanda/blueprints/image-audio.yaml
```

## Creating / Editing Blueprints

1. Copy one of the existing YAMLs into your CLI root (e.g., `~/.tutopanda/blueprints/custom.yaml`).
2. Modify `inputs`, `artifacts`, `modules`, and `connections` as needed. Keep modules under `<root>/blueprints/modules/`.
3. Validate changes before running:

   ```bash
   tutopanda blueprints:validate ~/.tutopanda/blueprints/custom.yaml
   ```

4. Run the workflow:

   ```bash
   tutopanda query "My custom prompt" \
     --inputs=~/movies/custom-inputs.yaml \
     --using-blueprint=custom.yaml
   ```

### Tips
- Keep modules self-contained under `modules/` so they can be reused by other blueprints.
- `promptFile` references (e.g., `modules/prompts/*.toml`) and JSON schemas live alongside the module files.
- Always include `InquiryPrompt` in your inputs and optionally override it via the positional argument to `tutopanda query`.
- Track your blueprint files in version control; only the copies under `<root>/blueprints/` are used at runtime.
