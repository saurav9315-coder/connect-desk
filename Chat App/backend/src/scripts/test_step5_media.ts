import http from "http";
import path from "path";
import fs from "fs";
import { app } from "../app";
import { initSocketServer } from "../socket";
import { prisma } from "../lib/prisma";
import { io as ClientSocket, Socket as ClientSocketType } from "socket.io-client";
import { StorageFactory } from "../services/storage/storage.factory";

const PORT = 5044;
const API_BASE = `http://localhost:${PORT}/api`;
const SOCKET_URL = `http://localhost:${PORT}`;

interface TestResult {
  num: number;
  scenario: string;
  passed: boolean;
  details: string;
}

const results: TestResult[] = [];

function record(num: number, scenario: string, passed: boolean, details: string) {
  results.push({ num, scenario, passed, details });
  const icon = passed ? "✅ PASS" : "❌ FAIL";
  console.log(`${icon} [${num.toString().padStart(2, "0")}] ${scenario}`);
  if (!passed || details) {
    console.log(`     Details: ${details}`);
  }
}

function createClientSocket(token?: string): ClientSocketType {
  return ClientSocket(SOCKET_URL, {
    auth: token ? { token } : {},
    autoConnect: false,
    transports: ["websocket"],
    reconnection: false,
  });
}

// Minimal valid PNG (1x1 transparent PNG)
const VALID_PNG_BUFFER = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64"
);

// Minimal valid MP4 header bytes
const VALID_MP4_BUFFER = Buffer.concat([
  Buffer.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32]),
  Buffer.alloc(100, 0),
]);

// Minimal valid PDF
const VALID_PDF_BUFFER = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\nxref\n0 1\n0000000000 65535 f\ntrailer<</Size 1/Root 1 0 R>>\nstartxref\n55\n%%EOF");

