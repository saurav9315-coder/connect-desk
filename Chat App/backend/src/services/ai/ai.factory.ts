import { IAIService } from "./ai.interface";
import { MockAIService, mockAIService } from "./mock.ai.service";
import { GeminiAIService } from "./gemini.ai.service";
import { OpenAIService } from "./openai.ai.service";

let activeAIService: IAIService | null = null;

export function getAIService(): IAIService {
  if (activeAIService) {
    return activeAIService;
  }

  const provider = (process.env.AI_PROVIDER || "mock").toLowerCase();

  switch (provider) {
    case "gemini":
      if (process.env.GEMINI_API_KEY) {
        activeAIService = new GeminiAIService();
      } else {
        console.warn("⚠️ GEMINI_API_KEY is not set. Falling back to MockAIService.");
        activeAIService = mockAIService;
      }
      break;

    case "openai":
      if (process.env.OPENAI_API_KEY) {
        activeAIService = new OpenAIService();
      } else {
        console.warn("⚠️ OPENAI_API_KEY is not set. Falling back to MockAIService.");
        activeAIService = mockAIService;
      }
      break;

    case "mock":
    default:
      activeAIService = mockAIService;
      break;
  }

  return activeAIService;
}

export function setAIServiceForTesting(service: IAIService | null) {
  activeAIService = service;
}
