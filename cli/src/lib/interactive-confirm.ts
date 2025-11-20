/* eslint-disable no-console */
import process from 'node:process';
import * as readline from 'node:readline';
import type { ExecutionPlan, InputEvent } from 'tutopanda-core';

const console = globalThis.console;

interface PlanConfirmationOptions {
  inputs?: InputEvent[];
  concurrency?: number;
}

function displayInputSummary(events: InputEvent[] | undefined): void {
  if (!events || events.length === 0) {
    return;
  }
  const sorted = [...events].sort((a, b) => a.id.localeCompare(b.id));
  console.log('\n=== Input Summary ===');
  for (const event of sorted) {
    console.log(`  • ${event.id}: ${formatInputValue(event.payload)}`);
  }
  console.log('');
}

function formatInputValue(value: unknown): string {
  if (typeof value === 'string') {
    const compact = value.replace(/\s+/g, ' ').trim();
    return compact.length > 0 ? compact : '(empty string)';
  }
  if (value === null || value === undefined) {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return '[unserializable]';
  }
}

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
export async function confirmPlanExecution(
  plan: ExecutionPlan,
  options: PlanConfirmationOptions = {},
): Promise<boolean> {
  displayInputSummary(options.inputs);
  displayPlanSummary(plan);
  displayLayerBreakdown(plan, options.concurrency ?? 1);

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

function displayLayerBreakdown(plan: ExecutionPlan, concurrency: number): void {
  const safeConcurrency = Number.isInteger(concurrency) && concurrency > 0 ? concurrency : 1;
  console.log('Execution Order (by layer):');
  console.log(`Concurrency: ${safeConcurrency} job(s) in parallel per layer (where available)\n`);

  plan.layers.forEach((layer, index) => {
    if (layer.length === 0) {
      console.log(`  Layer ${index}: (no jobs)`);
      return;
    }

    const concurrencyLabel =
      layer.length > 1 && safeConcurrency > 1
        ? `parallel (up to ${Math.min(safeConcurrency, layer.length)} at once)`
        : 'sequential';

    console.log(`  Layer ${index} (${layer.length} job${layer.length === 1 ? '' : 's'} - ${concurrencyLabel}):`);
    for (const job of layer) {
      const producerLabel = typeof job.producer === 'string' ? job.producer : 'unknown-producer';
      console.log(`    • ${job.jobId} [${producerLabel}]`);
    }
    console.log('');
  });
}
