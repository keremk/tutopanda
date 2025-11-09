# CLI Workflow

The CLI now reads everything from TOML files. There are only three things you need:

1. **Storage root** – created once via `tutopanda init`.
2. **Blueprint TOML** – describes the graph plus provider configs (`cli/blueprints/*.toml`).
3. **Inputs TOML** – provides every runtime input value required by the blueprint (`cli/inputs-sample.toml` is an example).

No JSON settings or CLI override flags are used anymore.

---

## 1. Initialize storage

```bash
tutopanda init --rootFolder=/path/to/tutopanda
```

This command simply creates:

- `rootFolder/cli-config.json` with `{ storage: { root, basePath: "builds" } }`
- `rootFolder/builds/` where every movie directory (`movie-xxxx`) will live

No default settings or provider files are generated.

---

## 2. Inputs TOML

Each blueprint declares its `[inputs]`. Build a matching TOML file:

```toml
[inputs]
InquiryPrompt = "Tell me about the Battle of Waterloo"
Duration = 30
NumOfSegments = 3
VoiceId = "Mario"
```

Every required input from the blueprint must appear under `[inputs]`. The CLI validates required keys at runtime.

---

## 3. Run a query

```bash
tutopanda query \
  --inputs=cli/inputs-sample.toml \
  --using-blueprint=cli/blueprints/audio-only.toml
```

What happens:

1. The CLI loads the blueprint (and any sub-blueprints), flattens the graph, and derives provider configs from the `[[producers]]` entries.
2. It parses the inputs TOML, ensuring all required inputs are present. `InquiryPrompt` is stored under `builds/movie-XXXX/inputs.toml` and also written to `prompts/inquiry.txt`.
3. The planner expands the blueprint using values like `NumOfSegments` (fallbacks are derived from `Duration`).
4. Providers are invoked according to the blueprint-only configuration. Environments are always `local` when run from the CLI.

Optional flags:

- `--using-blueprint` defaults to `cli/blueprints/audio-only.toml`.
- `--inputs` is required.
- `--dryrun` executes a mocked run.
- `--nonInteractive` skips the confirmation prompt.

---

## 4. Edit an existing movie

```bash
tutopanda edit \
  --movieId=movie-abcd1234 \
  --inputs=edited-inputs.toml \
  --using-blueprint=cli/blueprints/audio-only.toml
```

This replays the planner with the new inputs (and optional blueprint). The same TOML rules apply—no CLI overrides.

---

## 5. Inspect providers

```bash
tutopanda providers:list --using-blueprint=cli/blueprints/audio-only.toml
```

The command loads the blueprint, enumerates its `[[producers]]`, and attempts to warm-start the configured providers. This is a quick readiness check for your TOML definitions.

---

## Summary

- **Blueprints** define graphs *and* provider settings.
- **Inputs TOML** supplies runtime values.
- **The CLI no longer writes or reads `providers.json`, `config.json`, or JSON overrides.**

Keep everything in version-controlled TOML files and run commands by pointing Tutopanda at those files.***
