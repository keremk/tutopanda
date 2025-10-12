**IMPORTANT**

- PLEASE DO NOT OVERLOOK THE UI CHANGES I ASKED FOR. THEY ARE SIGNIFICANT

# Overlooked parts:

1. Configuration Modal Integration

- Yes you are right, it is not how it works right now. You need to wrap it in a modal.

2. Prompt Configuration Context

- Yes, we can leave the prompt engineering to later. But we need to make sure that we are passing in the configuration context

3. Browser Refresh Without State Loss

- Absolutely that is why I am asking for a single source of truth of all the workflow state and progress messages in the database rather than sending them via realtime messages from Inngest. This is KEY!!!

4. Workflow Cancellation

- Actually let's leave cancellation to a later stage. It requires more understanding of Inngest cancellation as well. When a workflow is cancelled, we should still have it in history with user cancelled state. So it can be rerun later. But this is a bit too much for now so let's leave it and not have "Cancel" buttons for now.

5. Asset Preservation on Rejection

- I think we should keep the assets in memory until they are accepted by the user. Downside is they may lose the newly generated image if they navigate away etc. but it is ok. Simpler.
- Yes it should apply to all assets not just images.

6. Cache Busting

- If it is not implemented than it is a bug that should be fixed. Users don't want to see stale images from cache.

7. Streaming Removal Decision

- Yes we should remove streaming, it seems to be slowing down the generation. The generation finishes much faster on OpenAI logs than on my side.

8. Workflow Extensibility

- Yes key part of the new refactoring. The current system is too rigid and convoluted.
- Keep things simple though, a very simple plugin architecture is good enough. I will be the only one coding, so I just need to define a new type of Workflow etc. and drop that in my codebase as a file that is it. (mainly use more polymorphic )

# Questions for Clarification

1. Streaming: Keep or remove the LLM reasoning streaming in script generation?

- Remove

2. Prompt Enhancement Scope: Should improving prompt generation (to include duration, segment length, etc.) be part of this refactor or separate?

- No, as responded above

3. Configuration Modal: Should the HIL config review open the EXACT same component from the Configuration tab, or a simplified read-only view with edit capability?

- Yeah exact component but loaded with a merge of yet not persisted data until it is accepted and saved.

4. Asset Backup Strategy: For rejected images/audio, should we:
   - a) Store them temporarily in a separate location
   - b) Keep them in memory until acceptance
   - c) Store them with a temporary flag in the database

- Keep them in memory (b)

5. Error Handling: When an Inngest step fails, should:
   - a) The workflow stop immediately and show error
   - b) Show error but allow manual retry of that specific step
   - c) Auto-retry per Inngest's built-in retry logic

- We should use auto-retry but only a set amount of times. Currently it is retrying indefinitely or too long. Retry 3 times and then workflow stops and shows error.
- We should show progress messages to the user that it is retrying (Is this easy to do?)

6. Historical Workflow Display: How far back should we show workflow history? Last 10? Last 50? All workflows for a lecture?

- Let's cap it at last 10

7. Video Preview Tab Auto-Open: Your doc says:
   "The video preview tab should open and the video and the timeline should show the generated content ready to play"
8. Should this happen automatically, or should we show a notification with a button to open?

- It should happen automatically if it is the Full Video Generation workflow. For other workflows we should not change the tab at all. They are editing with a tab for those and stay there.
