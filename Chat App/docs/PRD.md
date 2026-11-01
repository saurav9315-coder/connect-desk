# Product Requirements Document (PRD)

## Project: Simple Group Chat with AI

**Status:** Approved Specification  
**Visual Reference:** Google Stitch Design System (Project ID: `9667751278078556107`)  
**Lead Product Engineer:** Antigravity Team  

---

## 1. Executive Summary & Vision

The **Simple Group Chat with AI** application is a focused, high-performance, and visually modern real-time group collaboration web app. Built around clean interaction patterns inspired by Google Stitch, the platform combines human group communication with a native conversational AI assistant (`@AI`) that participates directly inside group threads.

The core philosophy of this product is **radical simplicity and precision**: deliver an exceptional real-time group chat experience with rich media and an integrated AI assistant without bloated, secondary social features.

---

## 2. Scope & Boundaries

### 2.1 Strictly Required Features (14 Core Features)
1. **User Registration:** Simple account creation with email, username, display name, and password.
2. **User Login:** Secure authentication using JWT access tokens and persistent refresh tokens.
3. **Group List:** Real-time list of joined groups with last message snippet, timestamp, unread counts, and pinned status.
4. **Create Group:** Modal/screen to create a new group with name, optional description, avatar, and initial members.
5. **Group Chat:** Real-time group messaging surface with message history, member status, and message feed.
6. **Group Admin Controls:** Role-based group governance (Owner, Admin, Member) with member addition, removal, and role elevation.
7. **Text Messages:** Instant text exchange with markdown support and clean typography.
8. **Image Sharing:** In-line image preview, lightbox viewer, and optimized loading.
9. **Video Sharing:** Native video player with custom playback controls.
10. **File Sharing:** Generic document/archive attachments with file metadata, extension badges, and direct downloads.
11. **Voice Messages:** In-browser audio recording, playback with progress/waveform timeline, and duration indicators.
12. **Pin Group / Chat:** Per-user priority ordering to pin critical groups to the top of the group list.
13. **Block User:** Per-user blocking mechanism to ignore/suppress interactions and prevent unwanted group invitations.
14. **AI Assistant (`@AI` inside Group Chat):** Direct invocation of an AI assistant via `@AI` trigger within the normal group chat stream, featuring syntax-highlighted code blocks, copy actions, and formatted explanations.

### 2.2 Explicit Non-Goals (DO NOT ADD)
To maintain project focus, simplicity, and architectural purity, the following features are **explicitly prohibited**:
- ❌ **One-to-one private chat** (All communications occur within defined groups)
- ❌ **Stories or disappearing status updates**
- ❌ **User status / presence text beyond basic active state**
- ❌ **Channels, categories, or server hierarchies**
- ❌ **Communities / discovery directories**
- ❌ **Payments, tips, or subscriptions**
- ❌ **Voice calls or video calls (WebRTC conferencing)**
- ❌ **Social feeds, timeline posts, or wall interactions**
- ❌ **Message reaction systems (emojis, upvotes)**
- ❌ **Complex nested settings or administrative dashboards**
- ❌ **Client-side or backend execution of AI-generated code**

---

## 3. User Roles & Permissions

Authorization is strictly enforced on the backend for every API endpoint and Socket.IO event.

| Capability | Owner | Admin | Member | Blocked User (Towards Blocker) |
| :--- | :---: | :---: | :---: | :---: |
| Transfer Group Ownership | ✅ (Exclusive) | ❌ | ❌ | ❌ |
| Delete Group | ✅ (Exclusive) | ❌ | ❌ | ❌ |
| Manage Group Settings (Name, Avatar, Desc) | ✅ | ✅ | ❌ | ❌ |
| Promote Member to Admin | ✅ | ❌ | ❌ | ❌ |
| Demote Admin to Member | ✅ | ❌ | ❌ | ❌ |
| Remove Member from Group | ✅ | ✅ | ❌ | ❌ |
| Add Member to Group | ✅ | ✅ | ❌ (Unless open) | ❌ |
| Send Text, Media, Voice Messages | ✅ | ✅ | ✅ | Content filtered/collapsed |
| Invoke AI Assistant (`@AI`) | ✅ | ✅ | ✅ | Content filtered/collapsed |
| Pin Group (Personal View) | ✅ | ✅ | ✅ | ✅ |
| Block / Unblock Another User | ✅ | ✅ | ✅ | N/A |

