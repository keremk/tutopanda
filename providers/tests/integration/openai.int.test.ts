import { describe, expect, it } from 'vitest';
import { createOpenAiLlmHandler } from '../../src/producers/llm/openai.js';
import type { ProviderJobContext } from '../../src/types.js';

const describeIfKey = process.env.OPENAI_API_KEY ? describe : describe.skip;

describeIfKey('OpenAI integration', () => {
  it('executes live Responses API and returns artefacts', async () => {
    const handler = createOpenAiLlmHandler()({
      descriptor: {
        provider: 'openai',
        model: 'gpt-4.1-mini',
        environment: 'local',
      },
      mode: 'live',
      secretResolver: {
        async getSecret(key) {
          return key === 'OPENAI_API_KEY' ? process.env.OPENAI_API_KEY ?? null : null;
        },
      },
      logger: undefined,
    });

    await handler.warmStart?.({ logger: undefined });

    const request: ProviderJobContext = {
      jobId: 'job-int-openai',
      provider: 'openai',
      model: 'gpt-4.1-mini',
      revision: 'rev-int',
      layerIndex: 0,
      attempt: 1,
      inputs: [],
      produces: ['Artifact:NarrationScript'],
      context: {
        providerConfig: {
          systemPrompt: 'You are a concise assistant. Summarize the topic provided by the user.',
          userPrompt: 'Topic: {{topic}}',
          variables: {
            topic: 'topic',
          },
          responseFormat: { type: 'text' },
          artefactMapping: [
            {
              artefactId: 'Artifact:NarrationScript',
              output: 'inline',
            },
          ],
        },
        rawAttachments: [],
        environment: 'local',
        observability: undefined,
        extras: {
          resolvedInputs: {
            topic: 'the Northern Lights in winter',
          },
        },
      },
    };

    const result = await handler.invoke(request);
    console.log('OpenAI integration test result:', JSON.stringify(result));
    expect(result.status).toBe('succeeded');
    const artefact = result.artefacts[0];
    expect(artefact).toBeDefined();
    expect(artefact?.inline).toContain('Northern');
  });
});
