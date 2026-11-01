export interface AIChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
  name?: string;
}

export interface AIResponseResult {
  content: string;
  codeBlocksCount?: number;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
  };
}

export interface IAIService {
  generateResponse(
    prompt: string,
    history?: AIChatMessage[]
  ): Promise<AIResponseResult>;
}
