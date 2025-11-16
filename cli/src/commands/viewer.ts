import { spawn } from 'node:child_process';
import process from 'node:process';
import { readCliConfig } from '../lib/cli-config.js';

const console = globalThis.console;

export interface ViewerOptions {
  movieId?: string;
}

export async function runViewer(options: ViewerOptions = {}): Promise<void> {
  const cliConfig = await readCliConfig();
  if (!cliConfig?.storage?.root) {
    console.error('Tutopanda viewer requires a configured root. Run "tutopanda init" first.');
    process.exitCode = 1;
    return;
  }

  const rootFolder = cliConfig.storage.root;
  const env = {
    ...process.env,
    TUTOPANDA_VIEWER_ROOT: rootFolder,
  };

  const viewerProcess = spawn('pnpm', ['--filter', 'viewer', 'dev'], {
    stdio: 'inherit',
    env,
  });

  viewerProcess.on('exit', (code) => {
    process.exitCode = code ?? 0;
  });

  if (options.movieId) {
    const targetUrl = `http://localhost:5173/movies/${encodeURIComponent(options.movieId)}`;
    openBrowser(targetUrl);
  } else {
    console.log('Viewer running at http://localhost:5173');
  }
}

function openBrowser(url: string) {
  const platform = process.platform;
  if (platform === 'darwin') {
    spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
    return;
  }
  if (platform === 'win32') {
    spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref();
    return;
  }
  spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
}
