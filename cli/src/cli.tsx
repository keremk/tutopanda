#!/usr/bin/env node
import React from 'react';
import { render } from 'ink';
import meow from 'meow';
import App from './app.js';
import { runManifestShow } from './commands/manifest-show.js';
import { runEventsAppend } from './commands/events-append.js';
import { runStorageInit } from './commands/storage-init.js';

const cli = meow(
  `\nUsage\n  $ tutopanda <command> [options]\n\nCommands\n  storage init     Initialize storage structure for a movie\n  events append    Append an event JSON payload to the appropriate log\n  manifest show    Print the latest manifest for a movie\n\nOptions\n  --movie <id>     Movie identifier (required)\n  --root <path>    Root directory for storage (defaults to cwd)\n  --base-path <prefix>  Optional base prefix inside the storage root\n  --type <kind>    Event kind (input|artifact) for events append\n  --file <path>    Path to JSON file describing the event payload\n\nExamples\n  $ tutopanda storage init --movie demo\n  $ tutopanda events append --movie demo --type input --file input.json\n  $ tutopanda manifest show --movie demo\n`,
  {
    importMeta: import.meta,
    flags: {
      movie: {
        type: 'string',
      },
      root: {
        type: 'string',
      },
      basePath: {
        type: 'string',
      },
      name: {
        type: 'string',
      },
      type: {
        type: 'string',
      },
      file: {
        type: 'string',
      },
    },
  },
);

async function main(): Promise<void> {
  const [command, subcommand] = cli.input;

  if (command === 'storage' && subcommand === 'init') {
    if (!cli.flags.movie) {
      console.error('Error: --movie is required for storage init');
      process.exitCode = 1;
      return;
    }

    const { rootPath } = await runStorageInit({
      movieId: cli.flags.movie,
      rootDir: cli.flags.root,
      basePath: cli.flags.basePath,
    });
    console.log(`Initialized storage at ${rootPath}`);
    return;
  }

  if (command === 'events' && subcommand === 'append') {
    if (!cli.flags.movie) {
      console.error('Error: --movie is required for events append');
      process.exitCode = 1;
      return;
    }
    const rawType = cli.flags.type?.toLowerCase();
    if (!rawType) {
      console.error('Error: --type is required for events append');
      process.exitCode = 1;
      return;
    }
    const normalizedType = rawType === 'artefact' ? 'artifact' : rawType;
    if (normalizedType !== 'input' && normalizedType !== 'artifact') {
      console.error('Error: --type must be either "input" or "artifact"');
      process.exitCode = 1;
      return;
    }
    if (!cli.flags.file) {
      console.error('Error: --file is required for events append');
      process.exitCode = 1;
      return;
    }

    const { eventPath } = await runEventsAppend({
      movieId: cli.flags.movie,
      type: normalizedType,
      file: cli.flags.file,
      rootDir: cli.flags.root,
      basePath: cli.flags.basePath,
    });
    console.log(`Appended ${normalizedType} event from ${eventPath}`);
    return;
  }

  if (command === 'manifest' && subcommand === 'show') {
    if (!cli.flags.movie) {
      console.error('Error: --movie is required for manifest show');
      process.exitCode = 1;
      return;
    }

    const result = await runManifestShow({
      movieId: cli.flags.movie,
      rootDir: cli.flags.root,
      basePath: cli.flags.basePath,
    });

    if (result.status === 'not-found') {
      console.error('No manifest found. Run a build to create the first revision.');
      process.exitCode = 1;
      return;
    }

    console.log(JSON.stringify(result.manifest, null, 2));
    console.log(`Manifest hash: ${result.hash}`);
    return;
  }

  render(<App name={cli.flags.name} />);
}

void main();
