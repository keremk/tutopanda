# Provider API
The providers package are designed to be used by the CLI client or the Server/Cloud client to figure out what provider and model to run for each producer task. 

## Variants in Catalog
- The clients need to be able to specify which variant (provider, model, environment) triple are the primary task runner to generate the artefacts
    - *environment*: This has values local | cloud. Sometimes we may need to run different implementations of the model provider APIs (like Replicate APIs etc.) depending on if we are running in the cloud or locally. 
- The client can also specify fallback (provider, model, environment) for a task runner, in case the provider fails (could be due to rate-limiting, insufficient funds etc.)
- The internal `catalog.ts` file, keeps a mapping of (provider, model, environment) pairs to the actual implementing functions. 

> Currently it is using the producer names (ScriptProducer) which is not correct, as the same implementing functions can be used in different producers. And also providers package should not have knowledge of producers for good separation of concerns. 

## Exposed API to Clients
- The users in the CLI client will be able to specify, which (provider, model) tuple they want for which producer. (e.g. ScriptProducer -> (openAI, "openai/gpt5")). The CLI client will tack on the third parameter (provider, model, environment="local"), and the providers package returns the correct functions to call.
    - This can be bulk access (one call returns all as a list) or can be done on a single pair (in case of editing for example like changing one of the producer's model to something else)
    