/* eslint-disable no-console */
import { rm } from 'node:fs/promises';

const console = globalThis.console;

/**
 * Clean up files generated during plan creation.
 * Removes the entire movie directory.
 */
export async function cleanupPlanFiles(movieDir: string): Promise<void> {
  try {
    await rm(movieDir, { recursive: true, force: true });
  } catch (error) {
    // Ignore errors if directory doesn't exist or can't be deleted
    console.warn(`Warning: Could not clean up directory ${movieDir}:`, error);
  }
}
