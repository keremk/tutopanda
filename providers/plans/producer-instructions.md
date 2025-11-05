Now we need to add the music producers. The models we are using are documented in @providers/docs/AI-SDKs/replicate.md document
  along with the Replicate SDK and how to use the client. The custom_attributes that will be provided by default from the CLI to the
  provider API can be seen here: @cli/src/lib/provider-settings.ts. The provider documentations are
  @providers/docs/extensibility.md @providers/docs/provider-api.md and @providers/docs/provider-architecture.md. You should also
  take a look at the existing implementation for the audio producers @providers/src/producers/audio/ and follow the same pattern of
  using the reusable SDK components and composing the implementation using those. The unit tests live in the same folder and the
  integration tests live in @providers/tests/integration/ IMPORTANT: Integration tests are very expensive NEVER RUN THEM without my
  consent. Now go ahead prepare a plan. If there is anything missing in your understanding ask me