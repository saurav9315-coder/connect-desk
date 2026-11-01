import { IAIService, AIChatMessage, AIResponseResult } from "./ai.interface";

export class GeminiAIService implements IAIService {
  private apiKey: string;
  private model: string;

  constructor(apiKey?: string, model = "gemini-1.5-flash") {
    this.apiKey = apiKey || process.env.GEMINI_API_KEY || "";
    this.model = model;
  }

  async generateResponse(
    prompt: string,
    history: AIChatMessage[] = []
  ): Promise<AIResponseResult> {
    if (!this.apiKey) {
      throw new Error("GEMINI_API_KEY is not configured on the server.");
    }

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;

    // Format chat history into Gemini contents structure
    const contents: any[] = [];

    // System instruction or initial context
    contents.push({
      role: "user",
      parts: [
        {
          text: "System instruction: You are a friendly, highly capable AI assistant inside a group chat application. Keep responses helpful, accurate, well-formatted in Markdown, and use code blocks with language tags when showing code. Never produce harmful instructions.",
        },
      ],
    });
    contents.push({
      role: "model",
      parts: [{ text: "Understood. I will participate helpfully in the group chat." }],
    });

    for (const msg of history.slice(-6)) {
      contents.push({
        role: msg.role === "assistant" ? "model" : "user",
        parts: [{ text: `${msg.name ? `[${msg.name}]: ` : ""}${msg.content}` }],
      });
    }

    contents.push({
      role: "user",
      parts: [{ text: prompt }],
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000); // 15 second timeout

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents,
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 1500,
          },
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Gemini API error (Status ${response.status}): ${errorBody}`);
      }

      const data = (await response.json()) as any;
      const text =
        data?.candidates?.[0]?.content?.parts?.[0]?.text ||
        "I could not generate a response at this time.";

      return {
        content: text,
        usage: {
          promptTokens: data?.usageMetadata?.promptTokenCount,
          completionTokens: data?.usageMetadata?.candidatesTokenCount,
        },
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
