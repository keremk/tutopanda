#!/usr/bin/env node
import React from 'react';
import { render } from 'ink';
import meow from 'meow';
import App from './app.js';
import { runStorageInit } from './commands/storage-init.js';

const cli = meow(
  `\nUsage\n  $ tutopanda <command> [options]\n\nCommands\n  storage init   Initialize storage structure for a movie\n\nOptions\n  --movie <id>   Movie identifier (required for storage init)\n  --root <path>  Root directory for storage (defaults to cwd)\n  --base-path <prefix>  Optional base prefix inside the storage root\n\nExamples\n  $ tutopanda storage init --movie demo\n`,
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

  render(<App name={cli.flags.name} />);
}

void main();
