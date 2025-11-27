# Changes to Blueprints 
I am proposing new changes to the format of the blueprints. 

## Challenges & Goals:
- Currently we have some of the critical inputs declared in the blueprint YAML files. This means that when we change these inputs we can not do an incremental edit flow. E.g. changing models require changing the blueprint YAML file. Likewise changing any of the model configuration also requires changing the blueprint file.
- The producer inputs, artifacts and models are defined in a "generator" file. This creates confusion of naming and also these definitions should actually be part of the producer definitions.
- The naming is confusing. We need better and clear guidelines.
- We don't have any formal declaration of the input schemas accepted by Media and LLM model providers. Therefore there is no discoverability of what can be changed other than reading some docs, nor there is any validation of what are acceptable values. This may cause unnecessary calling the model provider APIs and then getting error back. We should detect and validate them earlier. 

## New Producer YAML files
- We are removing the adhoc blueprint YAML files (e.g. `audio-generator.yaml`) and introducing a better defined producer YAML files. (`cli/config/blueprints/modules/producers/audio.yaml`)
- In the current implementation, there is a lot of boilerplate that can be avoided and therefore we are removing them:
    - `connections` are not need for the producer configuration as they can easily be inferred. (i.e. connect all inputs to the producer and connect producer to all artifacts --- outputs)
    - `producers` is unnecessary as the full file is about describing one producer. `name` and `id` of the producer is declared in one place in the `meta` section.
- Currently only one model is connected to the producer. In this proposal `models` is an array of provider/model definitions. User is in charge of declaring which model to use for a given run in the `inputs.yaml` file.
- `jsonSchema` was an ambigous term. I.e. is it for input or output? So we changed the names to `inputSchema` and `outputSchema`
- `sdkMapping` was not a good term. We instead name it to `inputs` and make it a 1:1 mapping between the inputs declared in the YAML and the corresponding field name that the producer code will need when crafting the request for the external model/provider SDK.
    - `inputSchema` points to a JSON schema (obtained from the model/provider SDK) so inputs can be validated before calling the API. Also in dry-run this can be validated, so users can be sure that things are configured properly. See the Input Mapping section below on how that should work.
- `outputs`: Each model can define their outputs here. This is unchanged from the previous one, but only now is declared per model.

### Input JSON Schema Files


### Prompt TOML Files


### Input Mapping
Before calling the provider/model APIs in the producer implementation, we need to collect all the inputs and ensure they are mapped to what the SDK is expecting (as enforced by the inputSchema)

Inputs come from 2 sources:
- *Input Nodes*: Declared as part of the Producer YAML in the `inputs` section. These are generally intended to be connected to other nodes in the graph, therefore they are declared as nodes.
    - These are explicitly mapped to the API expected SDK names in the `models`->`inputs` section in the YAML file
- *Config Properties*: Non-node configuration parameters expected by the model/provider SDK. 

The input JSON schema of the producer defines the complete list of acceptable inputs for the model/provider API call. This is a superset of all the inputs.
    - So it is combination of *Input Nodes* + *Config Properties*
    - At any time, producer YAML file may decide to declare one of these *config properties* as an *input node*, if there is a need to connect it to other nodes.  
    - In the `inputs.yaml` the *config properties* can be referred using their SDK names directly.
    - If they apply to all producer instances and don't need to be configured per run, they can also declared in `config` section under the `models` definition again using their SDK names.
    - The JSON schema defines default values, so if no user or producer provided value is present, then the default value is used.

When producers are called, they should be provided with JSON input schema for validation. Producers will also be needing a consolidated internal JSON representation for the instances. Then they can validate the instance with the schema. To create the instance JSON:
- *Input Nodes*: names are mapped from their canonical Input ID names using the mapping provided producer YAML. (`models`->`inputs` section). Their values are located using the Canonical ID look up from the manifest in the `builds` folder. If it is coming from an artifact, the resolved value (extracted from the corresponding BLOB)is the value to be used. If it is a direct user input, similar lookup happens again from the data in the `builds` folder.
    - So discover what SDK API call expects using the mapping.
    - Find the value by the Canonical ID lookup from manifests.
- *Config Properties*: for these there is no mapping needed. The values will be available in the SDK expected naming. But we need to ensure that they participated in the overall iterative edit flow. I.e. if a user changes a config value for a model, the nodes and their downstream dependencies need to rerun (the planner needs to plan them for running). Currently this does not happen. So we need to automap to inputs with canonical input ids --- same name as their sdk name: (e.g. for a video model, camera_fixed property is represented as Input:camera_fixed and represented in the manifest as such)
  - If an config property is mentioned in the inputs.yaml or in the producer yaml, then it should be treated as an input with canonical IDs in the manifest and the dirty calculation etc. should be taken into account in the planner to plan for the new run when changes happen.

All of the above creates an internal JSON representation and gets validated against acceptable input types and values.



