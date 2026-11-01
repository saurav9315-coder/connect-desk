import { IAIService, AIChatMessage, AIResponseResult } from "./ai.interface";

export class MockAIService implements IAIService {
  private simulateFailure = false;

  public setSimulateFailure(fail: boolean) {
    this.simulateFailure = fail;
  }

  async generateResponse(
    prompt: string,
    _history: AIChatMessage[] = []
  ): Promise<AIResponseResult> {
    if (this.simulateFailure) {
      throw new Error("AI provider upstream error: Service temporarily unavailable (503)");
    }

    const normalized = prompt.trim().toLowerCase();

    // 1. Make a Node.js server
    if (normalized.includes("node.js server") || normalized.includes("node server") || normalized.includes("express server")) {
      const content = `Here is a modern, production-ready Node.js server using Express and TypeScript:

\`\`\`typescript
import express, { Request, Response } from "express";

const app = express();
const PORT = process.env.PORT || 3000;

// Built-in JSON body parser
app.use(express.json());

// Health check endpoint
app.get("/health", (req: Request, res: Response) => {
  res.status(200).json({ status: "healthy", timestamp: new Date().toISOString() });
});

// Sample API route
app.get("/api/hello", (req: Request, res: Response) => {
  res.json({ message: "Hello from Node.js server!" });
});

// Start listening for incoming connections
app.listen(PORT, () => {
  console.log(\`Server is running on http://localhost:\${PORT}\`);
});
\`\`\`

### Key Features:
1. **Type Safety**: Full TypeScript annotations for requests and responses.
2. **Standard Middleware**: Uses native JSON body parsing.
3. **Health Check**: Operational endpoint \`/health\` for container or uptime monitoring.`;

      return {
        content,
        codeBlocksCount: 1,
        usage: { promptTokens: 15, completionTokens: 120 },
      };
    }

    // 2. Explain JWT in simple words
    if (normalized.includes("jwt") || (normalized.includes("json web token") && normalized.includes("simple"))) {
      const content = `### What is a JWT (JSON Web Token)?

Think of a **JWT** like a **digital concert wristband**:
* When you show your ticket at the entrance (logging in with email & password), security checks it once.
* Instead of checking your ID every time you buy a drink or re-enter, they give you a stamped, tamper-proof wristband (the **JWT**).
* Whenever you enter VIP or order food, guards just look at your wristband to verify you are allowed.

---

### The 3 Parts of a JWT
A JWT is made of three parts separated by dots (\`.\`): \`header.payload.signature\`

1. **Header**: Describes the token type and encryption algorithm (e.g. \`HS256\`).
2. **Payload**: The user data (e.g., \`userId\`, \`username\`, and \`expiresAt\`). Anyone can read this, so **never put passwords in here**.
3. **Signature**: Created by combining the header, payload, and a secret key known **only to the server**. If someone tampers with the data, the signature breaks!

\`\`\`json
{
  "sub": "usr_12345",
  "name": "Alex Rivera",
  "role": "admin",
  "iat": 1516239022
}
\`\`\`

**In summary:** JWTs allow the client to prove who they are on every request without the server having to look up a session in the database each time!`;

      return {
        content,
        codeBlocksCount: 1,
        usage: { promptTokens: 12, completionTokens: 160 },
      };
    }

    // 3. Write a SQL query
    if (normalized.includes("sql") || normalized.includes("query") || normalized.includes("select")) {
      const content = `Here is an optimized SQL query demonstrating aggregation, filtering, and table joins:

\`\`\`sql
-- Retrieve top active users and their total message count in the last 30 days
SELECT 
    u.id AS user_id,
    u.username,
    u.email,
    COUNT(m.id) AS total_messages,
    MAX(m.created_at) AS last_active_at
FROM users u
INNER JOIN messages m ON m.sender_id = u.id
WHERE m.created_at >= NOW() - INTERVAL 30 DAY
GROUP BY u.id, u.username, u.email
HAVING COUNT(m.id) > 5
ORDER BY total_messages DESC
LIMIT 10;
\`\`\`

### Explanation:
* **INNER JOIN**: Matches only users who have sent messages.
* **WHERE**: Filters messages created within the last 30 days before grouping.
* **GROUP BY**: Groups rows by user identifiers for accurate aggregation.
* **HAVING**: Filters aggregated groups (only users with more than 5 messages).
* **INDEXING TIP**: Ensure composite indexes exist on \`messages(sender_id, created_at)\` for fast performance.`;

      return {
        content,
        codeBlocksCount: 1,
        usage: { promptTokens: 10, completionTokens: 110 },
      };
    }

    // 4. Default general prompt response
    const content = `Hello! I received your request:

> "${prompt}"

Here is what you need to know:

\`\`\`javascript
// Example solution
function solveProblem() {
  console.log("Analyzing group request: ${prompt.replace(/"/g, '\\"')}");
  return { status: "success", resolved: true };
}
\`\`\`

If you would like me to refine this further or adapt it to a specific framework, let me know!`;

    return {
      content,
      codeBlocksCount: 1,
      usage: { promptTokens: prompt.length / 4, completionTokens: 80 },
    };
  }
}

export const mockAIService = new MockAIService();
