import { describe, it, expect, vi } from "vitest";
import { batchWithConcurrency } from "./batch-utils";
import { delay } from "../__test-utils__/mocks";

describe("batchWithConcurrency", () => {
  it("processes items in correct batch sizes", async () => {
    const items = Array.from({ length: 20 }, (_, i) => i);
    const operation = vi.fn(async (item: number) => item * 2);

    const results = await batchWithConcurrency(items, operation, {
      maxConcurrency: 5,
    });

    expect(results).toHaveLength(20);
    expect(results[0]).toBe(0);
    expect(results[19]).toBe(38);
    expect(operation).toHaveBeenCalledTimes(20);
  });

  it("maintains order of results", async () => {
    const items = [1, 2, 3, 4, 5];
    const operation = async (item: number) => {
      // Add random delay to simulate async work
      await delay(Math.random() * 10);
      return item * 2;
    };

    const results = await batchWithConcurrency(items, operation, {
      maxConcurrency: 3,
    });

    expect(results).toEqual([2, 4, 6, 8, 10]);
  });

  it("calls onBatchComplete callback correctly", async () => {
    const items = Array.from({ length: 12 }, (_, i) => i);
    const operation = async (item: number) => item;
    const onBatchComplete = vi.fn();

    await batchWithConcurrency(items, operation, {
      maxConcurrency: 5,
      onBatchComplete,
    });

    // 12 items with concurrency 5 = 3 batches (5, 5, 2)
    expect(onBatchComplete).toHaveBeenCalledTimes(3);
    expect(onBatchComplete).toHaveBeenNthCalledWith(1, 1, 3);
    expect(onBatchComplete).toHaveBeenNthCalledWith(2, 2, 3);
    expect(onBatchComplete).toHaveBeenNthCalledWith(3, 3, 3);
  });

  it("handles empty array", async () => {
    const items: number[] = [];
    const operation = vi.fn(async (item: number) => item);

    const results = await batchWithConcurrency(items, operation);

    expect(results).toEqual([]);
    expect(operation).not.toHaveBeenCalled();
  });

  it("handles single item", async () => {
    const items = [42];
    const operation = vi.fn(async (item: number) => item * 2);

    const results = await batchWithConcurrency(items, operation, {
      maxConcurrency: 5,
    });

    expect(results).toEqual([84]);
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it("processes batches sequentially (not parallel across batches)", async () => {
    const items = Array.from({ length: 10 }, (_, i) => i);
    const executionOrder: number[] = [];
    const operation = async (item: number, index: number) => {
      executionOrder.push(index);
      await delay(5);
      return item;
    };

    await batchWithConcurrency(items, operation, {
      maxConcurrency: 3,
    });

    // First 3 items should be processed, then next 3, etc.
    // Check that items 0-2 are all recorded before items 3-5
    const firstBatchIndices = executionOrder.slice(0, 3);
    const secondBatchIndices = executionOrder.slice(3, 6);

    expect(firstBatchIndices.every((idx) => idx < 3)).toBe(true);
    expect(secondBatchIndices.every((idx) => idx >= 3 && idx < 6)).toBe(true);
  });

  it("processes items in parallel within each batch", async () => {
    const items = [1, 2, 3];
    const startTimes: number[] = [];
    const operation = async (item: number) => {
      startTimes.push(Date.now());
      await delay(10);
      return item;
    };

    const start = Date.now();
    await batchWithConcurrency(items, operation, {
      maxConcurrency: 3,
    });
    const duration = Date.now() - start;

    // All 3 items should start within a few milliseconds of each other
    const maxStartTimeSpread = Math.max(...startTimes) - Math.min(...startTimes);
    expect(maxStartTimeSpread).toBeLessThan(20);

    // Total duration should be close to 10ms (parallel), not 30ms (sequential)
    expect(duration).toBeLessThan(50);
  });

  it("handles operation errors gracefully", async () => {
    const items = [1, 2, 3, 4, 5];
    const operation = async (item: number) => {
      if (item === 3) {
        throw new Error("Test error");
      }
      return item * 2;
    };

    await expect(
      batchWithConcurrency(items, operation, {
        maxConcurrency: 2,
      })
    ).rejects.toThrow("Test error");
  });

  it("passes correct index to operation", async () => {
    const items = ["a", "b", "c", "d"];
    const indices: number[] = [];
    const operation = async (_item: string, index: number) => {
      indices.push(index);
      return index;
    };

    await batchWithConcurrency(items, operation, {
      maxConcurrency: 2,
    });

    expect(indices).toEqual([0, 1, 2, 3]);
  });

  it("uses default concurrency of 5 when not specified", async () => {
    const items = Array.from({ length: 12 }, (_, i) => i);
    const operation = vi.fn(async (item: number) => item);
    const onBatchComplete = vi.fn();

    await batchWithConcurrency(items, operation, {
      onBatchComplete,
    });

    // 12 items with default concurrency 5 = 3 batches
    expect(onBatchComplete).toHaveBeenCalledTimes(3);
  });

  it("handles items that are not numbers", async () => {
    const items = [
      { id: 1, value: "a" },
      { id: 2, value: "b" },
      { id: 3, value: "c" },
    ];
    const operation = async (item: { id: number; value: string }) => {
      return `${item.id}:${item.value}`;
    };

    const results = await batchWithConcurrency(items, operation, {
      maxConcurrency: 2,
    });

    expect(results).toEqual(["1:a", "2:b", "3:c"]);
  });
});
