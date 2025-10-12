I want to build an agent progress architecture that shows workflow status as the workflows in Inngest functions run. Current architecture is very brittle and not the right one. First I want to start with the user experience and then I will provide some guidance on desired characteristics of the architecture.

# User Experience

## Workflow progress display

Users will be triggering workflows either through the UI or by sending a prompt. The Agent Progress area is a scrollable section that grows from top to bottom and scrolls as necessary. I.e. each time a new workflow is initiated, the workflow is added to the bottom of the prior workflow status display.

Here is the desired structure:

### Block Display

The header displays the following: (From left to right)

- Name of workflow (e.g. "Generating Full Video", "Generating Image", ..)
- A progressive stage # / total number of steps (e.g. 1/5 then progress to 2/5 etc.)
- Cancel button if the workflow is in progress (which pops up a modal to confirm cancellation and sends a cancel event to Inngress)
- If the workflow is completed or failed, the "Cancel" button turns into showing "Re-run". Use correct chevrons to the left of the buttons.
- A collapse/expand chevron that collapses or expands the block. Older blocks always default to collapsed and the current one defaults to expanded.

Examples:
Generating Full Video - 1/6 Steps <Cancel> <Expand/Collapse Chevron>
Generating Full Video - 2/6 Steps - Failed (in red) - <Rerun> <Expand/Collapse Chevron>

Inside this block then we show the steps as specified below. The steps grow from top to bottom like the overall workflow progress.

#### Step

The header displays the following: (From left to right)

- Step number/Total Steps
- Status summary of the step (E.g. Configuration Ready for Review)
- The collapse/expand chevron. The current step is always expanded. The older steps are collapsed by default.

The contents of each step shows progress messages (PM) & final confirmation. They grow from top to bottom, appended one after other as they are available.

- They are shown in bullet point format.
- The message depends on the type of step.
- The final confirmation could either be a success, a failure or "Human In the Loop" action.
- Human in the loop (HIL) actions show a block as such:
  - Usually a button that asks for user review. They may open up a modal dialog with a button to confirm or cancel.
- Once the user confirms the HIL block is replaced by a progress message (e.g. user confirmed the configuration). The buttons don't display anymore as it may confuse the user or system if clicked later on.

## Workflow Types

We have the following workflow types now but as the product is further developed, we will be adding more types, hence the extensibility and modularity is key.

Below I am describing the individual steps. I will describe both what needs to happen in the workflow and the progress messages (PM). These will be showed to the user as described above in bulleted form.

**IMPORTANT NOTE** The steps described here are not necessarily the Inngest "steps", these are conceptual steps to be shown to the user.

### Full Video Generation

We should try to ignore changing the backend, it has been iterated over and in mostly good condition and well refactored.

#### Step 1: Parse the prompt and confirm the configuration

- The prompt created by the user is passed in, an LLM parses the prompt and identifies configuration settings (such as prompt, style, .. basically anything related to the configuration settings)
  - PM: "Analyzing the input prompt"
- The structured candidate new configuration delta is created. The user is presented with a summary of the configuration options (that are parsed from input prompt). A button is presented in HIL block ("Review and Confirm Configuration").
  - When the user presses the button, the same contents of the Configuration tab is presented but in a modal dialog. The modal dialog shows the same UI as in the edit-configuration (Reuse the component). But the configuration is not yet saved to the database. It is a merging of what is parsed from the prompt and the defaults.
  - The modal dialog has 2 buttons at the bottom. Cancel and Confirm. The user can further edit the configuration and can hit confirm or just hit confirm. If confirmed the next steps will be performed in the worked. If cancelled, then the workflow stops, as progress message is displayed replacing the HIL block:
    - PM: "Workflow cancelled by user"
- Once the user confirms in the above, the HIL block is replaced by a progress message:
  - PM: "Configuration accepted, saving configuration"
- The new configuration is saved in the database (config column of video_lectures table and the prompt in the prompt column)
  - PM: "Configuration saved, proceeding to generation"

#### Step 2: Create the script

- The create-lecture-script function is called (Inngest) and the prompt and configuration are passed to start creating the script
  **IMPORTANT** Current prompt generation does not take into account all the relevant configuration such as duration, segment length and others. The prompt generation needs to be modified to include those as well as part of the prompt to the LLM. This should be thorough.
  - PM: "Starting to create the script"
- The LLM takes the generated prompt (as currently structured) and creates the script as a set of narrative segments. The number of segments will be created based on the configured duration and the . Currently I am using streaming, but it seems like it is slow and the reasoning messages are too detailed and unnecessary. So let's not stream anymore and not show reasoning messages.
- The script is completed or there is a failure.
  - If success, PM: "Successfully created the script"
  - If failure, PM: "Error creating script " -> Show the error message received from LLM provider.
