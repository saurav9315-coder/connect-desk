# Socket.IO Event Specification Document

## Project: Simple Group Chat with AI

**Status:** Approved Real-Time Specification  
**Gateway:** Socket.IO v4+ (WebSocket with polling fallback)  
**Lead Product Engineer:** Antigravity Team  

---

## 1. Connection & Authentication Lifecycle

### 1.1 Handshake Authentication
When connecting from the Next.js client, the user's JWT access token is passed in the `auth` payload:

```typescript
import { io } from "socket.io-client";

const socket = io(process.env.NEXT_PUBLIC_SOCKET_URL, {
  auth: {
    token: accessToken // Bearer JWT token string
  },
  transports: ["websocket", "polling"],
  reconnectionAttempts: 5,
  reconnectionDelay: 1000
});
```

### 1.2 Server Connection Middleware (`socketAuth.middleware.ts`)
- The server validates the JWT secret and retrieves the user record from the database.
- If the token is missing, expired, or corrupted, the handshake is aborted:
  `next(new Error("UNAUTHORIZED: Invalid credentials"))`.
- Upon success, `socket.data.user = { id, email, username, displayName }`.
- The user is automatically joined to their private socket room: `user:${user.id}` for direct user notifications.

---

## 2. Event Registry Summary

| Event Name | Direction | Payload Description | Auth Required |
| :--- | :---: | :--- | :---: |
| `join_group` | Client ➔ Server | Join room `group:${groupId}` | Yes (Membership checked) |
| `leave_group` | Client ➔ Server | Leave room `group:${groupId}` | Yes |
| `send_message` | Client ➔ Server | Publish text, media, or AI trigger | Yes (Membership checked) |
| `typing_start` | Client ➔ Server | Signal active typing state | Yes |
| `typing_stop` | Client ➔ Server | Clear active typing state | Yes |
| `new_message` | Server ➔ Client | Broadcast newly stored message | Yes |
| `ai_message_start` | Server ➔ Client | Signal AI is generating response | Yes |
| `ai_message_chunk` | Server ➔ Client | Optional token stream for AI response | Yes |
| `ai_message_complete`| Server ➔ Client | Broadcast completed AI response | Yes |
| `ai_error` | Server ➔ Client | Notify group if AI service fails | Yes |
| `user_typing` | Server ➔ Client | Broadcast typing member to group | Yes |
| `user_stopped_typing`| Server ➔ Client | Broadcast typing end to group | Yes |
| `member_joined` | Server ➔ Client | Broadcast new group member | Yes |
| `member_removed` | Server ➔ Client | Broadcast member departure/removal | Yes |
| `role_updated` | Server ➔ Client | Broadcast role elevation/demotion | Yes |
| `error` | Server ➔ Client | Dispatch standard error event | Yes |

---

## 3. Client-to-Server Events

### 3.1 `join_group`
Dispatched when user opens a chat view (`/chat/[groupId]`).

- **Payload:**
  ```typescript
  interface JoinGroupPayload {
    groupId: string;
  }
  ```
- **Acknowledgment Callback:**
  ```typescript
  type AckCallback = (response: {
    success: boolean;
    error?: string;
  }) => void;
  ```
- **Server Behavior:**
  1. Verifies caller is in `GroupMember` where `groupId = payload.groupId` and `userId = socket.data.user.id`.
  2. If unauthorized, invokes `ack({ success: false, error: "NOT_A_GROUP_MEMBER" })`.
  3. If authorized, invokes `socket.join("group:" + payload.groupId)` and `ack({ success: true })`.

### 3.2 `leave_group`
Dispatched when user navigates away from the active chat room.

- **Payload:**
  ```typescript
  interface LeaveGroupPayload {
    groupId: string;
  }
  ```
- **Server Behavior:**
  - Invokes `socket.leave("group:" + payload.groupId)`.

### 3.3 `send_message`
Dispatched when the user presses Send in the chat input.

