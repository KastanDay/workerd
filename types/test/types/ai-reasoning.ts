// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

declare const ai: Ai;
const messages = [{ role: 'user' as const, content: 'Hello' }];

// Models already published (grandfathered) get closed reasoning effort unions:
// the efforts every model accepted before ("low" | "medium" | "high", plus
// "minimal" for Responses) and the model's supported efforts. They never reject
// a value that type-checked before, and widen only by what the model supports.
//
// New models get exact types from their schema and metadata.

type Equal<A, B> =
  (<X>() => X extends A ? 1 : 2) extends <X>() => X extends B ? 1 : 2
    ? true
    : false;
type ChatEffort<Model extends keyof AiModels> =
  AiModels[Model]['inputs'] extends infer Input
    ? Input extends { reasoning_effort?: infer Effort }
      ? Exclude<Effort, null | undefined>
      : never
    : never;
type ResponsesEffort<Model extends keyof AiModels> =
  AiModels[Model]['inputs'] extends infer Input
    ? Input extends { reasoning?: infer Options }
      ? // Skip XOR's Chat branch, whose `reasoning` is `never`.
        [NonNullable<Options>] extends [never]
        ? never
        : NonNullable<Options> extends { effort?: infer Effort }
          ? Exclude<Effort, null | undefined>
          : never
      : never
    : never;
type Legacy = 'low' | 'medium' | 'high';

// Models whose supported efforts go beyond the legacy efforts gain exactly those.
const glm52: Equal<
  ChatEffort<'@cf/zai-org/glm-5.2'>,
  Legacy | 'max' | 'none'
> = true;
const dsv4: Equal<
  ChatEffort<'@cf/deepseek-ai/deepseek-v4-flash-0731'>,
  Legacy | 'max' | 'none'
> = true;
// GLM-5.3 is new: exactly its supported efforts.
const glm53: Equal<
  ChatEffort<'@cf/zai-org/glm-5.3'>,
  'max' | 'high' | 'low'
> = true;
const kimi26: Equal<
  ChatEffort<'@cf/moonshotai/kimi-k2.6'>,
  Legacy | 'none'
> = true;
const qwen: Equal<ChatEffort<'@cf/qwen/qwen3.8-27b'>, Legacy | 'xhigh'> = true;
// Models whose efforts fit inside the legacy efforts keep exactly them.
const gptOssChat: Equal<ChatEffort<'@cf/openai/gpt-oss-20b'>, Legacy> = true;
const gptOssResponses: Equal<
  ResponsesEffort<'@cf/openai/gpt-oss-20b'>,
  'minimal' | Legacy
> = true;
const glm47: Equal<ChatEffort<'@cf/zai-org/glm-4.7-flash'>, Legacy> = true;
const gemma: Equal<ChatEffort<'@cf/google/gemma-4-26b-a4b-it'>, Legacy> = true;
const kimiCode: Equal<
  ChatEffort<'@cf/moonshotai/kimi-k2.7-code'>,
  Legacy
> = true;
// Nemotron publishes its own schema: no reasoning_effort, chat_template_kwargs
// reasoning controls instead (a one-time approved breaking change).
const nemotron: Equal<
  ChatEffort<'@cf/nvidia/nemotron-3-120b-a12b'>,
  never
> = true;
void [
  glm52,
  dsv4,
  glm53,
  kimi26,
  qwen,
  gptOssChat,
  gptOssResponses,
  glm47,
  gemma,
  kimiCode,
  nemotron,
];

// Supported efforts type-check.
void ai.run('@cf/zai-org/glm-5.2', { messages, reasoning_effort: 'max' });
void ai.run('@cf/zai-org/glm-5.2', { messages, reasoning_effort: 'none' });
void ai.run('@cf/qwen/qwen3.8-27b', { messages, reasoning_effort: 'xhigh' });
void ai.run('@cf/openai/gpt-oss-20b', {
  input: 'Hello',
  reasoning: { effort: 'low' },
});

// Legacy efforts still type-check for every model, supported or not.
void ai.run('@cf/qwen/qwen3.8-27b', { messages, reasoning_effort: 'high' });
void ai.run('@cf/zai-org/glm-4.7-flash', { messages, reasoning_effort: 'low' });
void ai.run('@cf/moonshotai/kimi-k2.7-code', {
  messages,
  reasoning_effort: 'medium',
});
void ai.run('@cf/google/gemma-4-26b-a4b-it', {
  messages,
  reasoning_effort: 'high',
});
void ai.run('@cf/zai-org/glm-5.2', { messages, reasoning_effort: null });
void ai.run('@cf/openai/gpt-oss-20b', {
  input: 'Hello',
  reasoning: { effort: 'minimal' },
});

// enable_thinking stays boolean for published models, even with mandatory reasoning.
void ai.run('@cf/moonshotai/kimi-k2.7-code', {
  messages,
  chat_template_kwargs: { enable_thinking: false },
});
void ai.run('@cf/openai/gpt-oss-20b', {
  messages,
  chat_template_kwargs: { enable_thinking: false },
});
void ai.run('@cf/zai-org/glm-4.7-flash', {
  messages,
  chat_template_kwargs: { enable_thinking: false, clear_thinking: false },
});

