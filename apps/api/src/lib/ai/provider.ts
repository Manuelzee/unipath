import type { AiConfig } from "./config";
import type { ProviderMessage } from "./prompts";

export class AiProviderError extends Error {
  constructor(readonly reason: "timeout" | "network" | "upstream" | "empty", readonly upstreamStatus?: number) {
    // The message never includes credentials, prompts or upstream bodies.
    super(`AI provider request failed (${reason}${upstreamStatus ? ` ${upstreamStatus}` : ""}).`);
  }
}

export interface Completion {
  text: string;
  model: string;
  promptTokens: number | null;
  completionTokens: number | null;
}

type ChatCompletionResponse = {
  model?: string;
  choices?: Array<{ message?: { content?: string | null } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
};

/** Calls an OpenAI-compatible Chat Completions endpoint from the server. */
export async function complete(config: AiConfig, messages: ProviderMessage[], maxTokens: number, userRef: string): Promise<Completion> {
  let response: Response;
  try {
    response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify({
        model: config.model,
        messages,
        temperature: 0.3,
        max_tokens: maxTokens,
        // An opaque, non-identifying reference that helps the provider detect abuse.
        user: userRef,
      }),
      signal: AbortSignal.timeout(config.timeoutMs),
    });
  } catch (error) {
    const name = (error as { name?: string })?.name;
    throw new AiProviderError(name === "TimeoutError" || name === "AbortError" ? "timeout" : "network");
  }
  if (!response.ok) {
    // Drain without reading the body into logs or responses.
    await response.body?.cancel().catch(() => undefined);
    throw new AiProviderError("upstream", response.status);
  }
  const data = (await response.json().catch(() => null)) as ChatCompletionResponse | null;
  const text = data?.choices?.[0]?.message?.content?.trim();
  if (!text) throw new AiProviderError("empty");
  return {
    text,
    model: data?.model || config.model,
    promptTokens: data?.usage?.prompt_tokens ?? null,
    completionTokens: data?.usage?.completion_tokens ?? null,
  };
}
