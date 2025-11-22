import { describe, expect, it, vi } from 'vitest';
import { runReplicateWithRetries } from './retry.js';

describe('runReplicateWithRetries', () => {
  it('retries on 429 and waits retry_after + 1 second', async () => {
    const run = vi.fn()
      .mockRejectedValueOnce({
        status: 429,
        body: { retry_after: 1 },
        message: '429 Too Many Requests',
      })
      .mockRejectedValueOnce({
        status: 429,
        body: { retry_after: 1 },
        message: '429 Too Many Requests',
      })
      .mockResolvedValue('ok');

    const logger = { warn: vi.fn(), info: vi.fn() } as any;
    const started = Date.now();
    const result = await runReplicateWithRetries({
      replicate: { run },
      modelIdentifier: 'owner/model:version',
      input: { foo: 'bar' },
      logger,
      jobId: 'job-1',
      model: 'owner/model',
      plannerContext: {},
      maxAttempts: 3,
      defaultRetryMs: 500,
    });
    const elapsed = Date.now() - started;

    expect(result).toBe('ok');
    expect(run).toHaveBeenCalledTimes(3);
    expect(elapsed).toBeGreaterThanOrEqual(2000); // two waits of ~1s+ buffer each
    expect(logger.warn).toHaveBeenCalledWith(
      'providers.replicate.retry',
      expect.objectContaining({
        producer: 'job-1',
        model: 'owner/model',
        status: 429,
        attempt: 1,
      }),
    );
    expect(logger.info).toHaveBeenCalledWith(
      'providers.replicate.retry.waited',
      expect.objectContaining({
        producer: 'job-1',
        model: 'owner/model',
        attempt: 1,
        waitedMs: expect.any(Number),
      }),
    );
  });

  it('gives up after max attempts and throws a rate-limit error', async () => {
    const run = vi.fn().mockRejectedValue({
      status: 429,
      body: { retry_after: 0 },
      message: '429 Too Many Requests',
    });
    await expect(
      runReplicateWithRetries({
        replicate: { run },
        modelIdentifier: 'owner/model',
        input: {},
        logger: { warn: vi.fn(), info: vi.fn() } as any,
        jobId: 'job-2',
        model: 'owner/model',
        plannerContext: {},
        maxAttempts: 2,
        defaultRetryMs: 10,
      }),
    ).rejects.toThrow(/replicate rate limit/i);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('does not retry non-429 errors', async () => {
    const run = vi.fn().mockRejectedValue({ status: 500, message: 'server error' });
    await expect(
      runReplicateWithRetries({
        replicate: { run },
        modelIdentifier: 'owner/model',
        input: {},
        logger: { warn: vi.fn(), info: vi.fn() } as any,
        jobId: 'job-3',
        model: 'owner/model',
        plannerContext: {},
      }),
    ).rejects.toThrow(/server error/);
    expect(run).toHaveBeenCalledTimes(1);
  });
});
