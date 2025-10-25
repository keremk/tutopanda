# Hooks & Webhooks (/docs/foundations/hooks)

# Hooks & Webhooks

Hooks provide a powerful mechanism for pausing workflow execution and resuming it later with external data. They enable workflows to wait for external events, user interactions (also known as "human in the loop"), or HTTP requests. This guide will teach you the core concepts, starting with the low-level Hook primitive and building up to the higher-level Webhook abstraction.

## Understanding Hooks

At their core, **Hooks** are a low-level primitive that allow you to pause a workflow and resume it later with arbitrary [serializable data](/docs/foundations/serialization). Think of them as a suspension point in your workflow where you're waiting for external input.

When you create a hook, it generates a unique token that external systems use to send data back to your workflow. This makes hooks perfect for scenarios like:

* Waiting for approval from a user or admin
* Receiving data from an external system or service
* Implementing event-driven workflows that react to multiple events over time

### Creating Your First Hook

Let's start with a simple example. Here's a workflow that creates a hook and waits for external data:

```typescript lineNumbers
import { createHook } from "workflow";

export async function approvalWorkflow() {
  "use workflow";

  // Create a hook that expects an approval payload
  const hook = createHook<{ approved: boolean; comment: string }>();

  console.log("Waiting for approval...");
  console.log("Send approval to token:", hook.token);

  // Workflow pauses here until data is sent
  const result = await hook;

  if (result.approved) {
    console.log("Approved with comment:", result.comment);
    // Continue with approved workflow...
  } else {
    console.log("Rejected:", result.comment);
    // Handle rejection...
  }
}
```

The workflow will pause at `await hook` until external code sends data to resume it.

<Callout type="info">
  See the full API reference for [`createHook()`](/docs/api-reference/workflow/create-hook) for all available options.
</Callout>

### Resuming a Hook

To send data to a waiting workflow, use [`resumeHook()`](/docs/api-reference/workflow-api/resume-hook) from an API route, server action, or any other external context:

```typescript lineNumbers
import { resumeHook } from "workflow/api";

// In an API route or external handler
export async function POST(request: Request) {
  const { token, approved, comment } = await request.json();

  // Resume the workflow with the approval data
  const result = await resumeHook(token, { approved, comment });

  if (result) {
    return Response.json({ success: true, runId: result.runId });
  } else {
    return Response.json({ error: "Invalid token" }, { status: 404 });
  }
}
```

The key points:

* Hooks allow you to pass **any [serializable data](/docs/foundations/serialization)** as the payload
* You need the hook's `token` to resume it
* The workflow will resume execution right where it left off

### Custom Tokens for Deterministic Hooks

By default, hooks generate a random token. However, you often want to use a **custom token** that the external system can reconstruct. This is especially useful for long-running workflows where the same workflow instance should handle multiple events.

For example, imagine a Slack bot where each channel should have its own workflow instance:

```typescript lineNumbers
import { createHook } from "workflow";

export async function slackChannelBot(channelId: string) {
  "use workflow";

  // Use channel ID in the token so Slack webhooks can find this workflow
  const hook = createHook<SlackMessage>({
    token: `slack_messages:${channelId}`
  });

  for await (const message of hook) {
    console.log(`${message.user}: ${message.text}`);

    if (message.text === "/stop") {
      break;
    }

    await processMessage(message);
  }
}

async function processMessage(message: SlackMessage) {
  "use step";
  // Process the Slack message
}
```

Now your Slack webhook handler can deterministically resume the correct workflow:

```typescript lineNumbers
import { resumeHook } from "workflow/api";

export async function POST(request: Request) {
  const slackEvent = await request.json();
  const channelId = slackEvent.channel;

  // Reconstruct the token using the channel ID
  await resumeHook(`slack_messages:${channelId}`, slackEvent);

  return new Response("OK");
}
```

### Receiving Multiple Events

Hooks are *reusable* - they implement `AsyncIterable`, which means you can use `for await...of` to receive multiple events over time:

```typescript lineNumbers
import { createHook } from "workflow";

export async function dataCollectionWorkflow() {
  "use workflow";

  const hook = createHook<{ value: number; done?: boolean }>();

  const values: number[] = [];

  // Keep receiving data until we get a "done" signal
  for await (const payload of hook) {
    values.push(payload.value);

    if (payload.done) {
      break;
    }
  }

  console.log("Collected values:", values);
  return values;
}
```

