import { prisma } from "../../lib/prisma";
import { messageService } from "../message.service";
import { getAIService } from "./ai.factory";
import { AIChatMessage } from "./ai.interface";
import { aiRateLimiter } from "../../middlewares/rateLimit.middleware";
import { getIO } from "../../socket";

export class AIOrchestrator {
  /**
   * Check if a message text contains the @AI trigger
   */
  isAITrigger(content?: string | null): boolean {
    if (!content) return false;
    return /(?:^|\s)@AI(?:\b|\s|$)/i.test(content);
  }

  /**
   * Extract prompt text by stripping the @AI trigger
   */
  extractPrompt(content: string): string {
    return content.replace(/(?:^|\s)@AI(?:\b|\s|$)/gi, " ").trim();
  }

  /**
   * Handle AI assistant trigger in a group thread
   */
  async handleAITrigger(
    groupId: string,
    userId: string,
    rawContent: string,
    triggerMessageId?: string
  ): Promise<void> {
    let io: any = null;
    try {
      io = getIO();
    } catch {
      // Socket server may not be initialized in some isolated unit test environments
    }

    const room = `group:${groupId}`;

    // 1. Verify user membership in group
    const membership = await prisma.groupMember.findUnique({
      where: {
        groupId_userId: { groupId, userId },
      },
    });

    if (!membership) {
      console.warn(`[AI Orchestrator] Rejected AI request: User ${userId} is not a member of group ${groupId}`);
      return;
    }

    // 2. Extract and inspect prompt
    const prompt = this.extractPrompt(rawContent);

    // Case: Empty prompt (e.g. user just typed "@AI")
    if (!prompt) {
      const guidanceResponse = `👋 Hello! I am your group's built-in **AI Assistant**.

You can ask me to:
* **Write code**: \`@AI Make a Node.js server\`
* **Explain concepts**: \`@AI Explain JWT in simple words\`
* **Generate database queries**: \`@AI Write a SQL query\`
* **Debug snippets**: \`@AI Why is my async function hanging?\`

Simply type **\`@AI\`** followed by your question directly in the chat!`;

      const aiMessage = await messageService.createAIMessage(groupId, guidanceResponse);
      if (io) {
        io.to(room).to(groupId).emit("message:new", { ...aiMessage, message: aiMessage });
        io.to(room).to(groupId).emit("new_message", { message: aiMessage });
        io.to(room).to(groupId).emit("ai_message_complete", { groupId, message: aiMessage });
      }
      return;
    }

    // Case: Extremely long prompt (> 2,000 characters)
    if (prompt.length > 2000) {
      const warningResponse = `⚠️ **Prompt Too Long**: Your prompt exceeds the 2,000-character limit (${prompt.length} characters). Please shorten your request and try again.`;
      const aiMessage = await messageService.createAIMessage(groupId, warningResponse);
      if (io) {
        io.to(room).to(groupId).emit("message:new", { ...aiMessage, message: aiMessage });
        io.to(room).to(groupId).emit("new_message", { message: aiMessage });
        io.to(room).to(groupId).emit("ai_message_complete", { groupId, message: aiMessage });
      }
      return;
    }

    // 3. AI Rate Limiting
    const limitCheck = aiRateLimiter.checkAndConsume(groupId, userId);
    if (!limitCheck.allowed) {
      const rateLimitResponse = `⏳ **AI Rate Limit Exceeded**: ${
        limitCheck.reason || "Please wait before sending another AI prompt."
      }`;
      const aiMessage = await messageService.createAIMessage(groupId, rateLimitResponse);
      if (io) {
        io.to(room).to(groupId).emit("message:new", { ...aiMessage, message: aiMessage });
        io.to(room).to(groupId).emit("new_message", { message: aiMessage });
        io.to(room).to(groupId).emit("ai_message_complete", { groupId, message: aiMessage });
      }
      return;
    }

    // 4. Signal start of AI thinking in room
    if (io) {
      io.to(room).to(groupId).emit("ai_message_start", {
        groupId,
        triggerMessageId: triggerMessageId || "",
        timestamp: new Date().toISOString(),
      });
    }

    // 5. Gather minimum group context (last 5 messages, text/AI only, sanitized)
    const recentMessages = await prisma.message.findMany({
      where: {
        groupId,
        type: { in: ["TEXT", "AI"] },
      },
      orderBy: { createdAt: "desc" },
      take: 6,
      include: {
        sender: {
          select: { name: true, username: true },
        },
      },
    });

    // Reverse to chronological order and map to AIChatMessage
    const context: AIChatMessage[] = recentMessages.reverse().map((m) => ({
      role: m.type === "AI" ? "assistant" : "user",
      name: m.sender?.name || (m.type === "AI" ? "AI Assistant" : "Member"),
      content: m.content || "",
    }));

    // 6. Generate AI response with safety timeout and provider error handling
    try {
      const aiService = getAIService();
      const result = await aiService.generateResponse(prompt, context);

      // SECURITY GUARANTEE: Never evaluate or execute result.content. Save directly to DB as display-only text.
      const aiMessage = await messageService.createAIMessage(groupId, result.content, {
        usage: result.usage,
        codeBlocksCount: result.codeBlocksCount,
      });

      if (io) {
        io.to(room).to(groupId).emit("message:new", { ...aiMessage, message: aiMessage });
        io.to(room).to(groupId).emit("new_message", { message: aiMessage });
        io.to(room).to(groupId).emit("ai_message_complete", { groupId, message: aiMessage });
      }
    } catch (err: unknown) {
      console.error("[AI Orchestrator] Provider execution error:", err);
      const errorMsg =
        err instanceof Error
          ? err.message
          : "An unexpected error occurred while contacting the AI service.";

      if (io) {
        io.to(room).to(groupId).emit("ai_error", {
          groupId,
          message: "The AI Assistant is currently unavailable. Please try again shortly.",
        });
      }

      // Persist fallback error message so users aren't left with an unresolved question
      const fallbackAiMessage = await messageService.createAIMessage(
        groupId,
        `⚠️ **AI Assistant Unavailable**: Could not complete your request (${errorMsg}). Please try again later.`
      );

      if (io) {
        io.to(room).to(groupId).emit("message:new", { ...fallbackAiMessage, message: fallbackAiMessage });
        io.to(room).to(groupId).emit("new_message", { message: fallbackAiMessage });
        io.to(room).to(groupId).emit("ai_message_complete", { groupId, message: fallbackAiMessage });
      }
    }
  }
}

export const aiOrchestrator = new AIOrchestrator();
