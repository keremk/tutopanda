import type { MediaProvider } from "./types";

/**
 * Generic provider registry for media generation.
 * Manages registration and lookup of providers by model name.
 */
export class ProviderRegistry<T extends MediaProvider> {
  private providers: Map<string, T> = new Map();
  private modelToProvider: Map<string, T> = new Map();

  /**
   * Register a provider and index all its supported models.
   */
  register(provider: T): void {
    this.providers.set(provider.name, provider);

    for (const model of provider.supportedModels) {
      this.modelToProvider.set(model, provider);
    }
  }

  /**
   * Get a provider that supports the given model.
   * @throws Error if no provider supports the model
   */
  getProvider(model: string): T {
    const provider = this.modelToProvider.get(model);

    if (!provider) {
      const availableModels = Array.from(this.modelToProvider.keys());
      throw new Error(
        `No provider found for model "${model}". Available models: ${availableModels.join(", ")}`
      );
    }

    return provider;
  }

  /**
   * Get all registered providers.
   */
  getAllProviders(): T[] {
    return Array.from(this.providers.values());
  }

  /**
   * Check if a model is supported by any provider.
   */
  isModelSupported(model: string): boolean {
    return this.modelToProvider.has(model);
  }
}
