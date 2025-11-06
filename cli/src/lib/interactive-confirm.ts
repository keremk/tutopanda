/* eslint-disable no-console */
import process from 'node:process';
import * as readline from 'node:readline';
import type { ExecutionPlan } from 'tutopanda-core';

const console = globalThis.console;

/**
 * Display a summary of the execution plan grouped by producer.
 */
function displayPlanSummary(plan: ExecutionPlan): void {
  // Flatten all jobs from all layers
  const allJobs = plan.layers.flat();

  // Count jobs by producer
  const byProducer = new Map<string, number>();
  for (const job of allJobs) {
    byProducer.set(job.producer, (byProducer.get(job.producer) ?? 0) + 1);
  }

  console.log('\n=== Execution Plan Summary ===');
  console.log(`Revision: ${plan.revision}`);
  console.log(`Total Jobs: ${allJobs.length}`);
  console.log(`Layers: ${plan.layers.length}`);
  console.log('\nJobs by Producer:');

  for (const [producer, count] of byProducer) {
    const jobWord = count === 1 ? 'job' : 'jobs';
    console.log(`  • ${producer}: ${count} ${jobWord}`);
  }

  console.log('');
}

/**
 * Prompt user to confirm plan execution.
 * Returns true if user confirms, false otherwise.
 */
export async function confirmPlanExecution(plan: ExecutionPlan): Promise<boolean> {
  displayPlanSummary(plan);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question('Proceed with execution? (y/n): ', (answer) => {
      rl.close();
      const normalized = answer.trim().toLowerCase();
      resolve(normalized === 'y' || normalized === 'yes');
    });
  });
}
