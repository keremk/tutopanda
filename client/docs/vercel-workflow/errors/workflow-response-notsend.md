# webhook-response-not-sent (/docs/errors/webhook-response-not-sent)

# `webhook-response-not-sent`

This error occurs when a webhook is configured with `respondWith: "manual"` but the workflow does not send a response using `request.respondWith()` before the webhook execution completes.

***

## Error Message

```
Workflow run did not send a response
```

***

## Why This Happens

When you create a webhook with `respondWith: "manual"`, you are responsible for calling `request.respondWith()` to send the HTTP response back to the caller. If the workflow execution completes without sending a response, this error will be thrown.

The webhook infrastructure waits for a response to be sent, and if none is provided, it cannot complete the HTTP request properly.

***

## Common Causes

### Forgetting to Call `request.respondWith()`

```typescript lineNumbers
// Error - no response sent
export async function webhookWorkflow() {
  "use workflow";

  const webhook = await createWebhook({
    respondWith: "manual",
  });

  const request = await webhook;
  const data = await request.json();

  // Process data...
  console.log(data);

  // Error: workflow ends without calling request.respondWith() // [!code highlight]
}
```

**Solution:** Always call `request.respondWith()` when using manual response mode.

```typescript lineNumbers
// Fixed - response sent
export async function webhookWorkflow() {
  "use workflow";

  const webhook = await createWebhook({
    respondWith: "manual",
  });

  const request = await webhook;
  const data = await request.json();

  // Process data...
  console.log(data);

  // Send response before workflow ends // [!code highlight]
  await request.respondWith(new Response("Processed", { status: 200 })); // [!code highlight]
}
```

### Conditional Response Logic

```typescript lineNumbers
// Error - response only sent in some branches
export async function webhookWorkflow() {
  "use workflow";

  const webhook = await createWebhook({
    respondWith: "manual",
  });

  const request = await webhook;
  const data = await request.json();

  if (data.isValid) {
    await request.respondWith(new Response("OK", { status: 200 }));
  }
  // Error: no response when data.isValid is false // [!code highlight]
}
```

**Solution:** Ensure all code paths send a response.

```typescript lineNumbers
// Fixed - response sent in all branches
export async function webhookWorkflow() {
  "use workflow";

  const webhook = await createWebhook({
    respondWith: "manual",
  });

  const request = await webhook;
  const data = await request.json();

  if (data.isValid) { // [!code highlight]
    await request.respondWith(new Response("OK", { status: 200 })); // [!code highlight]
  } else { // [!code highlight]
    await request.respondWith(new Response("Invalid data", { status: 400 })); // [!code highlight]
  } // [!code highlight]
}
```

### Exception Before Response

```typescript lineNumbers
// Error - exception thrown before response
export async function webhookWorkflow() {
  "use workflow";

  const webhook = await createWebhook({
    respondWith: "manual",
  });

  const request = await webhook;

  // Error occurs here // [!code highlight]
  throw new Error("Something went wrong"); // [!code highlight]

  // Never reached
  await request.respondWith(new Response("OK", { status: 200 }));
}
```

**Solution:** Use try-catch to handle errors and send appropriate responses.

```typescript lineNumbers
// Fixed - error handling with response
export async function webhookWorkflow() {
  "use workflow";

  const webhook = await createWebhook({
    respondWith: "manual",
  });

  const request = await webhook;

  try { // [!code highlight]
    // Process request...
    const result = await processData(request); // [!code highlight]
    await request.respondWith(new Response("OK", { status: 200 })); // [!code highlight]
  } catch (error) { // [!code highlight]
    // Send error response // [!code highlight]
    await request.respondWith( // [!code highlight]
      new Response("Internal error", { status: 500 }) // [!code highlight]
    ); // [!code highlight]
  } // [!code highlight]
}
```

***

## Alternative: Use Default Response Mode

If you don't need custom response control, consider using the default response mode which automatically returns a `202 Accepted` response:

```typescript lineNumbers
// Automatic 202 response - no manual response needed
export async function webhookWorkflow() {
  "use workflow";

  const webhook = await createWebhook(); // [!code highlight]
  const request = await webhook;

  // Process request asynchronously
  await processData(request);

  // No need to call request.respondWith()
}
```

***

## Learn More

* [createWebhook() API Reference](/docs/api-reference/workflow/create-webhook)
* [resumeWebhook() API Reference](/docs/api-reference/workflow-api/resume-webhook)
* [Webhooks Guide](/docs/foundations/hooks)