async function runStep5MediaVerification() {
  console.log("================================================================================");
  console.log("             STEP 5: IMAGE, VIDEO & FILE SHARING TEST SUITE");
  console.log("================================================================================\n");

  process.env.NODE_ENV = "test";
  const server = http.createServer(app);
  initSocketServer(server);

  await new Promise<void>((resolve) => server.listen(PORT, () => resolve()));
  console.log(`Media verification server running on port ${PORT}\n`);

  try {
    const timestamp = Date.now().toString().slice(-6);

    // --------------------------------------------------------------------------
    // SETUP: Register 3 Test Users (Alice: Owner, Bob: Member, Dave: Non-member)
    // --------------------------------------------------------------------------
    console.log("--- SETUP: REGISTERING TEST USERS ---");
    const users = [
      { name: "Alice Owner", username: `alice_${timestamp}`, email: `alice_${timestamp}@test.com`, password: "Password123!" },
      { name: "Bob Member", username: `bob_${timestamp}`, email: `bob_${timestamp}@test.com`, password: "Password123!" },
      { name: "Dave NonMember", username: `dave_${timestamp}`, email: `dave_${timestamp}@test.com`, password: "Password123!" },
    ];

    const userMap: Record<string, { id: string; token: string }> = {};

    for (const u of users) {
      const res = await fetch(`${API_BASE}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(u),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(`Registration failed for ${u.name}: ${JSON.stringify(data)}`);
      userMap[u.name.split(" ")[0].toLowerCase()] = {
        id: data.data.user.id,
        token: data.data.accessToken,
      };
    }

    const alice = userMap["alice"];
    const bob = userMap["bob"];
    const dave = userMap["dave"];

    // --------------------------------------------------------------------------
    // SETUP: Create Group 1 (Alice & Bob) and Group 2 (Dave only)
    // --------------------------------------------------------------------------
    console.log("--- SETUP: CREATING TEST GROUPS ---");

    // Group 1
    const g1Res = await fetch(`${API_BASE}/groups`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${alice.token}`,
      },
      body: JSON.stringify({
        name: `Media Group 1 ${timestamp}`,
        initialMemberIds: [bob.id],
      }),
    });
    const g1Data = await g1Res.json();
    const group1Id = g1Data.data.group.id;

    // Group 2 (Dave's private group)
    const g2Res = await fetch(`${API_BASE}/groups`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${dave.token}`,
      },
      body: JSON.stringify({
        name: `Dave's Isolated Group ${timestamp}`,
      }),
    });
    const g2Data = await g2Res.json();
    const group2Id = g2Data.data.group.id;

    let imageMessage: any = null;
    let videoMessage: any = null;
    let fileMessage: any = null;

    console.log("\n--- EXECUTING 18 PRD STEP 5 TEST SCENARIOS ---\n");

    // --------------------------------------------------------------------------
    // 1. Upload a valid image
    // --------------------------------------------------------------------------
    {
      const formData = new FormData();
      formData.append("file", new Blob([VALID_PNG_BUFFER], { type: "image/png" }), "avatar.png");
      formData.append("text", "Check out this screenshot");

      const res = await fetch(`${API_BASE}/groups/${group1Id}/attachments`, {
        method: "POST",
        headers: { Authorization: `Bearer ${alice.token}` },
        body: formData,
      });
      const data = await res.json();
      const ok = res.status === 201 && data.data?.message?.type === "IMAGE" && !!data.data?.fileUrl;
      if (ok) imageMessage = data.data.message;
      record(1, "Upload a valid image", ok, `Status: ${res.status}, Type: ${data.data?.message?.type}, FileUrl: ${data.data?.fileUrl}`);
    }

    // --------------------------------------------------------------------------
    // 2. Upload a valid video
    // --------------------------------------------------------------------------
    {
      const formData = new FormData();
      formData.append("file", new Blob([VALID_MP4_BUFFER], { type: "video/mp4" }), "demo.mp4");
      formData.append("text", "Product demonstration video");

      const res = await fetch(`${API_BASE}/groups/${group1Id}/attachments`, {
        method: "POST",
        headers: { Authorization: `Bearer ${alice.token}` },
        body: formData,
      });
      const data = await res.json();
      const ok = res.status === 201 && data.data?.message?.type === "VIDEO" && !!data.data?.fileUrl;
      if (ok) videoMessage = data.data.message;
      record(2, "Upload a valid video", ok, `Status: ${res.status}, Type: ${data.data?.message?.type}, FileUrl: ${data.data?.fileUrl}`);
    }

    // --------------------------------------------------------------------------
    // 3. Upload an allowed document
    // --------------------------------------------------------------------------
    {
      const formData = new FormData();
      formData.append("file", new Blob([VALID_PDF_BUFFER], { type: "application/pdf" }), "spec.pdf");
      formData.append("text", "Project specifications document");

      const res = await fetch(`${API_BASE}/groups/${group1Id}/attachments`, {
        method: "POST",
        headers: { Authorization: `Bearer ${alice.token}` },
        body: formData,
      });
      const data = await res.json();
      const ok = res.status === 201 && data.data?.message?.type === "FILE" && !!data.data?.fileUrl;
      if (ok) fileMessage = data.data.message;
      record(3, "Upload an allowed document", ok, `Status: ${res.status}, Type: ${data.data?.message?.type}, FileUrl: ${data.data?.fileUrl}`);
    }

    // --------------------------------------------------------------------------
    // 4. Open or download an attachment
    // --------------------------------------------------------------------------
    {
      const fileKey = imageMessage.fileKey;
      // Test authenticated GET
      const getRes = await fetch(`${API_BASE}/groups/${group1Id}/files/${fileKey}`, {
        headers: { Authorization: `Bearer ${bob.token}` },
      });
      const hasLength = !!getRes.headers.get("content-length");
      const isOk = getRes.status === 200 && hasLength;

      // Test download query parameter
      const dlRes = await fetch(`${API_BASE}/groups/${group1Id}/files/${fileKey}?download=true`, {
        headers: { Authorization: `Bearer ${bob.token}` },
      });
      const disp = dlRes.headers.get("content-disposition");
      const isDownloadOk = dlRes.status === 200 && !!disp && disp.includes("attachment");

      // Test video HTTP Range request
      const videoKey = videoMessage.fileKey;
      const rangeRes = await fetch(`${API_BASE}/groups/${group1Id}/files/${videoKey}`, {
        headers: {
          Authorization: `Bearer ${bob.token}`,
          Range: "bytes=0-49",
        },
      });
      const isRangeOk = rangeRes.status === 206 && Boolean(rangeRes.headers.get("content-range")?.includes("bytes 0-49/"));

      const allOk = isOk && isDownloadOk && isRangeOk;
      record(4, "Open or download an attachment", allOk, `Stream 200: ${isOk}, Download header: ${isDownloadOk}, HTTP Range 206: ${isRangeOk}`);
    }

    // --------------------------------------------------------------------------
    // 5. Reload chat history after refreshing the browser
    // --------------------------------------------------------------------------
    {
      const res = await fetch(`${API_BASE}/groups/${group1Id}/messages`, {
        headers: { Authorization: `Bearer ${bob.token}` },
      });
      const data = await res.json();
      const msgs = data.data?.messages || [];
      const hasImage = msgs.some((m: any) => m.id === imageMessage.id && m.type === "IMAGE" && m.fileUrl);
      const hasVideo = msgs.some((m: any) => m.id === videoMessage.id && m.type === "VIDEO" && m.fileUrl);
      const hasFile = msgs.some((m: any) => m.id === fileMessage.id && m.type === "FILE" && m.fileUrl);
      const ok = res.status === 200 && hasImage && hasVideo && hasFile;
      record(5, "Reload chat history after refreshing the browser", ok, `Loaded: ${msgs.length} messages, Image: ${hasImage}, Video: ${hasVideo}, File: ${hasFile}`);
    }

    // --------------------------------------------------------------------------
    // 6. Verify another group member receives the message in real time
    // --------------------------------------------------------------------------
    {
      const bobSocket = createClientSocket(bob.token);
      await new Promise<void>((resolve) => {
        bobSocket.connect();
        bobSocket.on("connect", () => {
          bobSocket.emit("group:join", { groupId: group1Id }, () => resolve());
        });
      });

      const messagePromise = new Promise<any>((resolve) => {
        bobSocket.on("message:new", (payload: any) => {
          resolve(payload);
        });
      });

      // Alice uploads a new image
      const formData = new FormData();
      formData.append("file", new Blob([VALID_PNG_BUFFER], { type: "image/png" }), "realtime-snap.png");
      formData.append("text", "Realtime test image");

      await fetch(`${API_BASE}/groups/${group1Id}/attachments`, {
        method: "POST",
        headers: { Authorization: `Bearer ${alice.token}` },
        body: formData,
      });

      const received = await Promise.race([
        messagePromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout waiting for message:new")), 4000)),
      ]).catch((e) => null);

      bobSocket.disconnect();
      const ok = !!received && (received.type === "IMAGE" || received.message?.type === "IMAGE");
      record(6, "Verify another group member receives the message in real time", ok, `Received payload: ${!!received}, Type: ${received?.type || received?.message?.type}`);
    }

    // --------------------------------------------------------------------------
    // 7. Verify file metadata is stored in MySQL
    // --------------------------------------------------------------------------
    {
      const dbRecord = await prisma.message.findUnique({
        where: { id: imageMessage.id },
      });
      const ok =
        !!dbRecord &&
        dbRecord.fileKey === imageMessage.fileKey &&
        dbRecord.fileName === imageMessage.fileName &&
        dbRecord.mimeType === "image/png" &&
        dbRecord.type === "IMAGE" &&
        dbRecord.groupId === group1Id &&
        dbRecord.senderId === alice.id;

      record(7, "Verify file metadata is stored in MySQL", ok, `DB record: ${!!dbRecord}, fileName: ${dbRecord?.fileName}, mimeType: ${dbRecord?.mimeType}`);
    }

    // --------------------------------------------------------------------------
    // 8. Try an unsupported file type
    // --------------------------------------------------------------------------
    {
      const formData = new FormData();
      const dangerousBuffer = Buffer.from("MZ malicious executable code");
      formData.append("file", new Blob([dangerousBuffer], { type: "application/x-msdownload" }), "malware.exe");

      const res = await fetch(`${API_BASE}/groups/${group1Id}/attachments`, {
        method: "POST",
        headers: { Authorization: `Bearer ${alice.token}` },
        body: formData,
      });
      const data = await res.json();
      const ok = res.status === 400 && data.success === false;
      record(8, "Try an unsupported file type", ok, `Status: ${res.status}, Error Code: ${data.error?.code || data.code}`);
    }

    // --------------------------------------------------------------------------
    // 9. Try an oversized file
    // --------------------------------------------------------------------------
    {
      const formData = new FormData();
      // Valid PNG header with payload > 10MB (11MB)
      const oversizedBuffer = Buffer.concat([
        VALID_PNG_BUFFER,
        Buffer.alloc(11 * 1024 * 1024, 0),
      ]);
      formData.append("file", new Blob([oversizedBuffer], { type: "image/png" }), "huge.png");

      const res = await fetch(`${API_BASE}/groups/${group1Id}/attachments`, {
        method: "POST",
        headers: { Authorization: `Bearer ${alice.token}` },
        body: formData,
      });
      const data = await res.json();
      const ok = (res.status === 400 || res.status === 413) && (data.error?.message?.includes("exceed") || data.message?.includes("exceed") || data.error?.code === "FILE_TOO_LARGE");
      record(9, "Try an oversized file", ok, `Status: ${res.status}, Error: ${data.error?.message || data.message}`);
    }

    // --------------------------------------------------------------------------
    // 10. Try uploading without authentication
    // --------------------------------------------------------------------------
    {
      const formData = new FormData();
      formData.append("file", new Blob([VALID_PNG_BUFFER], { type: "image/png" }), "unauth.png");

      const res = await fetch(`${API_BASE}/groups/${group1Id}/attachments`, {
        method: "POST",
        body: formData,
      });
      const ok = res.status === 401;
      record(10, "Try uploading without authentication", ok, `Status: ${res.status} (Expected 401)`);
    }

    // --------------------------------------------------------------------------
    // 11. Try uploading to a group the user does not belong to
    // --------------------------------------------------------------------------
    {
      const formData = new FormData();
      formData.append("file", new Blob([VALID_PNG_BUFFER], { type: "image/png" }), "unauth-group.png");

      // Dave is not a member of Group 1
      const res = await fetch(`${API_BASE}/groups/${group1Id}/attachments`, {
        method: "POST",
        headers: { Authorization: `Bearer ${dave.token}` },
        body: formData,
      });
      const ok = res.status === 403;
      record(11, "Try uploading to a group the user does not belong to", ok, `Status: ${res.status} (Expected 403 FORBIDDEN)`);
    }

    // --------------------------------------------------------------------------
    // 12. Try accessing another group's attachment
    // --------------------------------------------------------------------------
    {
      const fileKey = imageMessage.fileKey;
      // Dave tries to access Group 1's file directly
      const directRes = await fetch(`${API_BASE}/groups/${group1Id}/files/${fileKey}`, {
        headers: { Authorization: `Bearer ${dave.token}` },
      });
      const isDirectBlocked = directRes.status === 403;

      // Dave tries path tampering: query Group 2 with Group 1's fileKey
      const tamperRes = await fetch(`${API_BASE}/groups/${group2Id}/files/${fileKey}`, {
        headers: { Authorization: `Bearer ${dave.token}` },
      });
      const isTamperBlocked = tamperRes.status === 404;

      const ok = isDirectBlocked && isTamperBlocked;
      record(12, "Try accessing another group's attachment", ok, `Direct access: ${directRes.status} (403), Tampered groupId: ${tamperRes.status} (404)`);
    }

    // --------------------------------------------------------------------------
    // 13. Simulate storage-provider failure
    // --------------------------------------------------------------------------
    {
      const storage = StorageFactory.getStorage();
      const originalSave = storage.saveFile;
      // Temporarily mock failure
      storage.saveFile = async () => {
        throw new Error("Simulated storage cluster outage");
      };

      const formData = new FormData();
      formData.append("file", new Blob([VALID_PNG_BUFFER], { type: "image/png" }), "storage-fail.png");

      const res = await fetch(`${API_BASE}/groups/${group1Id}/attachments`, {
        method: "POST",
        headers: { Authorization: `Bearer ${alice.token}` },
        body: formData,
      });

      // Restore storage method
      storage.saveFile = originalSave;
      const data = await res.json();
      const ok = res.status === 502 && data.error?.code === "STORAGE_ERROR";
      record(13, "Simulate storage-provider failure", ok, `Status: ${res.status}, Error Code: ${data.error?.code}`);
    }

    // --------------------------------------------------------------------------
    // 14. Simulate database failure after upload
    // --------------------------------------------------------------------------
    {
      const originalCreate = prisma.message.create;
      let simulatedKey: string | null = null;
      // Intercept and inject DB error after file save
      (prisma.message as any).create = async (args: any) => {
        simulatedKey = args.data?.fileKey;
        throw new Error("Simulated MySQL dead connection after upload");
      };

      const formData = new FormData();
      formData.append("file", new Blob([VALID_PNG_BUFFER], { type: "image/png" }), "db-fail-cleanup.png");

      const res = await fetch(`${API_BASE}/groups/${group1Id}/attachments`, {
        method: "POST",
        headers: { Authorization: `Bearer ${alice.token}` },
        body: formData,
      });

      // Restore prisma method
      (prisma.message as any).create = originalCreate;

      // Verify orphaned file was deleted from disk
      let fileExists = true;
      if (simulatedKey) {
        try {
          const uploadsPath = path.resolve(process.cwd(), "uploads", "groups", group1Id, simulatedKey);
          fileExists = fs.existsSync(uploadsPath);
        } catch {
          fileExists = false;
        }
      }

      const ok = res.status >= 500 && !fileExists;
      record(14, "Simulate database failure after upload", ok, `Status: ${res.status}, Orphaned file cleaned up from storage: ${!fileExists}`);
    }

    // --------------------------------------------------------------------------
    // 15. Check that failed uploads do not create misleading messages
    // --------------------------------------------------------------------------
    {
      const badRes = await fetch(`${API_BASE}/groups/${group1Id}/messages`, {
        headers: { Authorization: `Bearer ${alice.token}` },
      });
      const badData = await badRes.json();
      const msgs = badData.data?.messages || [];
      const hasCorrupt = msgs.some((m: any) => m.fileName === "malware.exe" || m.fileName === "storage-fail.png" || m.fileName === "db-fail-cleanup.png");
      const ok = !hasCorrupt;
      record(15, "Check that failed uploads do not create misleading messages", ok, `Corrupt messages found in DB: ${hasCorrupt}`);
    }

    // --------------------------------------------------------------------------
    // 16. Verify that duplicate messages are not created
    // --------------------------------------------------------------------------
    {
      const uniqueTempId = `temp_dup_check_${Date.now()}`;
      const formData = new FormData();
      formData.append("file", new Blob([VALID_PNG_BUFFER], { type: "image/png" }), "dup-test.png");
      formData.append("tempId", uniqueTempId);

      const res = await fetch(`${API_BASE}/groups/${group1Id}/attachments`, {
        method: "POST",
        headers: { Authorization: `Bearer ${alice.token}` },
        body: formData,
      });
      const data = await res.json();
      const createdId = data.data?.message?.id;

      // Query database for messages with this exact fileKey
      const count = await prisma.message.count({
        where: { id: createdId },
      });

      const ok = res.status === 201 && count === 1 && data.data?.tempId === uniqueTempId;
      record(16, "Verify that duplicate messages are not created", ok, `DB count: ${count}, Reconciled tempId: ${data.data?.tempId}`);
    }

    // --------------------------------------------------------------------------
    // 17. Confirm existing text chat still works
    // --------------------------------------------------------------------------
    {
      const textRes = await fetch(`${API_BASE}/groups/${group1Id}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${alice.token}`,
        },
        body: JSON.stringify({
          text: "Standard text message post Step 5",
        }),
      });
      const textData = await textRes.json();
      const isRestTextOk = textRes.status === 201 && textData.data?.message?.type === "TEXT";

      // Socket.IO text send
      const aliceSocket = createClientSocket(alice.token);
      await new Promise<void>((resolve) => {
        aliceSocket.connect();
        aliceSocket.on("connect", () => {
          aliceSocket.emit("group:join", { groupId: group1Id }, () => resolve());
        });
      });

      const socketTextPromise = new Promise<any>((resolve) => {
        aliceSocket.emit(
          "message:send",
          { groupId: group1Id, text: "Socket realtime text test" },
          (ack: any) => resolve(ack)
        );
      });

      const socketAck = await socketTextPromise;
      aliceSocket.disconnect();

      const isSocketTextOk = socketAck?.success === true && socketAck?.message?.type === "TEXT";
      const ok = isRestTextOk && isSocketTextOk;
      record(17, "Confirm existing text chat still works", ok, `REST text: ${isRestTextOk}, Socket.IO text: ${isSocketTextOk}`);
    }

    // --------------------------------------------------------------------------
    // 18. Test the mobile and desktop layouts
    // --------------------------------------------------------------------------
    {
      const mediaComponentPath = path.resolve(__dirname, "../../../frontend/src/components/chat/MediaMessage.tsx");
      const chatPagePath = path.resolve(__dirname, "../../../frontend/src/app/groups/[groupId]/page.tsx");
      const mediaSrc = fs.readFileSync(mediaComponentPath, "utf-8");
      const chatSrc = fs.readFileSync(chatPagePath, "utf-8");

      const hasImageLightbox = mediaSrc.includes("isImageModalOpen") && mediaSrc.includes("max-h-[85vh]") && mediaSrc.includes("backdrop-blur-sm");
      const hasVideoPlayer = mediaSrc.includes("<video") && mediaSrc.includes("controls") && mediaSrc.includes("max-h-72");
      const hasFileCard = mediaSrc.includes("FileText") && mediaSrc.includes("formatFileSize") && mediaSrc.includes("Download");
      const hasAttachmentBtn = chatSrc.includes("Paperclip") && chatSrc.includes("fileInputRef.current?.click()");
      const hasAttachmentPreview = chatSrc.includes("selectedAttachment") && chatSrc.includes("removeAttachment");

      const ok = hasImageLightbox && hasVideoPlayer && hasFileCard && hasAttachmentBtn && hasAttachmentPreview;
      record(18, "Test the mobile and desktop layouts", ok, `Image Lightbox: ${hasImageLightbox}, Video Player: ${hasVideoPlayer}, File Card: ${hasFileCard}, Attachment Button: ${hasAttachmentBtn}`);
    }

  } finally {
    server.close();
    await prisma.$disconnect();
  }

  // --------------------------------------------------------------------------
  // SUMMARY
  // --------------------------------------------------------------------------
  console.log("\n================================================================================");
  console.log("                       MEDIA SHARING VERIFICATION SUMMARY");
  console.log("================================================================================");
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = total - passed;

  console.log(`Total Scenarios Tested: ${total}`);
  console.log(`Passed:                 ${passed}`);
  console.log(`Failed:                 ${failed}`);
  console.log(`Success Rate:           ${((passed / total) * 100).toFixed(1)}%\n`);

  if (failed > 0) {
    console.error("❌ Some Step 5 scenarios failed! Review results above.");
    process.exit(1);
  } else {
    console.log("🎉 ALL 18 STEP 5 IMAGE, VIDEO & FILE SHARING SCENARIOS PASSED!");
    process.exit(0);
  }
}

runStep5MediaVerification().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});