---

## 4. Detailed Feature Specifications

### 4.1 User Registration & Login
- **Registration Flow:**
  - Fields: Email, Username (alphanumeric + underscores, 3-20 chars), Display Name, Password (min 8 chars, uppercase, lowercase, number).
  - Validation: Client-side instant feedback and server-side validation using Zod.
  - Initial avatar generated from user initials or customizable URL/upload.
- **Login Flow:**
  - Identification via email or username + password.
  - Response issues short-lived JWT Access Token (15 min) and persistent Refresh Token (7 days) stored in an HTTP-only, SameSite secure cookie or authorization payload.
  - Automatic token refresh on token expiry without user session disruption.

### 4.2 Group List & Group Pinning
- **Sidebar Presentation:**
  - Pinned groups occupy the top section of the group list with a distinct pin icon.
  - Unpinned groups are sorted by the timestamp of the latest message (`lastMessageAt`).
  - Each item displays: Group Avatar, Group Name, Last Message Sender, Last Message Snippet, Relative Timestamp (e.g., "12m", "Yesterday"), and Unread Badge count.
- **Pinning Action:**
  - Quick action via context menu or swipe/hover action: "Pin Group" / "Unpin Group".
  - Pinning is stored on a per-user basis (`GroupPin` relation), ensuring User A's pins do not affect User B.

### 4.3 Create Group
- **Creation Dialog:**
  - Required: Group Name (2-50 chars).
  - Optional: Group Description, Group Avatar upload.
  - Initial Member Selection: Searchable picker to add existing users into the group upon creation.
  - Creator is automatically assigned the `OWNER` role.

### 4.4 Group Chat Surface
- **Header:**
  - Group Avatar, Name, Member Count badge, and Group Info toggle.
  - Quick actions: Search messages, Admin settings menu (if Owner/Admin), Leave Group.
- **Message Stream:**
  - Infinite scroll / cursor-based pagination loading older messages upwards.
  - Date dividers separating message days.
  - Automatic scroll to bottom on new incoming messages with an unread badge if user is scrolled up.
  - Typing indicator bar: "Alex is typing...".

### 4.5 Group Admin Controls
- **Member Management Sheet:**
  - Tabbed or structured view of members classified by role (Owner, Admin, Member).
  - Actions for Owner: "Make Admin", "Demote to Member", "Transfer Ownership", "Remove from Group".
  - Actions for Admin: "Remove Member", "Add Member".
  - Non-admins can only view member list and select "Leave Group".

### 4.6 Rich Messaging (Text, Images, Videos, Files, Voice)
- **Message Bubble Layout:**
  - Outgoing messages (current user): Right-aligned, primary accent bubble, subtle delivery status.
  - Incoming messages (other members): Left-aligned, neutral card bubble, sender avatar and display name header.
- **Media Types:**
  1. **Text:** Clean typography, autolink URLs, basic markdown formatting (bold, italic, code).
  2. **Image Sharing:** Aspect-ratio preserved image grid/cards, click-to-expand lightbox, blurhash/placeholder while loading.
  3. **Video Sharing:** Streamable video container with play/pause, time scrubber, fullscreen toggle.
  4. **File Sharing:** Attachment card displaying file name, extension icon (PDF, ZIP, DOC, etc.), human-readable file size, and download button.
  5. **Voice Messages:** Inline audio recorder with record/cancel/send buttons. Player widget with waveform visualization, playback progress, and duration counter.

