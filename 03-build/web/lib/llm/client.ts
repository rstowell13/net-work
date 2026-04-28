/**
 * Minimal OpenRouter client (OpenAI-compatible chat-completions API).
 * Model is configurable via OPENROUTER_MODEL; default is DeepSeek V4.
 *
 * Throws `LLM_NOT_CONFIGURED` when OPENROUTER_API_KEY is missing so callers
 * can render a clear "configure your key" state instead of a 500.
 */
import "server-only";

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

export class LLMConfigError extends Error {
  constructor() {
    super("LLM_NOT_CONFIGURED");
    this.name = "LLMConfigError";
  }
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatCompletionResult {
  text: string;
  model: string;
}

export async function chat(
  messages: ChatMessage[],
  opts: { temperature?: number; maxTokens?: number } = {},
): Promise<ChatCompletionResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new LLMConfigError();
  const model = process.env.OPENROUTER_MODEL ?? "deepseek/deepseek-chat";

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://net.work",
      "X-Title": "net-work",
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: opts.temperature ?? 0.4,
      max_tokens: opts.maxTokens ?? 600,
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`openrouter_${res.status}: ${detail.slice(0, 200)}`);
  }
  const json = (await res.json()) as {
    choices: Array<{ message: { content: string } }>;
    model: string;
  };
  const text = json.choices?.[0]?.message?.content?.trim() ?? "";
  return { text, model: json.model ?? model };
}
