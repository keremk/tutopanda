# node-js-module-in-workflow (/docs/errors/node-js-module-in-workflow)

# `node-js-module-in-workflow`

This error occurs when you try to import or use Node.js core modules (like `fs`, `http`, `crypto`, `path`, etc.) directly inside a workflow function.

***

## Error Message

```
Cannot use Node.js module "fs" in workflow functions. Move this module to a step function.
```

***

## Why This Happens

Workflow functions run in a sandboxed environment without full Node.js runtime access. This restriction is important for maintaining **determinism** - the ability to replay workflows exactly and resume from where they left off after suspensions or failures.

Node.js modules have side effects and non-deterministic behavior that could break workflow replay guarantees.

***

## Quick Fix

Move any code using Node.js modules to a step function. Step functions have full Node.js runtime access.

For example, when trying to read a file in a workflow function, you should move the code to a step function.

**Before:**

```typescript lineNumbers
import * as fs from 'fs';

export async function processFileWorkflow(filePath: string) {
  "use workflow";

  // This will cause an error - Node.js module in workflow context
  const content = fs.readFileSync(filePath, 'utf-8'); // [!code highlight]
  return content;
}
```

**After:**

```typescript lineNumbers
import * as fs from 'fs';

export async function processFileWorkflow(filePath: string) {
  "use workflow";

  // Call step function that has Node.js access
  const content = await read(filePath); // [!code highlight]
  return content;
}

async function read(filePath: string) {
  "use step";

  // Node.js modules are allowed in step functions
  return fs.readFileSync(filePath, 'utf-8'); // [!code highlight]
}
```

***

## Common Node.js Modules

These common Node.js core modules cannot be used in workflow functions:

* File system: `fs`, `path`
* Network: `http`, `https`, `net`, `dns`, `fetch`
* Process: `child_process`, `cluster`
* Crypto: `crypto` (use Web Crypto API instead)
* Operating system: `os`
* Streams: `stream` (use Web Streams API instead)

<Callout type="info">
  You can use Web Platform APIs in workflow functions (like `Headers`, `crypto.randomUUID()`, `Response`, etc.), since these are available in the sandboxed environment.
</Callout>
