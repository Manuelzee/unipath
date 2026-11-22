/**
 * AI provider configuration. Credentials are read on the server only and are
 * never returned to browsers, logged, or included in error messages.
 */
export interface AiConfig {
  apiKey: string;
  model: string;
  baseUrl: string;
  timeoutMs: number;
}

const DEFAULT_MODEL = "gpt-4o-mini";
const DEFAULT_BASE_URL = "https://api.openai.com/v1";

export function aiConfig(): AiConfig | null {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;
  const model = process.env.OPENAI_MODEL?.trim() || DEFAULT_MODEL;
  let baseUrl = DEFAULT_BASE_URL;
  const configured = process.env.OPENAI_BASE_URL?.trim();
  if (configured) {
    try {
      const url = new URL(configured);
      // Credentials must only ever travel over HTTPS.
      if (url.protocol === "https:" && !url.username && !url.password) baseUrl = url.href.replace(/\/$/, "");
    } catch { /* Invalid configuration falls back to the default endpoint. */ }
  }
  const timeout = Number(process.env.OPENAI_TIMEOUT_MS);
  return { apiKey, model, baseUrl, timeoutMs: Number.isInteger(timeout) && timeout >= 5_000 && timeout <= 120_000 ? timeout : 45_000 };
}

export const AI_PROVIDER_NAME = "OpenAI";

export const AI_DISCLAIMER =
  "AI-generated guidance. It can be wrong, is not an admission decision, and does not replace official university guidance. Verify requirements, costs and deadlines on each institution's official pages before acting.";
