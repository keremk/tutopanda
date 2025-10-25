# webhook-invalid-respond-with-value (/docs/errors/webhook-invalid-respond-with-value)

# `webhook-invalid-respond-with-value`

This error occurs when you provide an invalid value for the `respondWith` option when creating a webhook. The `respondWith` option must be either `"manual"` or a `Response` object.

***

## Error Message

```
Invalid `respondWith` value: [value]
```

***

## Why This Happens

When creating a webhook with `createWebhook()`, you can specify how the webhook should respond to incoming HTTP requests using the `respondWith` option. This option only accepts specific values:

1. `"manual"` - Allows you to manually send a response from within the workflow
2. A `Response` object - A pre-defined response to send immediately
3. `undefined` (default) - Returns a `202 Accepted` response

***

## Common Causes

### Using an Invalid String Value

```typescript lineNumbers
// Error - invalid string value
export async function webhookWorkflow() {
  "use workflow";

  const webhook = await createWebhook({
    respondWith: "automatic", // Error! // [!code highlight]
  });
}
```

**Solution:** Use `"manual"` or provide a `Response` object.

```typescript lineNumbers
// Fixed - use "manual"
export async function webhookWorkflow() {
  "use workflow";

  const webhook = await createWebhook({
    respondWith: "manual", // [!code highlight]
  });

  const request = await webhook;

  // Send custom response
  await request.respondWith(new Response("OK", { status: 200 })); // [!code highlight]
}
```

### Using a Non-Response Object

```typescript lineNumbers
// Error - plain object instead of Response
export async function webhookWorkflow() {
  "use workflow";

  const webhook = await createWebhook({
    respondWith: { status: 200, body: "OK" }, // Error! // [!code highlight]
  });
}
```

**Solution:** Create a proper `Response` object.

```typescript lineNumbers
// Fixed - use Response constructor
export async function webhookWorkflow() {
  "use workflow";

  const webhook = await createWebhook({
    respondWith: new Response("OK", { status: 200 }), // [!code highlight]
  });
}
```

***

## Valid Usage Examples

### Default Behavior (202 Response)

```typescript lineNumbers
// Returns 202 Accepted automatically
const webhook = await createWebhook();
const request = await webhook;
// No need to send a response
```

### Manual Response

```typescript lineNumbers
// Manual response control
const webhook = await createWebhook({
  respondWith: "manual",
});

const request = await webhook;

// Process the request...
const data = await request.json();

// Send custom response
await request.respondWith(
  new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  })
);
```

### Pre-defined Response

```typescript lineNumbers
// Immediate response
const webhook = await createWebhook({
  respondWith: new Response("Request received", { status: 200 }),
});

const request = await webhook;
// Response already sent
```

***

## Learn More

* [createWebhook() API Reference](/docs/api-reference/workflow/create-webhook)
* [resumeWebhook() API Reference](/docs/api-reference/workflow-api/resume-webhook)
* [Webhooks Guide](/docs/foundations/hooks)