// Values typed with the shared types are accepted by every model.
declare const legacyEffort: Legacy;
declare const flag: boolean;
declare const chatInput: ChatCompletionsInput;
declare const responsesInput: ResponsesInput;
void ai.run('@cf/zai-org/glm-5.2', {
  messages,
  reasoning_effort: legacyEffort,
  chat_template_kwargs: { enable_thinking: flag },
});
void ai.run('@cf/qwen/qwen3.8-27b', chatInput);
void ai.run('@cf/moonshotai/kimi-k2.6', chatInput);
void ai.run('@cf/google/gemma-4-26b-a4b-it', chatInput);
void ai.run('@cf/openai/gpt-oss-120b', chatInput);
void ai.run('@cf/openai/gpt-oss-120b', responsesInput);
const sharedReasoning: Reasoning = { effort: 'high' };
const sharedOptions: ChatCompletionsCommonOptions = { reasoning_effort: 'low' };
const sharedKwargs: ChatTemplateKwargs = { enable_thinking: false };
void [sharedReasoning, sharedOptions, sharedKwargs];

// Other model-specific options are unaffected.
void ai.run('@cf/google/gemma-4-26b-a4b-it', {
  messages,
  skip_special_tokens: true,
  service_tier: 'priority',
});
void ai.run('@cf/openai/gpt-oss-20b', {
  input: 'Hello',
  service_tier: 'priority',
});

// The original Gemma class name remains available for existing code.
const legacyGemma: Base_Ai_Cf_Google_Gemma_4_26B_A4B_IT['inputs'] = {
  messages,
  reasoning_effort: 'low',
};
const gemmaInputs: AiModels['@cf/google/gemma-4-26b-a4b-it']['inputs'] =
  legacyGemma;
void gemmaInputs;

// Efforts a model does not support, and arbitrary strings, are rejected.
declare const anyEffort: string;
// @ts-expect-error: GPT-OSS does not support "max"
void ai.run('@cf/openai/gpt-oss-20b', { messages, reasoning_effort: 'max' });
// @ts-expect-error: GLM-5.3 reasoning cannot be turned off
void ai.run('@cf/zai-org/glm-5.3', { messages, reasoning_effort: 'none' });
// @ts-expect-error: aliases are documented, not typed
void ai.run('@cf/zai-org/glm-5.2', { messages, reasoning_effort: 'xhigh' });
// @ts-expect-error: toggle-only models gain no efforts
void ai.run('@cf/google/gemma-4-26b-a4b-it', {
  messages,
  reasoning_effort: 'none',
});
// @ts-expect-error: unknown efforts are rejected
void ai.run('@cf/zai-org/glm-5.2', { messages, reasoning_effort: 'turbo' });
// @ts-expect-error: arbitrary strings are rejected
void ai.run('@cf/zai-org/glm-5.2', { messages, reasoning_effort: anyEffort });
// @ts-expect-error: Responses efforts are closed too
void ai.run('@cf/openai/gpt-oss-20b', {
  input: 'Hello',
  reasoning: { effort: 'none' },
});
// @ts-expect-error: the shared type stays closed
const sharedMax: ChatCompletionsCommonOptions = { reasoning_effort: 'max' };
void sharedMax;

// New models: mandatory reasoning cannot be turned off.
void ai.run('@cf/zai-org/glm-5.3', {
  messages,
  chat_template_kwargs: { enable_thinking: true },
});
// @ts-expect-error: GLM-5.3 is new and its reasoning is mandatory
void ai.run('@cf/zai-org/glm-5.3', {
  messages,
  chat_template_kwargs: { enable_thinking: false },
});
// @ts-expect-error: GLM-5.3 is new: legacy efforts it does not support are rejected
void ai.run('@cf/zai-org/glm-5.3', { messages, reasoning_effort: 'medium' });

// Nemotron uses its own chat_template_kwargs reasoning controls.
void ai.run('@cf/nvidia/nemotron-3-120b-a12b', {
  messages,
  chat_template_kwargs: { enable_thinking: true, low_effort: true },
});
// @ts-expect-error: Nemotron has no top-level reasoning_effort
void ai.run('@cf/nvidia/nemotron-3-120b-a12b', {
  messages,
  reasoning_effort: 'low',
});

// New models are added and models no longer offered are removed.
const speech: keyof AiModels = '@cf/nvidia/nemotron-speech-streaming-en-0.6b';
// @ts-expect-error: stable-diffusion-v1-5-img2img is no longer offered
const img2img: keyof AiModels = '@cf/runwayml/stable-diffusion-v1-5-img2img';
void [speech, img2img];

// Types still reject values of the wrong kind.
// @ts-expect-error: efforts are strings
void ai.run('@cf/zai-org/glm-5.2', { messages, reasoning_effort: 1 });
// @ts-expect-error: enable_thinking is a boolean
void ai.run('@cf/moonshotai/kimi-k2.7-code', {
  messages,
  chat_template_kwargs: { enable_thinking: 'no' },
});
// @ts-expect-error: Responses and Chat Completions inputs are mutually exclusive
void ai.run('@cf/openai/gpt-oss-20b', { input: 'Hello', messages });
