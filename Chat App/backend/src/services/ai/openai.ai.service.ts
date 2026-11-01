import { IAIService, AIChatMessage, AIResponseResult } from "./ai.interface";

export class OpenAIService implements IAIService {
  private apiKey: string;
  private model: string;

  constructor(apiKey?: string, model = "gpt-4o-mini") {
    this.apiKey = apiKey || process.env.OPENAI_API_KEY || "";
    this.model = model;
  }

  async generateResponse(
    prompt: string,
    history: AIChatMessage[] = []
  ): Promise<AIResponseResult> {
    if (!this.apiKey) {
      throw new Error("OPENAI_API_KEY is not configured on the server.");
    }

    const endpoint = "https://api.openai.com/v1/chat/completions";

    const messages: any[] = [
      {
        role: "system",
        content:
          "You are a helpful, professional AI assistant participating inside a group chat. Format answers nicely using Markdown. Use syntax-highlighted code blocks with language tags when answering coding questions.",
      },
    ];

    for (const msg of history.slice(-6)) {
      messages.push({
        role: msg.role === "assistant" ? "assistant" : "user",
        content: `${msg.name ? `[${msg.name}]: ` : ""}${msg.content}`,
      });
    }

    messages.push({
      role: "user",
      content: prompt,
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000); // 15 second timeout

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages,
          max_tokens: 1500,
          temperature: 0.7,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`OpenAI API error (Status ${response.status}): ${errorBody}`);
      }

      const data = (await response.json()) as any;
      const text =
        data?.choices?.[0]?.message?.content ||
        "I could not generate a response at this time.";

      return {
        content: text,
        usage: {
          promptTokens: data?.usage?.prompt_tokens,
          completionTokens: data?.usage?.completion_tokens,
        },
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