Each time you call `resumeHook()` with the same token, the loop receives another value.

## Understanding Webhooks

While hooks are powerful, they require you to manually handle HTTP requests and route them to the workflow. **Webhooks** solve this by providing a higher-level abstraction built on top of hooks that:

1. Automatically serializes the entire HTTP [`Request`](https://developer.mozilla.org/en-US/docs/Web/API/Request) object
2. Provides an automatically addressable `url` property pointing to the generated webhook endpoint
3. Handles sending HTTP [`Response`](https://developer.mozilla.org/en-US/docs/Web/API/Response) objects back to the caller

When using Workflow DevKit, webhooks are automatically wired up at `/.well-known/workflow/v1/webhook/:token` without any additional setup.

<Callout type="info">
  See the full API reference for [`createWebhook()`](/docs/api-reference/workflow/create-webhook) for all available options.
</Callout>

### Creating Your First Webhook

Here's a simple webhook that receives HTTP requests:

```typescript lineNumbers
import { createWebhook } from "workflow";

export async function webhookWorkflow() {
  "use workflow";

  const webhook = createWebhook();

  // The webhook is automatically available at this URL
  console.log("Send HTTP requests to:", webhook.url);
  // Example: https://your-app.com/.well-known/workflow/v1/webhook/lJHkuMdQ2FxSFTbUMU84k

  // Workflow pauses until an HTTP request is received
  const request = await webhook;

  console.log("Received request:", request.method, request.url);

  // Access the request body
  const data = await request.json();
  console.log("Data:", data);
}
```

The webhook will automatically respond with a `202 Accepted` status by default. External systems can simply make an HTTP request to the `webhook.url` to resume your workflow.

### Sending Custom Responses

Webhooks provide two ways to send custom HTTP responses: **static responses** and **dynamic responses**.

#### Static Responses

Use the `respondWith` option to provide a static response that will be sent automatically for every request:

```typescript lineNumbers
import { createWebhook } from "workflow";

export async function webhookWithStaticResponse() {
  "use workflow";

  const webhook = createWebhook({
    respondWith: new Response(
      JSON.stringify({ success: true, message: "Webhook received" }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }
    )
  });

  const request = await webhook;

  // The response was already sent automatically
  // Continue processing the request asynchronously
  const data = await request.json();
  await processData(data);
}

async function processData(data: any) {
  "use step";
  // Long-running processing here
}
```

#### Dynamic Responses (Manual Mode)

For dynamic responses based on the request content, set `respondWith: "manual"` and call the `respondWith()` method on the request:

```typescript lineNumbers
import { createWebhook, type RequestWithResponse } from "workflow";

async function sendCustomResponse(request: RequestWithResponse, message: string) {
  "use step";

  // Call respondWith() to send the response
  await request.respondWith(
    new Response(
      JSON.stringify({ message }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }
    )
  );
}

export async function webhookWithDynamicResponse() {
  "use workflow";

  // Set respondWith to "manual" to handle responses yourself
  const webhook = createWebhook({ respondWith: "manual" });

  const request = await webhook;
  const data = await request.json();

  // Decide what response to send based on the data
  if (data.type === "urgent") {
    await sendCustomResponse(request, "Processing urgently");
  } else {
    await sendCustomResponse(request, "Processing normally");
  }

  // Continue workflow...
}
```

<Callout type="warning">
  When using `respondWith: "manual"`, the `respondWith()` method **must** be called from within a step function due to serialization requirements. This requirement may be removed in the future.
</Callout>

### Handling Multiple Webhook Requests

Like hooks, webhooks support iteration:

```typescript lineNumbers
import { createWebhook, type RequestWithResponse } from "workflow";

async function respondToSlack(request: RequestWithResponse, text: string) {
  "use step";

  await request.respondWith(
    new Response(
      JSON.stringify({ response_type: "in_channel", text }),
      { headers: { "Content-Type": "application/json" } }
    )
  );
}

export async function slackCommandWorkflow(channelId: string) {
  "use workflow";

  const webhook = createWebhook({
    token: `slack_command:${channelId}`,
    respondWith: "manual"
  });

  console.log("Configure Slack command webhook:", webhook.url);

  for await (const request of webhook) {
    const formData = await request.formData();
    const command = formData.get("command");
    const text = formData.get("text");

    if (command === "/status") {
      await respondToSlack(request, "Checking status...");
      const status = await checkSystemStatus();
      await postToSlack(channelId, `Status: ${status}`);
    }

    if (text === "stop") {
      await respondToSlack(request, "Stopping workflow...");
      break;
    }
  }
}

async function checkSystemStatus() {
  "use step";
  return "All systems operational";
}

async function postToSlack(channelId: string, message: string) {
  "use step";
  // Post message to Slack
}
```

## Hooks vs. Webhooks: When to Use Each

| Feature               | Hooks                                                          | Webhooks                                                                                    |
| --------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| **Data Format**       | Arbitrary serializable data                                    | HTTP `Request` objects                                                                      |
| **URL**               | No automatic URL                                               | Automatic `webhook.url` property                                                            |
| **Response Handling** | N/A                                                            | Can send HTTP `Response` (static or dynamic)                                                |
| **Use Case**          | Custom integrations, type-safe payloads                        | HTTP webhooks, standard REST APIs                                                           |
| **Resuming**          | [`resumeHook()`](/docs/api-reference/workflow-api/resume-hook) | Automatic via HTTP, or [`resumeWebhook()`](/docs/api-reference/workflow-api/resume-webhook) |

**Use Hooks when:**

* You need full control over the payload structure
* You're integrating with custom event sources
* You want strong TypeScript typing with [`defineHook()`](/docs/api-reference/workflow/define-hook)

**Use Webhooks when:**

* You're receiving HTTP requests from external services
* You need to send HTTP responses back to the caller
* You want automatic URL routing without writing API handlers

## Advanced Patterns

### Type-Safe Hooks with `defineHook()`

The [`defineHook()`](/docs/api-reference/workflow/define-hook) helper provides type safety between creating and resuming hooks:

```typescript lineNumbers
import { defineHook } from "workflow";

// Define the hook type once
type ApprovalRequest = {
  requestId: string;
  approved: boolean;
  approvedBy: string;
  comment: string;
};

const approvalHook = defineHook<ApprovalRequest>();

// In your workflow
export async function documentApprovalWorkflow(documentId: string) {
  "use workflow";

  const hook = approvalHook.create({
    token: `approval:${documentId}`
  });

  const approval = await hook;

  console.log(`Document ${approval.requestId} ${approval.approved ? "approved" : "rejected"}`);
  console.log(`By: ${approval.approvedBy}, Comment: ${approval.comment}`);
}

// In your API route - TypeScript ensures the payload matches!
export async function POST(request: Request) {
  const { documentId, ...approvalData } = await request.json();

  // This is type-safe - TypeScript knows the exact shape required
  await approvalHook.resume(`approval:${documentId}`, approvalData);

  return new Response("OK");
}
```

This pattern is especially valuable in larger applications where the workflow and API code are in separate files.

## Best Practices

### Token Design

When using custom tokens:

* **Make them deterministic**: Base them on data the external system can reconstruct (like channel IDs, user IDs, etc.)
* **Use namespacing**: Prefix tokens to avoid conflicts (e.g., `slack:${channelId}`, `github:${repoId}`)
* **Include routing information**: Ensure the token contains enough information to identify the correct workflow instance

### Response Handling in Webhooks

* Use **static responses** (`respondWith: Response`) for simple acknowledgments
* Use **manual mode** (`respondWith: "manual"`) when responses depend on request processing
* Remember that `respondWith()` must be called from within a step function

### Iterating Over Events

Both hooks and webhooks support iteration, making them perfect for long-running event loops:

```typescript
const hook = createHook<Event>();

for await (const event of hook) {
  await processEvent(event);

  if (shouldStop(event)) {
    break;
  }
}
```

This pattern allows a single workflow instance to handle multiple events over time, maintaining state between events.

## Related Documentation

* [Serialization](/docs/foundations/serialization) - Understanding what data can be passed through hooks
* [`createHook()` API Reference](/docs/api-reference/workflow/create-hook)
* [`createWebhook()` API Reference](/docs/api-reference/workflow/create-webhook)
* [`defineHook()` API Reference](/docs/api-reference/workflow/define-hook)
* [`resumeHook()` API Reference](/docs/api-reference/workflow-api/resume-hook)
* [`resumeWebhook()` API Reference](/docs/api-reference/workflow-api/resume-webhook)
