import { vi } from 'vitest';

vi.mock('@tutopanda/providers', async () => {
  const actual = await vi.importActual<typeof import('@tutopanda/providers')>('@tutopanda/providers');
  return {
    ...actual,
    createProviderRegistry: (options?: Parameters<typeof actual.createProviderRegistry>[0]) =>
      actual.createProviderRegistry({
        ...(options ?? {}),
        mode: 'mock',
      }),
  };
});