- **Payload:**
  ```typescript
  interface SendMessagePayload {
    groupId: string;
    content?: string;
    messageType: "TEXT" | "IMAGE" | "VIDEO" | "FILE" | "AUDIO";
    mediaUrl?: string;
    mediaMetadata?: {
      fileName?: string;
      fileSize?: number;
      mimeType?: string;
      dimensions?: { width: number; height: number };
      durationSec?: number;
    };
    tempId: string; // Client optimistic message tracking UUID
  }
  ```
- **Acknowledgment Callback:**
  ```typescript
  type SendMessageAck = (response: {
    success: boolean;
    tempId: string;
    message?: MessageEntity;
    error?: string;
  }) => void;
  ```
- **Server Pipeline:**
  1. Authorize: Checks active membership in `GroupMember`.
  2. Sanitize & Validate: Validates payload with Zod schema.
  3. Persist: Stores message in MySQL with `senderId = socket.data.user.id` and `senderType = 'USER'`.
  4. Acknowledge: Returns `ack({ success: true, tempId, message: savedMessage })`.
  5. Broadcast: Emits `new_message` to `group:${groupId}`.
  6. AI Trigger Check: If `content` contains `@AI`:
     - Dispatches background AI worker.
     - Emits `ai_message_start` to `group:${groupId}`.

### 3.4 `typing_start` / `typing_stop`
- **Payload:** `{ groupId: string }`
- **Server Behavior:**
  - Emits `user_typing` or `user_stopped_typing` to `socket.to("group:" + groupId)`.

---

## 4. Server-to-Client Events

### 4.1 `new_message`
Broadcast to all sockets in room `group:${groupId}` when any member posts a message.

- **Payload:**
  ```typescript
  interface NewMessageEvent {
    message: {
      id: string;
      groupId: string;
      senderId: string | null;
      senderType: "USER" | "AI" | "SYSTEM";
      messageType: "TEXT" | "IMAGE" | "VIDEO" | "FILE" | "AUDIO";
      content: string | null;
      mediaUrl: string | null;
      mediaMetadata: any | null;
      createdAt: string;
      sender: {
        id: string;
        username: string;
        displayName: string;
        avatarUrl: string | null;
      } | null;
    };
  }
  ```

### 4.2 `@AI` Orchestration Events

#### 4.2.1 `ai_message_start`
Signals the client to show a visual thinking skeleton or "✦ AI is crafting an answer...".

- **Payload:**
  ```typescript
  interface AIMessageStartEvent {
    groupId: string;
    triggerMessageId: string;
    timestamp: string;
  }
  ```

#### 4.2.2 `ai_message_complete`
Broadcast once the AI service has finished generation and the response is safely committed to the database.

- **Payload:**
  ```typescript
  interface AIMessageCompleteEvent {
    groupId: string;
    message: {
      id: string;
      groupId: string;
      senderId: null;
      senderType: "AI";
      messageType: "TEXT";
      content: string; // Markdown formatted response containing code blocks
      mediaUrl: null;
      mediaMetadata: {
        codeLanguage?: string;
        hasCodeBlocks: boolean;
      };
      createdAt: string;
      sender: null;
    };
  }
  ```

#### 4.2.3 `ai_error`
Dispatched if the external AI service times out or errors, preventing infinite loading indicators.

- **Payload:**
  ```typescript
  interface AIErrorEvent {
    groupId: string;
    message: string; // Friendly error message
  }
  ```

### 4.3 `user_typing` & `user_stopped_typing`
- **Payload:**
  ```typescript
  interface UserTypingEvent {
    groupId: string;
    userId: string;
    displayName: string;
  }
  ```

### 4.4 Group Admin Events (`member_joined`, `member_removed`, `role_updated`)
- Notifies clients in real time when members are added, removed, or roles are elevated so the member list updates instantly without refreshing.

---

## 5. Reconnection & Optimistic UI Strategy

1. **Optimistic Updates:**
   - When a user sends a message, it is added immediately to the local UI state with a pending spinner and `tempId`.
   - When `send_message` ack returns, the optimistic message is updated with its real server-generated `id` and confirmed status.
2. **Reconnection Recovery:**
   - On reconnect, the client re-joins active rooms: `socket.emit("join_group", { groupId })`.
   - The client fetches recent messages via `GET /api/groups/:groupId/messages?after=<lastKnownTimestamp>` to reconcile any messages missed during disconnection.
