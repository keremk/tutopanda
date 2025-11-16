import { spawn } from 'node:child_process';
import os from 'node:os';
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
  const command = getOpenCommand(url);

  const child = spawn(command.bin, command.args, { detached: true, stdio: 'ignore' });
  child.on('error', (error) => {
    console.warn(`Failed to open the browser automatically: ${error.message}`);
    console.warn(`Open the viewer manually: ${url}`);
  });
  child.unref();
}

function getOpenCommand(url: string) {
  const platform = process.platform;
  if (platform === 'darwin') {
    return { bin: 'open', args: [url] };
  }
  if (platform === 'win32') {
    return { bin: 'cmd', args: ['/c', 'start', '', url] };
  }
  if (isWSL()) {
    // Use Windows default browser even when running inside WSL.
    return { bin: 'cmd.exe', args: ['/c', 'start', '', url] };
  }
  return { bin: 'xdg-open', args: [url] };
}

function isWSL(): boolean {
  if (process.platform !== 'linux') {
    return false;
  }
  if (process.env.WSL_DISTRO_NAME) {
    return true;
  }
  const release = os.release().toLowerCase();
  return release.includes('microsoft') || release.includes('wsl');
}
