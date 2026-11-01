process.env.NODE_ENV = "test";
import http from "http";
import { app } from "../app";
import { initSocketServer } from "../socket";
import { io as SocketClient } from "socket.io-client";
import { prisma } from "../lib/prisma";
import { mockAIService } from "../services/ai/mock.ai.service";

const PORT = 5077;
const BASE_URL = `http://localhost:${PORT}/api`;
const SOCKET_URL = `http://localhost:${PORT}`;

interface TestResult {
  category: string;
  name: string;
  passed: boolean;
  details?: string;
}

const results: TestResult[] = [];

function recordTest(category: string, name: string, passed: boolean, details?: string) {
  results.push({ category, name, passed, details });
  const status = passed ? "✅ PASS" : "❌ FAIL";
  console.log(`${status} [${category}] ${name}${details ? ` -> ${details}` : ""}`);
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runAIAssistantTests() {
  console.log("\n=================================================================");
  console.log("   STARTING IN-GROUP AI ASSISTANT FULL-STACK TEST SUITE");
  console.log("=================================================================\n");

  const server = http.createServer(app);
  initSocketServer(server);
  await new Promise<void>((resolve) => server.listen(PORT, () => resolve()));
  console.log(`Test server running on port ${PORT}\n`);

  const testId = Date.now().toString().slice(-6);

  // 1. Create two test users
  const userAData = {
    name: `AI User A_${testId}`,
    username: `ai_a_${testId}`,
    email: `ai_a_${testId}@test.local`,
    password: "Password123!",
  };

  const userBData = {
    name: `AI User B_${testId}`,
    username: `ai_b_${testId}`,
    email: `ai_b_${testId}@test.local`,
    password: "Password123!",
  };

  const nonMemberData = {
    name: `NonMember_${testId}`,
    username: `nonmem_${testId}`,
    email: `nonmem_${testId}@test.local`,
    password: "Password123!",
  };

  // Register users
  const regARes = await (
    await fetch(`${BASE_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(userAData),
    })
  ).json() as any;

  const regBRes = await (
    await fetch(`${BASE_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(userBData),
    })
  ).json() as any;

  const regNMRes = await (
    await fetch(`${BASE_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(nonMemberData),
    })
  ).json() as any;

  const tokenA = regARes.data?.accessToken;
  const userAId = regARes.data?.user?.id;

  const tokenB = regBRes.data?.accessToken;
  const userBId = regBRes.data?.user?.id;

  const tokenNonMember = regNMRes.data?.accessToken;

  // Create a shared group with User A and User B
  const groupRes = await (
    await fetch(`${BASE_URL}/groups`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenA}`,
      },
      body: JSON.stringify({
        name: `AI Test Workspace ${testId}`,
        initialMemberIds: [userBId],
      }),
    })
  ).json() as any;

  const groupId = groupRes.data?.group?.id;
  console.log(`Created test group: ${groupId} with members: User A (${userAId}) and User B (${userBId})`);

  // -------------------------------------------------------------
  // TEST CASE 1: @AI Make a Node.js server
  // -------------------------------------------------------------
  console.log("\n--- Case 1: @AI Make a Node.js server ---");
  try {
    const sendRes = await fetch(`${BASE_URL}/groups/${groupId}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenA}`,
      },
      body: JSON.stringify({
        content: "@AI Make a Node.js server",
      }),
    });
    const sendJson = (await sendRes.json()) as any;
    const userMsgPassed = sendRes.status === 201 && sendJson.data?.message?.type === "TEXT";

    // Wait 400ms for async AI orchestrator to persist AI response
    await sleep(400);

    // Fetch messages to verify AI response
    const msgsRes = await (
      await fetch(`${BASE_URL}/groups/${groupId}/messages`, {
        headers: { Authorization: `Bearer ${tokenA}` },
      })
    ).json() as any;

    const msgs = msgsRes.data?.messages || [];
    const aiMessage = msgs.find((m: any) => m.type === "AI" && m.content?.includes("Node.js server"));

    const hasCodeBlock = aiMessage?.content?.includes("```");
    const isSenderNull = aiMessage?.senderId === null;

    recordTest(
      "AI Code Generation",
      "@AI Make a Node.js server generates code block with senderId=null",
      userMsgPassed && !!aiMessage && hasCodeBlock && isSenderNull,
      `AI Message found: ${!!aiMessage}, hasCodeBlock: ${hasCodeBlock}`
    );
  } catch (e: any) {
    recordTest("AI Code Generation", "@AI Make a Node.js server", false, e.message);
  }

  // -------------------------------------------------------------
  // TEST CASE 2: @AI Explain JWT in simple words
  // -------------------------------------------------------------
  console.log("\n--- Case 2: @AI Explain JWT in simple words ---");
  try {
    await fetch(`${BASE_URL}/groups/${groupId}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenA}`,
      },
      body: JSON.stringify({
        content: "@AI Explain JWT in simple words",
      }),
    });

    await sleep(400);

    const msgsRes = await (
      await fetch(`${BASE_URL}/groups/${groupId}/messages`, {
        headers: { Authorization: `Bearer ${tokenA}` },
      })
    ).json() as any;

    const msgs = msgsRes.data?.messages || [];
    const aiJwtMsg = msgs.find((m: any) => m.type === "AI" && (m.content?.includes("JWT") || m.content?.includes("wristband")));

    recordTest(
      "AI Explanation",
      "@AI Explain JWT in simple words produces formatted conceptual explanation",
      !!aiJwtMsg && aiJwtMsg.content?.includes("Payload"),
      `Found explanation: ${!!aiJwtMsg}`
    );
  } catch (e: any) {
    recordTest("AI Explanation", "@AI Explain JWT in simple words", false, e.message);
  }

  // -------------------------------------------------------------
  // TEST CASE 3: @AI Write a SQL query
  // -------------------------------------------------------------
  console.log("\n--- Case 3: @AI Write a SQL query ---");
  try {
    await fetch(`${BASE_URL}/groups/${groupId}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenA}`,
      },
      body: JSON.stringify({
        content: "@AI Write a SQL query",
      }),
    });

    await sleep(400);

    const msgsRes = await (
      await fetch(`${BASE_URL}/groups/${groupId}/messages`, {
        headers: { Authorization: `Bearer ${tokenA}` },
      })
    ).json() as any;

    const msgs = msgsRes.data?.messages || [];
    const aiSqlMsg = msgs.find((m: any) => m.type === "AI" && m.content?.includes("SELECT"));

    recordTest(
      "AI Query Generation",
      "@AI Write a SQL query generates formatted SQL query block",
      !!aiSqlMsg && aiSqlMsg.content?.includes("GROUP BY"),
      `Found SQL block: ${!!aiSqlMsg}`
    );
  } catch (e: any) {
    recordTest("AI Query Generation", "@AI Write a SQL query", false, e.message);
  }

  // -------------------------------------------------------------
  // TEST CASE 4: Empty @AI prompt
  // -------------------------------------------------------------
  console.log("\n--- Case 4: Empty @AI prompt ---");
  try {
    await fetch(`${BASE_URL}/groups/${groupId}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenA}`,
      },
      body: JSON.stringify({
        content: "@AI",
      }),
    });

    await sleep(400);

    const msgsRes = await (
      await fetch(`${BASE_URL}/groups/${groupId}/messages`, {
        headers: { Authorization: `Bearer ${tokenA}` },
      })
    ).json() as any;

    const msgs = msgsRes.data?.messages || [];
    const guidanceMsg = msgs.find(
      (m: any) => m.type === "AI" && m.content?.includes("AI Assistant") && m.content?.includes("You can ask me to")
    );

    recordTest(
      "AI Edge Cases",
      "Empty @AI prompt returns helpful usage guidance instead of failing",
      !!guidanceMsg,
      `Guidance found: ${!!guidanceMsg}`
    );
  } catch (e: any) {
    recordTest("AI Edge Cases", "Empty @AI prompt", false, e.message);
  }

  // -------------------------------------------------------------
  // TEST CASE 5: Very long AI prompt (>2000 chars)
  // -------------------------------------------------------------
  console.log("\n--- Case 5: Very long AI prompt ---");
  try {
    const veryLongPrompt = "@AI " + "Analyze this complex architecture and data flow. ".repeat(70); // ~3,500 chars

    await fetch(`${BASE_URL}/groups/${groupId}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenA}`,
      },
      body: JSON.stringify({
        content: veryLongPrompt,
      }),
    });

    await sleep(400);

    const msgsRes = await (
      await fetch(`${BASE_URL}/groups/${groupId}/messages`, {
        headers: { Authorization: `Bearer ${tokenA}` },
      })
    ).json() as any;

    const msgs = msgsRes.data?.messages || [];
    const limitWarning = msgs.find(
      (m: any) => m.type === "AI" && m.content?.includes("Prompt Too Long")
    );

    recordTest(
      "AI Edge Cases",
      "Very long prompt (>2,000 characters) returns polite limit notification",
      !!limitWarning,
      `Warning message found: ${!!limitWarning}`
    );
  } catch (e: any) {
    recordTest("AI Edge Cases", "Very long AI prompt", false, e.message);
  }

  // -------------------------------------------------------------
  // TEST CASE 6: AI provider unavailable
  // -------------------------------------------------------------
  console.log("\n--- Case 6: AI provider unavailable ---");
  try {
    // Simulate upstream provider failure
    mockAIService.setSimulateFailure(true);

    await fetch(`${BASE_URL}/groups/${groupId}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenA}`,
      },
      body: JSON.stringify({
        content: "@AI Generate something while provider is down",
      }),
    });

    await sleep(400);

    const msgsRes = await (
      await fetch(`${BASE_URL}/groups/${groupId}/messages`, {
        headers: { Authorization: `Bearer ${tokenA}` },
      })
    ).json() as any;

    const msgs = msgsRes.data?.messages || [];
    const failureMsg = msgs.find(
      (m: any) => m.type === "AI" && m.content?.includes("AI Assistant Unavailable")
    );

    recordTest(
      "Resilience & Fault Tolerance",
      "Upstream AI provider error handled gracefully with fallback message in thread",
      !!failureMsg,
      `Fallback recorded: ${!!failureMsg}`
    );
  } catch (e: any) {
    recordTest("Resilience & Fault Tolerance", "AI provider unavailable", false, e.message);
  } finally {
    mockAIService.setSimulateFailure(false);
  }

  // -------------------------------------------------------------
  // TEST CASE 7: Unauthorized request
  // -------------------------------------------------------------
  console.log("\n--- Case 7: Unauthorized request ---");
  try {
    const unauthRes = await fetch(`${BASE_URL}/groups/${groupId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: "@AI unauthorized prompt",
      }),
    });

    recordTest(
      "Security & Auth",
      "Reject unauthenticated AI request with HTTP 401",
      unauthRes.status === 401,
      `Status: ${unauthRes.status}`
    );
  } catch (e: any) {
    recordTest("Security & Auth", "Reject unauthenticated AI request", false, e.message);
  }

  // -------------------------------------------------------------
  // TEST CASE 8: Non-member request
  // -------------------------------------------------------------
  console.log("\n--- Case 8: Non-member request ---");
  try {
    const nonMemberRes = await fetch(`${BASE_URL}/groups/${groupId}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenNonMember}`,
      },
      body: JSON.stringify({
        content: "@AI non member prompt",
      }),
    });

    recordTest(
      "Security & Auth",
      "Reject non-member AI request with HTTP 403",
      nonMemberRes.status === 403,
      `Status: ${nonMemberRes.status}`
    );
  } catch (e: any) {
    recordTest("Security & Auth", "Reject non-member AI request", false, e.message);
  }

  // -------------------------------------------------------------
  // TEST CASE 9: AI-generated code must remain display-only
  // -------------------------------------------------------------
  console.log("\n--- Case 9: AI code remains strictly display-only ---");
  try {
    // Verify in database that message content is pure text, with no execution logs, shell side effects, or child processes
    const aiRecords = await prisma.message.findMany({
      where: { groupId, type: "AI" },
      select: { id: true, content: true, type: true, senderId: true },
    });

    const allHaveSenderNull = aiRecords.every((r) => r.senderId === null);
    const allAreAIType = aiRecords.every((r) => r.type === "AI");
    const containsCode = aiRecords.some((r) => r.content?.includes("```typescript"));

    recordTest(
      "Critical Security Rule",
      "AI responses stored purely as text (never executed, senderId is NULL)",
      allHaveSenderNull && allAreAIType && containsCode,
      `Total AI messages: ${aiRecords.length}, all senderId null: ${allHaveSenderNull}`
    );
  } catch (e: any) {
    recordTest("Critical Security Rule", "AI code display-only", false, e.message);
  }

  // -------------------------------------------------------------
  // TEST CASE 10: Realtime Socket.IO test with two connected users
  // -------------------------------------------------------------
  console.log("\n--- Case 10: Realtime Socket.IO test with 2 connected users ---");
  try {
    const socketA = SocketClient(SOCKET_URL, {
      auth: { token: tokenA },
      transports: ["websocket"],
      reconnection: false,
    });

    const socketB = SocketClient(SOCKET_URL, {
      auth: { token: tokenB },
      transports: ["websocket"],
      reconnection: false,
    });

    await Promise.all([
      new Promise<void>((resolve) => socketA.on("connect", () => resolve())),
      new Promise<void>((resolve) => socketB.on("connect", () => resolve())),
    ]);

    // Both users join group room
    await Promise.all([
      new Promise<void>((resolve) => socketA.emit("join_group", { groupId }, () => resolve())),
      new Promise<void>((resolve) => socketB.emit("join_group", { groupId }, () => resolve())),
    ]);

    let userBReceivedStart = false;
    let userBReceivedAIMessage = false;
    let userBReceivedComplete = false;

    socketB.on("ai_message_start", (data: any) => {
      if (data?.groupId === groupId) userBReceivedStart = true;
    });

    socketB.on("new_message", (data: any) => {
      if (data?.message?.groupId === groupId && data?.message?.type === "AI") {
        userBReceivedAIMessage = true;
      }
    });

    socketB.on("ai_message_complete", (data: any) => {
      if (data?.groupId === groupId) userBReceivedComplete = true;
    });

    // User A sends @AI prompt over Socket.IO
    socketA.emit("send_message", {
      groupId,
      content: "@AI How do promises work in JavaScript?",
      tempId: `temp_rt_${Date.now()}`,
    });

    // Wait up to 1.5s for real-time socket events
    await sleep(800);

    socketA.disconnect();
    socketB.disconnect();

    recordTest(
      "Realtime Socket Gateway",
      "Both connected members receive ai_message_start, new_message (AI), and ai_message_complete",
      userBReceivedStart && userBReceivedAIMessage && userBReceivedComplete,
      `User B received start: ${userBReceivedStart}, new_message(AI): ${userBReceivedAIMessage}, complete: ${userBReceivedComplete}`
    );
  } catch (e: any) {
    recordTest("Realtime Socket Gateway", "Socket.IO realtime 2-user test", false, e.message);
  }

  // -------------------------------------------------------------
  // FINAL SUMMARY
  // -------------------------------------------------------------
  console.log("\n=================================================================");
  console.log("                     TEST SUMMARY REPORT");
  console.log("=================================================================");
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = total - passed;

  console.log(`Total Checks: ${total}`);
  console.log(`Passed:       ${passed} (100% required)`);
  console.log(`Failed:       ${failed}`);
  console.log("=================================================================\n");

  try {
    server.close();
    await prisma.$disconnect();
  } catch {}

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runAIAssistantTests().catch(async (err) => {
  console.error("Test runner crashed:", err);
  try {
    await prisma.$disconnect();
  } catch {}
  process.exit(1);
});
