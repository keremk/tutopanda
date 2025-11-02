import { resolve } from 'node:path';
import os from 'node:os';

export function expandPath(maybeRelative: string): string {
  if (maybeRelative.startsWith('~/')) {
    return resolve(os.homedir(), maybeRelative.slice(2));
  }
  if (maybeRelative === '~') {
    return os.homedir();
  }
  return resolve(maybeRelative);
}
