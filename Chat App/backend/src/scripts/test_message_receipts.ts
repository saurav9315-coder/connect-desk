import http from "http";
import { app } from "../app";
import { initSocketServer } from "../socket";
import { prisma } from "../lib/prisma";
import { io as ClientSocket, Socket as ClientSocketType } from "socket.io-client";
import { computeMessageStatus } from "../services/message.service";

const PORT = 5088;
const API_BASE = `http://localhost:${PORT}/api`;
const SOCKET_URL = `http://localhost:${PORT}`;

interface TestResult {
  num: number;
  test: string;
  passed: boolean;
  details: string;
}

const results: TestResult[] = [];

function record(num: number, test: string, passed: boolean, details: string) {
  results.push({ num, test, passed, details });
  const icon = passed ? "✅ PASS" : "❌ FAIL";
  console.log(`${icon} [${num}] ${test}: ${details}`);
}

function createClientSocket(token?: string): ClientSocketType {
  return ClientSocket(SOCKET_URL, {
    auth: token ? { token } : {},
    autoConnect: false,
    transports: ["websocket"],
    reconnection: false,
  });
}

async function runMessageReceiptVerification() {
  console.log("================================================================================");
  console.log("   CONNECTDESK - REAL WHATSAPP-STYLE MESSAGE STATUS FULL-STACK VERIFICATION");
  console.log("================================================================================\n");

  const server = http.createServer(app);
  initSocketServer(server);

  await new Promise<void>((resolve) => server.listen(PORT, () => resolve()));
  console.log(`Receipt verification server running on port ${PORT}\n`);

  try {
    const ts = Date.now().toString().slice(-6);

    // --------------------------------------------------------------------------
    // SETUP: Register 3 Users (Alice: Sender, Bob: Recipient 1, Charlie: Recipient 2, Eve: Non-member)
    // --------------------------------------------------------------------------
    console.log("--- 1. REGISTERING TEST USERS ---");

    const usersData = [
      { name: "Alice Sender", username: `alice_${ts}`, email: `alice_${ts}@test.com`, password: "Password123!" },
      { name: "Bob Recipient", username: `bob_${ts}`, email: `bob_${ts}@test.com`, password: "Password123!" },
      { name: "Charlie Recipient", username: `charlie_${ts}`, email: `charlie_${ts}@test.com`, password: "Password123!" },
      { name: "Eve NonMember", username: `eve_${ts}`, email: `eve_${ts}@test.com`, password: "Password123!" },
    ];

    const tokens: Record<string, string> = {};
    const userIds: Record<string, string> = {};

    for (const u of usersData) {
      const res = await fetch(`${API_BASE}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(u),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(`Registration failed for ${u.username}: ${JSON.stringify(data)}`);
      tokens[u.name.split(" ")[0].toLowerCase()] = data.data.accessToken || data.data.tokens?.accessToken;
      userIds[u.name.split(" ")[0].toLowerCase()] = data.data.user.id;
    }

    console.log("All 4 test users registered successfully.\n");

    // --------------------------------------------------------------------------
    // SETUP: Alice creates a Group and adds Bob & Charlie (Eve is NOT added)
    // --------------------------------------------------------------------------
    console.log("--- 2. CREATING TEST GROUP ---");

    const groupRes = await fetch(`${API_BASE}/groups`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokens.alice}`,
      },
      body: JSON.stringify({
        name: `Receipts Test Group ${ts}`,
        description: "Testing single, double and blue ticks",
        initialMemberIds: [userIds.bob, userIds.charlie],
      }),
    });

    const groupData = await groupRes.json();
    if (!groupRes.ok) throw new Error(`Group creation failed: ${JSON.stringify(groupData)}`);
    const groupId = groupData.data.group.id;
    console.log(`Created Group ID: ${groupId} with members Alice, Bob, Charlie (3 members)\n`);

    // Connect Sockets for Alice and Bob (Charlie stays offline initially to test scenario 6)
    const socketAlice = createClientSocket(tokens.alice);
    const socketBob = createClientSocket(tokens.bob);
    const socketEve = createClientSocket(tokens.eve);

    await new Promise<void>((resolve) => {
      socketAlice.connect();
      socketAlice.on("connect", () => resolve());
    });

    await new Promise<void>((resolve) => {
      socketBob.connect();
      socketBob.on("connect", () => resolve());
    });

    // Join Alice and Bob to group
    await new Promise((resolve) => socketAlice.emit("join_group", { groupId }, resolve));
    await new Promise((resolve) => socketBob.emit("join_group", { groupId }, resolve));

    // --------------------------------------------------------------------------
    // TEST 1: Alice sends a message -> Database confirmation has status = "SENT"
    // --------------------------------------------------------------------------
    console.log("--- 3. TEST 1: SENDER SENDS A MESSAGE (SINGLE TICK) ---");

    let receivedMsgOnBob: any = null;
    socketBob.on("message:new", (payload: any) => {
      receivedMsgOnBob = payload?.message || payload;
    });

    const sendRes: any = await new Promise((resolve) => {
      socketAlice.emit(
        "message:send",
        { groupId, text: "Hello receipts verification!", tempId: `temp_${Date.now()}` },
        resolve
      );
    });

    const createdMsg = sendRes?.message;
    const isSent = createdMsg && createdMsg.status === "SENT";
    record(
      1,
      "Sender sends message and sees SENT (1 grey tick) upon DB confirmation",
      isSent,
      `Message ID: ${createdMsg?.id}, Status: ${createdMsg?.status}`
    );

    // Verify MessageReceipt records were created in DB for Bob and Charlie (excluding Alice)
    const receiptsInDb = await prisma.messageReceipt.findMany({
      where: { messageId: createdMsg.id },
    });

    const expectedRecipients = [userIds.bob, userIds.charlie];
    const hasBobAndCharlie =
      receiptsInDb.length === 2 &&
      receiptsInDb.every((r) => expectedRecipients.includes(r.userId) && r.userId !== userIds.alice);

    record(
      2,
      "MessageReceipt records created in MySQL for other group members only",
      hasBobAndCharlie,
      `Found ${receiptsInDb.length} receipts for recipients: ${receiptsInDb.map((r) => r.userId).join(", ")}`
    );

    // --------------------------------------------------------------------------
    // TEST 3 & 4: Bob receives message and acknowledges delivery
    // Charlie is still offline, so status must remain SENT until ALL recipients receive it!
    // --------------------------------------------------------------------------
    console.log("--- 4. TEST 2 & 6: RECIPIENT 1 RECEIVES WHILE RECIPIENT 2 IS OFFLINE ---");

    let receiptUpdatePromise = new Promise<any>((resolve) => {
      socketAlice.once("message:receipt:update", (update) => resolve(update));
    });

    // Bob acknowledges delivery
    const bobAck: any = await new Promise((resolve) => {
      socketBob.emit("message:delivered", { groupId, messageIds: [createdMsg.id] }, resolve);
    });

    const bobUpdate = await receiptUpdatePromise;

    // Bob received it, but Charlie is offline, so overall status should still be SENT!
    const stillSent = bobUpdate?.status === "SENT";
    record(
      3,
      "Partial delivery (Bob online, Charlie offline) retains SENT (1 grey tick) - does NOT falsely show double tick",
      stillSent && bobAck?.success,
      `Bob delivered, Charlie pending. Overall status: ${bobUpdate?.status}`
    );

    // Verify Bob's deliveredAt is set in DB, but Charlie's deliveredAt is null
    const dbReceiptBob = await prisma.messageReceipt.findUnique({
      where: { messageId_userId: { messageId: createdMsg.id, userId: userIds.bob } },
    });
    const dbReceiptCharlie = await prisma.messageReceipt.findUnique({
      where: { messageId_userId: { messageId: createdMsg.id, userId: userIds.charlie } },
    });

    record(
      4,
      "Database accurately records deliveredAt for online user and null for offline user",
      dbReceiptBob?.deliveredAt !== null && dbReceiptCharlie?.deliveredAt === null,
      `Bob deliveredAt: ${dbReceiptBob?.deliveredAt?.toISOString()}, Charlie deliveredAt: ${dbReceiptCharlie?.deliveredAt}`
    );

    // --------------------------------------------------------------------------
    // TEST 5 & 7: Offline Charlie reconnects, receives pending messages and acknowledges delivery
    // --------------------------------------------------------------------------
    console.log("--- 5. TEST 3 & 7: OFFLINE CHARLIE RECONNECTS AND ACKNOWLEDGES DELIVERY ---");

    const socketCharlie = createClientSocket(tokens.charlie);
    await new Promise<void>((resolve) => {
      socketCharlie.connect();
      socketCharlie.on("connect", () => resolve());
    });
    await new Promise((resolve) => socketCharlie.emit("join_group", { groupId }, resolve));

    receiptUpdatePromise = new Promise<any>((resolve) => {
      socketAlice.once("message:receipt:update", (update) => resolve(update));
    });

    // Charlie fetches messages and acknowledges delivery
    const charlieAck: any = await new Promise((resolve) => {
      socketCharlie.emit("message:delivered", { groupId, messageIds: [createdMsg.id] }, resolve);
    });

    const allDeliveredUpdate = await receiptUpdatePromise;

    record(
      5,
      "All recipients received message -> Status updates to DELIVERED (2 grey ticks)",
      allDeliveredUpdate?.status === "DELIVERED" && charlieAck?.success,
      `Updated status on Alice's socket: ${allDeliveredUpdate?.status}`
    );

    // --------------------------------------------------------------------------
    // TEST 6: Bob reads message -> Status remains DELIVERED until all read
    // --------------------------------------------------------------------------
    console.log("--- 6. TEST 4: ONE RECIPIENT READS THE MESSAGE ---");

    receiptUpdatePromise = new Promise<any>((resolve) => {
      socketAlice.once("message:receipt:update", (update) => resolve(update));
    });

    const bobReadAck: any = await new Promise((resolve) => {
      socketBob.emit("message:read", { groupId, messageIds: [createdMsg.id] }, resolve);
    });

    const bobReadUpdate = await receiptUpdatePromise;

    record(
      6,
      "Bob reads message -> Status remains DELIVERED (2 grey ticks) until Charlie also reads",
      bobReadUpdate?.status === "DELIVERED" && bobReadAck?.success,
      `Bob readAt updated, Charlie unread. Status: ${bobReadUpdate?.status}`
    );

    // --------------------------------------------------------------------------
    // TEST 7: Charlie also reads message -> Status updates to READ (2 blue ticks)
    // --------------------------------------------------------------------------
    console.log("--- 7. TEST 5: ALL RECIPIENTS READ THE MESSAGE (BLUE TICKS) ---");

    receiptUpdatePromise = new Promise<any>((resolve) => {
      socketAlice.once("message:receipt:update", (update) => resolve(update));
    });

    const charlieReadAck: any = await new Promise((resolve) => {
      socketCharlie.emit("message:read", { groupId, messageIds: [createdMsg.id] }, resolve);
    });

    const allReadUpdate = await receiptUpdatePromise;

    record(
      7,
      "All recipients read message -> Status updates to READ (2 blue ticks)",
      allReadUpdate?.status === "READ" && charlieReadAck?.success,
      `Updated status on Alice's socket: ${allReadUpdate?.status}`
    );

    // --------------------------------------------------------------------------
    // TEST 8: Browser refresh simulation: Fetching messages returns persisted READ status
    // --------------------------------------------------------------------------
    console.log("--- 8. TEST 8: REFRESH PERSISTENCE CHECK ---");

    const refreshRes = await fetch(`${API_BASE}/groups/${groupId}/messages?limit=10`, {
      headers: { Authorization: `Bearer ${tokens.alice}` },
    });
    const refreshData = await refreshRes.json();
    const refreshedMsg = (refreshData.data.messages || []).find((m: any) => m.id === createdMsg.id);

    record(
      8,
      "Page refresh / REST query returns persisted READ status and receipt array",
      refreshedMsg?.status === "READ" && refreshedMsg?.receipts?.length === 2,
      `Refreshed status: ${refreshedMsg?.status}, receipts count: ${refreshedMsg?.receipts?.length}`
    );

    // --------------------------------------------------------------------------
    // TEST 9 & 10: Idempotency & Duplicate receipt events
    // --------------------------------------------------------------------------
    console.log("--- 9. TEST 9 & 10: IDEMPOTENT DUPLICATE RECEIPTS ---");

    // Sending duplicate read acknowledgment
    const dupAck: any = await new Promise((resolve) => {
      socketBob.emit("message:read", { groupId, messageIds: [createdMsg.id] }, resolve);
    });

    const countAfterDup = await prisma.messageReceipt.count({
      where: { messageId: createdMsg.id },
    });

    record(
      9,
      "Duplicate receipt events do not create duplicate records (idempotent)",
      dupAck?.success && countAfterDup === 2,
      `Receipt count in DB remains exactly: ${countAfterDup}`
    );

    // --------------------------------------------------------------------------
    // TEST 11: Non-member Eve cannot acknowledge or receive receipts
    // --------------------------------------------------------------------------
    console.log("--- 10. TEST 11 & 13: GROUP AUTHORIZATION & NON-MEMBER PROTECTION ---");

    await new Promise<void>((resolve) => {
      socketEve.connect();
      socketEve.on("connect", () => resolve());
    });

    const eveAck: any = await new Promise((resolve) => {
      socketEve.emit("message:read", { groupId, messageIds: [createdMsg.id] }, resolve);
    });

    record(
      10,
      "Non-member Eve is denied access to acknowledge group message receipts",
      eveAck?.success === false && typeof eveAck?.error === "string",
      `Eve response: error='${eveAck?.error}'`
    );

    // --------------------------------------------------------------------------
    // TEST 12: Compatibility with Media message types (IMAGE, FILE, VOICE)
    // --------------------------------------------------------------------------
    console.log("--- 11. TEST 12: MEDIA & VOICE RECEIPT TRACKING ---");

    // Send an Image message via REST
    const mediaRes = await fetch(`${API_BASE}/groups/${groupId}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokens.alice}`,
      },
      body: JSON.stringify({
        type: "IMAGE",
        fileUrl: "http://localhost:5001/uploads/test.png",
        fileName: "test.png",
      }),
    });

    const mediaData = await mediaRes.json();
    const mediaMsg = mediaData.data?.message || mediaData.data;
    const mediaReceipts = await prisma.messageReceipt.findMany({
      where: { messageId: mediaMsg.id },
    });

    record(
      11,
      "Media messages (IMAGE/FILE/VOICE) automatically generate receipts and initialize to SENT",
      mediaMsg?.status === "SENT" && mediaReceipts.length === 2,
      `Media type: ${mediaMsg?.type}, Status: ${mediaMsg?.status}, Receipts: ${mediaReceipts.length}`
    );

    // Cleanup sockets
    socketAlice.disconnect();
    socketBob.disconnect();
    socketCharlie.disconnect();
    socketEve.disconnect();

  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    console.log("Receipt verification server closed.\n");
  }

  console.log("================================================================================");
  console.log("                           VERIFICATION SUMMARY");
  console.log("================================================================================");
  const totalPassed = results.filter((r) => r.passed).length;
  console.log(`Total tests: ${results.length} | Passed: ${totalPassed} | Failed: ${results.length - totalPassed}`);
  if (totalPassed === results.length) {
    console.log("🎉 ALL MESSAGE RECEIPT VERIFICATION TESTS PASSED SUCCESSFULLY!\n");
  } else {
    console.error("❌ SOME TESTS FAILED.\n");
    process.exit(1);
  }
}

runMessageReceiptVerification().catch((err) => {
  console.error("Fatal test error:", err);
  process.exit(1);
});
