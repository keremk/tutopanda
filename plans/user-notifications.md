# User Notifications and Diagnostics Logging
Currently our CLI is implementing a thin logger to do 2 things: Show progress to users and record and display diagnostic information. These are 2 separate concerns though.

Just like in a browser app, the users don't see the logs unless they explicitly open up the BrowserTools and look at console for logs, but in the app itself they see notifications, toasts etc. to show progress and errors, we want to build out a similar concept for our CLI. 

- User notifications are user friendly messages that aims to give progress updates to the user. They use human friendly language, give clear explanation. 
- Logging is intended for 2 audiences:
  - Developers of this codebase, to diagnose issues and fix them. 
  - AI agents who will use the CLI as a tool and require detailed, machine readable information.

Currently our CLI app mixes these two distinct cases. 

## User notifications
The core, provider, compositions packages will be used from the currently built CLI app and in the future a cloud based app. Therefore we need to have a design where the user notifications information can be provided in both cases and rendered using different UI: CLI will use ink, and the client app (in the future) will use React, Next.js 

We need to design a system that will serve both, cases but also not over-engineered.

## Diagnostic Logs
This will be consumed by an AI agent (from Claude Code, Codex, or custom agents) as a tool call. So the AI needs to be able read the output of the tool call, having ink (React) rendering will not work.

In the short term (with CLI app only), we want to keep our simple lightweight logger. We will later replace it with an industry strength logger library (or user Vercel etc). But we do not want to go into the code and make changes in each place we log. That's the intent of the simple logger we have today and we need to keep that. 

Also as we develop the app, it is crucial to keep the detailed logging to diagnose issues and ensure everything works fine. So logger serves that purpose as well.

## Questions
1) Propose a lightweight user notification system that we can use it in the CLI today and then hook it up to a cloud based environment without changing all places we send these logs from. So it should be extensible but not overengineered.
2) We need a way to run the CLI in 2 modes: UX mode and diagnostics/Agent mode. We currently have a verbose flag but probably we need to replace it with something robust that disables the UX mode and only generates logs (based on set logging level) and outputs them on the terminal stdout so the agents can read it and the developers can see it. We should probably replace --verbose with that new thing. 
3) How do we go about building UX (using Ink)? Starting something simple but extending more in the future?
4) Are there any changes necessary to existing logging that ensures that we can plug that into a robust logging library (Vercel etc) without having to change all the places we log from.

