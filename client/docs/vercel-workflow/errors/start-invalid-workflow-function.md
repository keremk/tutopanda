# start-invalid-workflow-function (/docs/errors/start-invalid-workflow-function)

# `start-invalid-workflow-function`

This error occurs when you try to call `start()` with a function that is not a valid workflow function or when the Workflow DevKit is not configured correctly.

***

## Error Message

```
'start' received an invalid workflow function. Ensure the Workflow DevKit
is configured correctly and the function includes a 'use workflow' directive.
```

***

## Why This Happens

The `start()` function expects a workflow function that has been properly processed by Workflow DevKit's build system. During the build process, workflow functions are transformed and marked with special metadata that `start()` uses to identify and execute them.

This error typically happens when:

* The function is missing the `"use workflow"` directive
* The workflow isn't being built/transformed correctly
* The function isn't exported from the workflow file
* The wrong function is being imported

***

## Common Causes

### Missing `"use workflow"` Directive

```typescript lineNumbers title="workflows/order.ts"
// Error - missing directive
export async function processOrder(orderId: string) { // [!code highlight]
  // workflow logic
  return { status: 'completed' };
}
```

**Solution:** Add the `"use workflow"` directive.

```typescript lineNumbers title="workflows/order.ts"
// Fixed - includes directive
export async function processOrder(orderId: string) {
  "use workflow"; // [!code highlight]

  // workflow logic
  return { status: 'completed' };
}
```

### Incorrect Import

```typescript lineNumbers title="app/api/route.ts"
import { start } from 'workflow/api';
// Error - importing step function instead of workflow
import { processStep } from '@/workflows/order'; // [!code highlight]

export async function POST(request: Request) {
  await start(processStep, ['order-123']); // Error! // [!code highlight]
  return Response.json({ started: true });
}
```

**Solution:** Import the correct workflow function.

```typescript lineNumbers title="app/api/route.ts"
import { start } from 'workflow/api';
// Fixed - import workflow function
import { processOrder } from '@/workflows/order'; // [!code highlight]

export async function POST(request: Request) {
  await start(processOrder, ['order-123']); // [!code highlight]
  return Response.json({ started: true });
}
```

### Next.js Configuration Missing

```typescript lineNumbers title="next.config.ts"
// Error - missing withWorkflow wrapper
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // your config
};

export default nextConfig;
```

**Solution:** Wrap with `withWorkflow()`.

```typescript lineNumbers title="next.config.ts"
// Fixed - includes withWorkflow
import { withWorkflow } from 'workflow/next'; // [!code highlight}
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // your config
};

export default withWorkflow(nextConfig); // [!code highlight]
```
