/**
 * Normalizes Replicate API output to extract URL strings.
 *
 * Replicate SDK returns file objects with a `url()` method that returns URL objects
 * (not strings). This function handles both plain string URLs and file objects,
 * extracting the `href` property from URL objects.
 */
export function normalizeReplicateOutput(output: unknown): string[] {
  if (!output) {
    return [];
  }

  // Array of URLs or file objects
  if (Array.isArray(output)) {
    const urls: string[] = [];
    for (const item of output) {
      // Plain string URL
      if (typeof item === 'string' && item.length > 0) {
        urls.push(item);
      }
      // File object with url() method - Replicate SDK returns file objects with url() that returns URL objects
      else if (item && typeof item === 'object' && 'url' in item) {
        const obj = item as Record<string, unknown>;
        const urlProp = obj.url;
        const urlResult = typeof urlProp === 'function' ? (urlProp as () => unknown)() : urlProp;

        // Handle string URLs or URL objects (which have an href property)
        let urlString: string | undefined;
        if (typeof urlResult === 'string') {
          urlString = urlResult;
        } else if (urlResult && typeof urlResult === 'object' && 'href' in urlResult) {
          const href = (urlResult as Record<string, unknown>).href;
          urlString = typeof href === 'string' ? href : undefined;
        }

        if (urlString && urlString.length > 0) {
          urls.push(urlString);
        }
      }
    }
    return urls;
  }

  // Single string URL
  if (typeof output === 'string' && output.length > 0) {
    return [output];
  }

  // Single file object with url() method
  if (output && typeof output === 'object' && 'url' in output) {
    const obj = output as Record<string, unknown>;
    const urlProp = obj.url;
    const urlResult = typeof urlProp === 'function' ? (urlProp as () => unknown)() : urlProp;

    let urlString: string | undefined;
    if (typeof urlResult === 'string') {
      urlString = urlResult;
    } else if (urlResult && typeof urlResult === 'object' && 'href' in urlResult) {
      const href = (urlResult as Record<string, unknown>).href;
      urlString = typeof href === 'string' ? href : undefined;
    }

    if (urlString && urlString.length > 0) {
      return [urlString];
    }
  }

  return [];
}