### 4.7 Block User
- **Mechanism:**
  - User can block any other user from their profile card or member list.
  - Persisted in `BlockedUser` table.
  - Behavior:
    - Messages sent by blocked users inside shared groups are collapsed by default with an option: *"Message from blocked user (Click to reveal)"*.
    - Blocked users cannot add the blocker to new groups.

### 4.8 AI Assistant (`@AI` in Group Chat)
- **Invocation & Flow:**
  - Any member types a message containing `@AI` (e.g., `@AI explain the difference between TCP and UDP with code`).
  - Backend parses the incoming message text for the `@AI` directive.
  - Backend persists the user's message immediately and emits it to all group members.
  - Backend creates a temporary typing/thinking state emitted via Socket.IO: `ai_message_start`.
  - Backend sends the conversation context (recent group history + prompt) to the abstracted AI service (`IAIService`).
  - AI response is received and stored in MySQL with `senderType = 'AI'`.
  - Final message is broadcasted via Socket.IO to the entire group (`new_message`).
- **AI Presentation & Code Formatting:**
  - Distinctive visual styling: Sleek AI badge (e.g., "✦ AI Assistant"), gradient or indigo border accent.
  - Full markdown parser rendering headings, bulleted lists, and formatted text.
  - **Code Blocks:**
    - Dark-themed syntax-highlighted containers with language label (e.g., `TypeScript`, `Python`, `SQL`).
    - One-click "Copy Code" button with clipboard confirmation tooltip.
  - **CRITICAL SECURITY REQUIREMENT:** AI-generated code is **STRICTLY DISPLAYED ONLY**. Under no circumstances is AI code evaluated, parsed by `eval()`, executed in Node child processes, or run against the database.

---

## 5. Visual Design Language (Google Stitch Alignment)

The design adheres strictly to the **Google Stitch** project (`9667751278078556107`) design system:
- **Color Palette:**
  - Background (Dark): `#0B0F19` (Canvas), `#111827` (Card / Surface), `#1F2937` (Subtle Borders).
  - Background (Light): `#F8FAFC` (Canvas), `#FFFFFF` (Card / Surface), `#E2E8F0` (Subtle Borders).
  - Accent / Primary: Electric Indigo / Blurple (`#6366F1` to `#4F46E5`), Hover (`#4338CA`).
  - AI Assistant Brand Accent: Gradient from Indigo (`#6366F1`) to Violet (`#8B5CF6`) with subtle glow.
  - Status Indicators: Emerald Green (`#10B981`) for active, Amber (`#F59E0B`) for typing.
- **Typography:** Modern geometric sans-serif (`Inter` or `Plus Jakarta Sans`), high legibility, strict typographic scale from `12px` (captions/timestamps) to `24px` (headers).
- **Surfaces & Borders:** 1px hairline borders (`rgba(255, 255, 255, 0.08)` in dark mode), subtle backdrop-filter blurs on headers and modals, rounded corners (`rounded-xl` for cards, `rounded-2xl` for message bubbles).
- **Responsive Layout:**
  - Desktop (>1024px): 3-column or 2-column view (Group Sidebar 320px, Active Chat flex-1, Collapsible Info Drawer 300px).
  - Tablet/Mobile (<1024px): Responsive drawer navigation with smooth slide transitions between group list and active chat.

---

## 6. Non-Functional Requirements

- **Real-Time Latency:** Message broadcast delivery under 100ms within local network / average under 250ms worldwide.
- **Security & Authorization:** Zero client trust; all permissions validated against the database session before executing actions.
- **Reliability:** Graceful reconnection with Socket.IO exponential backoff and message deduplication via client-side temporary IDs (`tempId`).
- **File Limits & Safety:** Image: max 10MB; Video: max 50MB; Audio: max 15MB; Documents: max 25MB. Server-side MIME validation and sanitization.
