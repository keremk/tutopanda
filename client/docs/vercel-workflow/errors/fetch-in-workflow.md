# fetch-in-workflow (/docs/errors/fetch-in-workflow)

# `fetch-in-workflow`

This error occurs when you try to use `fetch()` directly in a workflow function, or when a library (like the AI SDK) tries to call `fetch()` under the hood.

***

## Error Message

```
Global "fetch" is unavailable in workflow functions. Use the "fetch" step function from "workflow" to make HTTP requests.
```

***

## Why This Happens

Workflow functions run in a sandboxed environment without direct access to `fetch()`.

Many libraries make HTTP requests under the hood. For example, the AI SDK's `generateText()` function calls `fetch()` to make HTTP requests to AI providers. When these libraries run inside a workflow function, they fail because the global `fetch` is not available.

***

## Quick Fix

Import the `fetch` step function from the `workflow` package and assign it to `globalThis.fetch` inside your workflow function. This version of `fetch` is a step function that wraps the standard `fetch` API, automatically handling serialization and providing retry capabilities. This will also make `fetch()` available to all functions and libraries in the current workflow function.

**Before:**

```typescript lineNumbers title="workflows/ai.ts"
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';

export async function chatWorkflow(prompt: string) {
  "use workflow";

  // Error - generateText() calls fetch() under the hood
  const result = await generateText({ // [!code highlight]
    model: openai('gpt-4'), // [!code highlight]
    prompt, // [!code highlight]
  }); // [!code highlight]

  return result.text;
}
```

**After:**

```typescript lineNumbers title="workflows/ai.ts"
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { fetch } from 'workflow'; // [!code highlight]

export async function chatWorkflow(prompt: string) {
  "use workflow";

  globalThis.fetch = fetch; // [!code highlight]

  // Now generateText() can make HTTP requests via the fetch step
  const result = await generateText({
    model: openai('gpt-4'),
    prompt,
  });

  return result.text;
}
```

***

## Common Scenarios

### AI SDK Integration

This is the most common scenario - using AI SDK functions that make HTTP requests:

```typescript lineNumbers
import { generateText, streamText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { fetch } from 'workflow'; // [!code highlight]

export async function aiWorkflow(userMessage: string) {
  "use workflow";

  globalThis.fetch = fetch; // [!code highlight]

  // generateText makes HTTP requests to OpenAI
  const response = await generateText({
    model: openai('gpt-4'),
    prompt: userMessage,
  });

  return response.text;
}
```

### Direct API Calls

You can also use the fetch step function directly for your own HTTP requests:

```typescript lineNumbers
import { fetch } from 'workflow';

export async function dataWorkflow() {
  "use workflow";

  // Use fetch directly for HTTP requests
  const response = await fetch('https://api.example.com/data'); // [!code highlight]
  const data = await response.json();

  return data;
}
```

For more details on the `fetch` step function, see the [fetch API reference](/docs/api-reference/workflow/fetch).