- If failed the workflow stops

#### Step 3: Generate segment images

**IMPORTANT** Current prompt generation does not take into account all the relevant configuration such as duration, segment length and others. The prompt generation needs to be modified to include those as well as part of the prompt to the LLM. This should be thorough.

TODO: Here we are likely not using Inngest properly. Each generation call to the LLM (text or image) may fail. Inngest does have support for concurrency, retry etc. But our current approach is not using any of those. We will refactor this to make use of it at a later stage and at that point we may have more progress messages and better retry support.

- The generate-segment-images are run to first generate the prompts for the images and then to generate the images using those prompts.
  - PM: "Starting to generate images. X images will be generated per segment"
- The images are generated and ready to be saved
  - PM: "Images generated, starting to save them"
- The images are saved
  - PM: "Images are saved and ready"

#### Step 4: Generate narration audio

**IMPORTANT** Current prompt generation does not take into account all the relevant configuration such as duration, segment length and others. The prompt generation needs to be modified to include those as well as part of the prompt to the LLM. This should be thorough.

- The generate-narration function is run to generate the narrative audio for the individual segments.
  - PM: "Starting to generate narrative audio. X audio files will be generated"
- The audio is generated and saved
  - PM: "Audio files are generated and saved"

#### Step 5: Generate background score

**IMPORTANT** Current prompt generation does not take into account all the relevant configuration such as duration, segment length and others. The prompt generation needs to be modified to include those as well as part of the prompt to the LLM. This should be thorough.

- The generate-music function is run to generate the background audio. This is currently generated for the whole timeline.
  - PM: "Starting to generate background music."
- The audio is generated and saved
  - PM: "Background music is generated and saved"

#### Step 6: Generate timeline

- The generate-timeline function is called. This is basically assembles everything into a timeline and expected to finish rather quickly as it does not have any external call dependencies other than saving to database.
  - PM: Timeline is generated. Your video is ready to play"

At this point our workflow is complete. The video preview tab should open and the video and the timeline should show the generated content ready to play. We need to ensure there is no browser refresh is needed to show those to the user.

### Image Generation

This is a single image generation workflow. It is mainly triggered from Visuals tab when "Generate Image" button is tapped. It has 1 step

#### Step 1: Generate Image

- This takes the changed configuration (image prompt, model) and runs the regenerate-single-image function.
  - PM: Starting image generation
- Image generation is completed, now we need to ask the user confirmation to replace the image with the current one. We show a HIL block that has button "Review Image". This pops up the modal dialog to review the image. (same as now).
  - If the user accepts the image, the image is saved and replaced, the modal is closed the HIL is replaced by this message:
    -PM: "The image is now saved and will be used in video"
  - If the user cancels it, then the image is discarded. NOTE: We need to keep the old image so that it is not overridden. The current implementation is missing this!!
    - The HIL block is replaced with this message:
      - PM: "The image is not selected. You can try another generation"

### Narration Audio Generation

### Background Score Generation

The flow for the above is essentially the same as the Generate Image one, except relevant messages and popping up the right modals. And also we need to ensure the existing image is not deleted in case the user decides not to select the new one.

In all these make sure you are using cache busting (which is already implemented) to show the right files.

# Technical Implementation

- In this iteration we should mainly focus on the frontend user experience of this. The backend was refactored recently. But still it is not handling error cases correctly with Inngest functionality, but that will be another refactoring later.
- The key change here is that we need to make sure we are storing the workflow state correctly and with full fidelity in the workflow_runs table. Currently we rely on sending messages from Inngest Realtime but that is very flaky. What we instead should do is as follows:
  - I created a new "workflow_state" column in workflow runs. This is a JSONB column which should store the current state of the workflow as it progresses. This includes all the user messages to be displayed and other application metadata needed. We need to design a data structure for this. Everytime a significant state change happens we should update this here. The Inngest send messages should only notify that there is something changed, so the receiver can get notified and read what changed from the database.
  - When we refresh the browser the current state can be replayed because we stored it here. So this way whenever we get back to the browser, the browser UI is able to render the agent progress without relying on messages as they will be missed otherwise.
- The other change is in the UI components. Current refactoring has a lot of conditional statements rather than having different type of components for different types of workflows and workflow steps. I need a better proposal here.
- The design styles/themes have been cleaned up recently so any new refactoring of the UI should use those standards properly.
