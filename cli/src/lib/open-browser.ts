import { spawn } from 'node:child_process';
import os from 'node:os';
import process from 'node:process';

export function openBrowser(url: string): void {
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
