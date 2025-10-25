# serialization-failed (/docs/errors/serialization-failed)

# `serialization-failed`

This error occurs when you try to pass non-serializable data between execution boundaries in your workflow. All data passed between workflow functions, step functions, and the workflow runtime must be serializable to persist in the event log.

***

## Error Message

```
Failed to serialize workflow arguments. Ensure you're passing serializable types
(plain objects, arrays, primitives, Date, RegExp, Map, Set).
```

This error can appear when:

* Serializing workflow arguments when calling `start()`
* Serializing workflow return values
* Serializing step arguments
* Serializing step return values

***

## Why This Happens

Workflows persist their state using an event log. Every value that crosses execution boundaries must be:

1. **Serialized** to be stored in the event log
2. **Deserialized** when the workflow resumes

Functions, class instances, symbols, and other non-serializable types cannot be properly reconstructed after serialization, which would break workflow replay.

***

## Common Causes

### Passing Functions

```typescript lineNumbers
// Error - functions cannot be serialized
export async function processWorkflow() {
  "use workflow";

  const callback = () => console.log('done'); // [!code highlight]
  await processStep(callback); // Error! // [!code highlight]
}
```

**Solution:** Pass data instead, then define the function logic in the step.

```typescript lineNumbers
// Fixed - pass configuration data instead
export async function processWorkflow() {
  "use workflow";

  await processStep({ shouldLog: true }); // [!code highlight]
}

async function processStep(config: { shouldLog: boolean }) {
  "use step";

  if (config.shouldLog) { // [!code highlight]
    console.log('done'); // [!code highlight]
  } // [!code highlight]
}
```

### Class Instances

```typescript lineNumbers
class User {
  constructor(public name: string) {}
  greet() { return `Hello ${this.name}`; }
}

// Error - class instances lose methods after serialization
export async function greetWorkflow() {
  "use workflow";

  await greetStep(new User('Alice')); // Error! // [!code highlight]
}
```

**Solution:** Pass plain objects and reconstruct the class in the step.

```typescript lineNumbers
class User {
  constructor(public name: string) {}
  greet() { return `Hello ${this.name}`; }
}

// Fixed - pass plain object, reconstruct in step
export async function greetWorkflow() {
  "use workflow";

  await greetStep({ name: 'Alice' }); // [!code highlight]
}

async function greetStep(userData: { name: string }) {
  "use step";

  const user = new User(userData.name); // [!code highlight]
  console.log(user.greet());
}
```

***

## Supported Serializable Types

Workflow DevKit supports these types across execution boundaries:

### Standard JSON Types

* `string`, `number`, `boolean`, `null`
* Arrays of serializable values
* Plain objects with serializable values

To learn more about supported types, see the [Serialization](/docs/foundations/serialization) section.

***

## Debugging Serialization Issues

To identify what's causing serialization to fail:

1. **Check the error stack trace** - it often shows which property failed
2. **Simplify your data** - temporarily pass smaller objects to isolate the issue
3. **Ensure you are using supported data types** - see the [Serialization](/docs/foundations/serialization) section for more details
