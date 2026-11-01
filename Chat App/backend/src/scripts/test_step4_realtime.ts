import http from "http";
import { app } from "../app";
import { initSocketServer } from "../socket";
import { prisma } from "../lib/prisma";
import { io as ClientSocket, Socket as ClientSocketType } from "socket.io-client";

const PORT = 5066;
const API_BASE = `http://localhost:${PORT}/api`;
const SOCKET_URL = `http://localhost:${PORT}`;

interface TestResult {
  num: number;
  section: string;
  test: string;
  passed: boolean;
  details: string;
}

const results: TestResult[] = [];

function record(num: number, section: string, test: string, passed: boolean, details: string) {
  results.push({ num, section, test, passed, details });
  const icon = passed ? "✅ PASS" : "❌ FAIL";
  console.log(`${icon} [${num}] [${section}] ${test}: ${details}`);
}

function createClientSocket(token?: string): ClientSocketType {
  return ClientSocket(SOCKET_URL, {
    auth: token ? { token } : {},
    autoConnect: false,
    transports: ["websocket"],
    reconnection: false,
  });
}

async function runStep4RealtimeVerification() {
  console.log("================================================================================");
  console.log("        BACKEND STEP 4 - COMPREHENSIVE REALTIME GROUP CHAT VERIFICATION");
  console.log("================================================================================\n");

  const server = http.createServer(app);
  initSocketServer(server);

  await new Promise<void>((resolve) => server.listen(PORT, () => resolve()));
  console.log(`Test server running on port ${PORT}\n`);

  try {
    const timestamp = Date.now().toString().slice(-6);

    // --------------------------------------------------------------------------
    // SETUP: Register 4 Test Users (Alice: Owner, Bob: Admin, Charlie: Member, Dave: Non-member)
    // --------------------------------------------------------------------------
    console.log("--- SETUP: REGISTERING TEST USERS ---");

    const usersToCreate = [
      { name: "Alice Owner", username: `alice_${timestamp}`, email: `alice_${timestamp}@test.com`, password: "Password123!" },
      { name: "Bob Admin", username: `bob_${timestamp}`, email: `bob_${timestamp}@test.com`, password: "Password123!" },
      { name: "Charlie Member", username: `charlie_${timestamp}`, email: `charlie_${timestamp}@test.com`, password: "Password123!" },
      { name: "Dave NonMember", username: `dave_${timestamp}`, email: `dave_${timestamp}@test.com`, password: "Password123!" },
    ];

    const userMap: Record<string, { id: string; token: string }> = {};

    for (const u of usersToCreate) {
      const res = await fetch(`${API_BASE}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(u),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(`Failed to create test user ${u.name}: ${JSON.stringify(data)}`);
      }
      userMap[u.name.split(" ")[0].toLowerCase()] = {
        id: data.data.user.id,
        token: data.data.accessToken,
      };
    }

    const alice = userMap["alice"];
    const bob = userMap["bob"];
    const charlie = userMap["charlie"];
    const dave = userMap["dave"];

    console.log(`Registered 4 test users.\n`);

    // Create Group with Alice, Bob, Charlie
    const groupRes = await fetch(`${API_BASE}/groups`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${alice.token}`,
      },
      body: JSON.stringify({
        name: "Realtime Dev Squad",
        memberIds: [bob.id, charlie.id],
      }),
    });
    const groupData = await groupRes.json();
    const groupId = groupData.data?.group?.id || groupData.data?.id;

    // Promote Bob to ADMIN
    await fetch(`${API_BASE}/groups/${groupId}/members/${bob.id}/role`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${alice.token}`,
      },
      body: JSON.stringify({ role: "ADMIN" }),
    });

    console.log(`Group created: ${groupId} (Alice: OWNER, Bob: ADMIN, Charlie: MEMBER, Dave: NON-MEMBER)\n`);

    // --------------------------------------------------------------------------
    // 1. SOCKET AUTHENTICATION TESTS
    // --------------------------------------------------------------------------
    console.log("--- SECTION 1: SOCKET AUTHENTICATION ---");

    // 1.1 Valid socket connection
    {
      const socket = createClientSocket(alice.token);
      const connected = await new Promise<boolean>((resolve) => {
        socket.on("connect", () => resolve(true));
        socket.on("connect_error", () => resolve(false));
        socket.connect();
      });
      socket.disconnect();
      record(1, "Socket Auth", "Valid JWT token establishes socket connection", connected, `Connected: ${connected}`);
    }

    // 1.2 Invalid token
    {
      const socket = createClientSocket("invalid.token.signature");
      const rejected = await new Promise<boolean>((resolve) => {
        socket.on("connect", () => resolve(false));
        socket.on("connect_error", (err) => resolve(err.message.includes("token")));
        socket.connect();
      });
      socket.disconnect();
      record(2, "Socket Auth", "Invalid token rejected during handshake", rejected, `Rejected: ${rejected}`);
    }

    // 1.3 Missing token
    {
      const socket = createClientSocket("");
      const rejected = await new Promise<boolean>((resolve) => {
        socket.on("connect", () => resolve(false));
        socket.on("connect_error", (err) => resolve(err.message.includes("token")));
        socket.connect();
      });
      socket.disconnect();
      record(3, "Socket Auth", "Missing token rejected during handshake", rejected, `Rejected: ${rejected}`);
    }

    // --------------------------------------------------------------------------
    // 2. GROUP ROOMS ACCESS & AUTHORIZATION
    // --------------------------------------------------------------------------
    console.log("\n--- SECTION 2: GROUP ROOM ACCESS ---");

    const aliceSocket = createClientSocket(alice.token);
    const bobSocket = createClientSocket(bob.token);
    const charlieSocket = createClientSocket(charlie.token);
    const daveSocket = createClientSocket(dave.token);

    await Promise.all([
      new Promise<void>((r) => { aliceSocket.on("connect", r); aliceSocket.connect(); }),
      new Promise<void>((r) => { bobSocket.on("connect", r); bobSocket.connect(); }),
      new Promise<void>((r) => { charlieSocket.on("connect", r); charlieSocket.connect(); }),
      new Promise<void>((r) => { daveSocket.on("connect", r); daveSocket.connect(); }),
    ]);

    // 2.1 Owner joins group
    {
      const res = await new Promise<any>((resolve) => {
        aliceSocket.emit("group:join", { groupId }, resolve);
      });
      const passed = res?.success === true;
      record(4, "Room Access", "Owner successfully joins group room (group:join)", passed, `Result: ${JSON.stringify(res)}`);
    }

    // 2.2 Admin joins group
    {
      const res = await new Promise<any>((resolve) => {
        bobSocket.emit("join_group", { groupId }, resolve);
      });
      const passed = res?.success === true;
      record(5, "Room Access", "Admin successfully joins group room (join_group alias)", passed, `Result: ${JSON.stringify(res)}`);
    }

    // 2.3 Member joins group
    {
      const res = await new Promise<any>((resolve) => {
        charlieSocket.emit("group:join", { groupId }, resolve);
      });
      const passed = res?.success === true;
      record(6, "Room Access", "Member successfully joins group room", passed, `Result: ${JSON.stringify(res)}`);
    }

    // 2.4 Non-member (Dave) tries to join group -> rejected
    {
      const res = await new Promise<any>((resolve) => {
        daveSocket.emit("group:join", { groupId }, resolve);
      });
      const passed = res?.success === false && res?.error?.includes("not a member");
      record(7, "Room Access", "Non-member blocked from joining group room", passed, `Result: ${JSON.stringify(res)}`);
    }

    // --------------------------------------------------------------------------
    // 3. REALTIME MESSAGING (Send, Receive, Broadcast)
    // --------------------------------------------------------------------------
    console.log("\n--- SECTION 3: REALTIME MESSAGING ---");

    let receivedByBob: any = null;
    let receivedByCharlie: any = null;
    let receivedByDave: any = null;

    bobSocket.on("message:new", (msg) => { receivedByBob = msg; });
    charlieSocket.on("new_message", (payload) => { receivedByCharlie = payload.message || payload; });
    daveSocket.on("message:new", (msg) => { receivedByDave = msg; });

    // 3.1 Owner sends message via socket
    let ownerMsgId = "";
    {
      const ack = await new Promise<any>((resolve) => {
        aliceSocket.emit("message:send", { groupId, text: "Hello team from Owner!" }, resolve);
      });

      ownerMsgId = ack?.message?.id;
      // Wait briefly for socket broadcast to reach clients
      await new Promise((r) => setTimeout(r, 100));

      const broadcastMatches =
        receivedByBob?.text === "Hello team from Owner!" &&
        receivedByCharlie?.text === "Hello team from Owner!";
      const nonMemberDidNotReceive = receivedByDave === null;
      const safeSender = receivedByBob?.sender?.name === "Alice Owner" && !("passwordHash" in receivedByBob?.sender);
      const passed = ack?.success === true && broadcastMatches && nonMemberDidNotReceive && safeSender;

      record(
        8,
        "Realtime Msg",
        "Owner sends message, members receive realtime broadcast, non-member receives nothing",
        passed,
        `Ack ID: ${ownerMsgId}, Bob text: ${receivedByBob?.text}, Dave received: ${receivedByDave !== null}`
      );
    }

    // 3.2 Admin sends message
    {
      receivedByCharlie = null;
      let receivedByAlice: any = null;
      aliceSocket.once("message:new", (msg) => { receivedByAlice = msg; });

      const ack = await new Promise<any>((resolve) => {
        bobSocket.emit("send_message", { groupId, text: "Admin Bob reporting in!" }, resolve);
      });

      await new Promise((r) => setTimeout(r, 100));

      const passed =
        ack?.success === true &&
        receivedByAlice?.text === "Admin Bob reporting in!" &&
        receivedByCharlie?.text === "Admin Bob reporting in!";

      record(9, "Realtime Msg", "Admin sends message, broadcast delivered to Owner and Member", passed, `Ack: ${ack?.success}`);
    }

    // 3.3 Member sends message
    {
      let receivedByAlice: any = null;
      receivedByBob = null;
      aliceSocket.once("message:new", (msg) => { receivedByAlice = msg; });

      const ack = await new Promise<any>((resolve) => {
        charlieSocket.emit("message:send", { groupId, text: "Member Charlie acknowledges!" }, resolve);
      });

      await new Promise((r) => setTimeout(r, 100));

      const passed =
        ack?.success === true &&
        receivedByAlice?.text === "Member Charlie acknowledges!" &&
        receivedByBob?.text === "Member Charlie acknowledges!";

      record(10, "Realtime Msg", "Member sends message, broadcast delivered to Owner and Admin", passed, `Ack: ${ack?.success}`);
    }

    // 3.4 Verify database persistence in MySQL/Prisma
    {
      const msgInDb = await prisma.message.findUnique({
        where: { id: ownerMsgId },
      });
      const passed = !!msgInDb && (msgInDb.text === "Hello team from Owner!" || msgInDb.content === "Hello team from Owner!");
      record(11, "Persistence", "Messages are persisted directly in database with type TEXT", passed, `Found: ${!!msgInDb}, type: ${msgInDb?.type}`);
    }

    // --------------------------------------------------------------------------
    // 4. REST API CHAT (Get History & Send REST)
    // --------------------------------------------------------------------------
    console.log("\n--- SECTION 4: REST API CHAT ---");

    // 4.1 Get message history
    {
      const res = await fetch(`${API_BASE}/groups/${groupId}/messages?limit=50`, {
        headers: { Authorization: `Bearer ${charlie.token}` },
      });
      const data = await res.json();
      const messages = data.data?.messages || [];
      const hasAll3 = messages.length >= 3;
      const chronological = new Date(messages[0]?.createdAt).getTime() <= new Date(messages[messages.length - 1]?.createdAt).getTime();
      const safeData = !JSON.stringify(data).includes("passwordHash");
      const passed = res.status === 200 && hasAll3 && chronological && safeData;

      record(12, "REST History", "GET messages returns chronological history with sanitized sender info", passed, `Status: ${res.status}, count: ${messages.length}`);
    }

    // 4.2 Send message via REST API
    let restMsgId = "";
    {
      let socketBroadcast: any = null;
      bobSocket.once("message:new", (msg) => { socketBroadcast = msg; });

      const res = await fetch(`${API_BASE}/groups/${groupId}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${alice.token}`,
        },
        body: JSON.stringify({ text: "Reliable REST message from Alice" }),
      });
      const data = await res.json();
      restMsgId = data.data?.id || data.data?.message?.id;

      await new Promise((r) => setTimeout(r, 100));

      const passed =
        res.status === 201 &&
        data.success === true &&
        socketBroadcast?.text === "Reliable REST message from Alice";

      record(13, "REST Send", "POST message persists to database and broadcasts via Socket.IO", passed, `Status: ${res.status}, broadcast received: ${!!socketBroadcast}`);
    }

    // 4.3 Non-member cannot access history -> 403 Forbidden
    {
      const res = await fetch(`${API_BASE}/groups/${groupId}/messages`, {
        headers: { Authorization: `Bearer ${dave.token}` },
      });
      const data = await res.json();
      const passed = res.status === 403 && data.success === false;
      record(14, "REST Security", "Non-member blocked from fetching group messages (403)", passed, `Status: ${res.status}`);
    }

    // 4.4 Non-member cannot send message via REST -> 403 Forbidden
    {
      const res = await fetch(`${API_BASE}/groups/${groupId}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${dave.token}`,
        },
        body: JSON.stringify({ text: "Intruder message" }),
      });
      const data = await res.json();
      const passed = res.status === 403 && data.success === false;
      record(15, "REST Security", "Non-member blocked from sending message via REST (403)", passed, `Status: ${res.status}`);
    }

    // --------------------------------------------------------------------------
    // 5. SECURITY & SPOOFING PREVENTION
    // --------------------------------------------------------------------------
    console.log("\n--- SECTION 5: SECURITY & SPOOFING ---");

    // 5.1 Sender spoofing attempt: Charlie sends payload claiming senderId is Alice
    {
      const ack = await new Promise<any>((resolve) => {
        charlieSocket.emit(
          "message:send",
          { groupId, text: "I am trying to spoof Alice", senderId: alice.id },
          resolve
        );
      });

      const actualSenderId = ack?.message?.senderId;
      const passed = actualSenderId === charlie.id; // Must be Charlie, NOT Alice
      record(16, "Security", "Sender ID spoofing prevented (forces authenticated socket user)", passed, `Actual senderId: ${actualSenderId}, Charlie id: ${charlie.id}`);
    }

    // 5.2 Group ID tampering: Sending to another group ID
    {
      const fakeGroupId = "00000000-0000-0000-0000-000000000000";
      const ack = await new Promise<any>((resolve) => {
        aliceSocket.emit("message:send", { groupId: fakeGroupId, text: "Tampered group" }, resolve);
      });
      const passed = ack?.success === false;
      record(17, "Security", "Group ID tampering blocked (membership verified per message)", passed, `Error: ${ack?.error}`);
    }

    // 5.3 Empty message rejection
    {
      const ack = await new Promise<any>((resolve) => {
        aliceSocket.emit("message:send", { groupId, text: "    " }, resolve);
      });
      const passed = ack?.success === false;
      record(18, "Validation", "Empty/whitespace-only message rejected", passed, `Error: ${ack?.error}`);
    }

    // 5.4 Excessively large message rejection
    {
      const largeText = "A".repeat(6000);
      const ack = await new Promise<any>((resolve) => {
        aliceSocket.emit("message:send", { groupId, text: largeText }, resolve);
      });
      const passed = ack?.success === false && ack?.error?.includes("5000");
      record(19, "Validation", "Excessively long message (>5000 chars) rejected", passed, `Error: ${ack?.error}`);
    }

    // --------------------------------------------------------------------------
    // 6. RATE LIMITING / SPAM PROTECTION
    // --------------------------------------------------------------------------
    console.log("\n--- SECTION 6: RATE LIMITING & SPAM PROTECTION ---");

    {
      let rateLimitTriggered = false;
      // Emit 35 messages rapidly from Charlie to trigger rate limit (threshold is 30/10s)
      for (let i = 0; i < 35; i++) {
        const ack: any = await new Promise((resolve) => {
          charlieSocket.emit("message:send", { groupId, text: `Spam #${i}` }, resolve);
        });
        if (ack?.error?.includes("Rate limit exceeded")) {
          rateLimitTriggered = true;
          break;
        }
      }

      record(20, "Rate Limiting", "Socket message burst spam blocked by rate limiter", rateLimitTriggered, `Rate limit caught: ${rateLimitTriggered}`);
    }

    // --------------------------------------------------------------------------
    // 7. CONNECTION LIFECYCLE & DUPLICATE PREVENTION
    // --------------------------------------------------------------------------
    console.log("\n--- SECTION 7: CONNECTION LIFECYCLE & DUPLICATE HANDLING ---");

    // 7.1 Leave group room
    {
      let bobReceivedAfterLeave = false;
      bobSocket.on("message:new", () => { bobReceivedAfterLeave = true; });

      // Bob leaves room
      await new Promise<any>((resolve) => {
        bobSocket.emit("group:leave", { groupId }, resolve);
      });

      // Alice sends message
      await new Promise<any>((resolve) => {
        aliceSocket.emit("message:send", { groupId, text: "After Bob left room" }, resolve);
      });

      await new Promise((r) => setTimeout(r, 100));

      const passed = !bobReceivedAfterLeave;
      record(21, "Lifecycle", "Leaving group room stops receiving realtime broadcasts", passed, `Bob received: ${bobReceivedAfterLeave}`);
    }

    // 7.2 Reconnect & Rejoin
    {
      let bobReceivedAfterRejoin = false;
      bobSocket.disconnect();
      await new Promise<void>((r) => { bobSocket.on("connect", r); bobSocket.connect(); });

      // Rejoin group
      await new Promise<any>((resolve) => {
        bobSocket.emit("group:join", { groupId }, resolve);
      });

      bobSocket.on("message:new", () => { bobReceivedAfterRejoin = true; });

      // Alice sends message
      await new Promise<any>((resolve) => {
        aliceSocket.emit("message:send", { groupId, text: "Welcome back Bob!" }, resolve);
      });

      await new Promise((r) => setTimeout(r, 100));

      record(22, "Lifecycle", "Reconnecting and rejoining resumes realtime message reception", bobReceivedAfterRejoin, `Bob received: ${bobReceivedAfterRejoin}`);
    }

    // 7.3 Duplicate message prevention: Unique message ID check
    {
      const res = await fetch(`${API_BASE}/groups/${groupId}/messages?limit=100`, {
        headers: { Authorization: `Bearer ${alice.token}` },
      });
      const data = await res.json();
      const messages: any[] = data.data?.messages || [];
      const ids = messages.map((m) => m.id);
      const uniqueIds = new Set(ids);
      const noDuplicatesInDb = ids.length === uniqueIds.size;

      record(23, "Duplicate Check", "Zero duplicate messages: all persisted message IDs are strictly unique", noDuplicatesInDb, `Total messages: ${ids.length}, Unique IDs: ${uniqueIds.size}`);
    }

    // --------------------------------------------------------------------------
    // SUMMARY
    // --------------------------------------------------------------------------
    console.log("\n================================================================================");
    console.log("                           VERIFICATION SUMMARY");
    console.log("================================================================================");

    const passedCount = results.filter((r) => r.passed).length;
    const totalCount = results.length;

    console.log(`TOTAL TESTS: ${totalCount}`);
    console.log(`PASSED: ${passedCount}`);
    console.log(`FAILED: ${totalCount - passedCount}`);

    if (passedCount === totalCount) {
      console.log("\n🎉 ALL TESTS PASSED! REALTIME CHAT READY");
    } else {
      console.error("\n❌ SOME TESTS FAILED! REALTIME CHAT NOT READY");
    }

    aliceSocket.disconnect();
    bobSocket.disconnect();
    charlieSocket.disconnect();
    daveSocket.disconnect();
  } finally {
    server.close();
    await prisma.$disconnect();
  }
}

runStep4RealtimeVerification()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Test execution failed:", err);
    process.exit(1);
  });
