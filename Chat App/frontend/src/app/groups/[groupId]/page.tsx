"use client";

import { useEffect, useState, useRef, useCallback, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { getSocket } from "@/lib/socket";
import { getApiBaseUrl } from "@/lib/api";
import { GroupSidebar } from "@/components/groups/GroupSidebar";
import { GroupInfoModal } from "@/components/groups/GroupInfoModal";
import { MediaMessage } from "@/components/chat/MediaMessage";
import { AIMessageBubble } from "@/components/chat/AIMessageBubble";
import {
  ArrowLeft,
  Send,
  Paperclip,
  Mic,
  MoreVertical,
  Loader2,
  AlertCircle,
  Clock,
  ChevronUp,
  X,
  FileText,
  Trash2,
  Pin,
  UserX,
  Sparkles,
  Play,
  Pause,
  Square,
  Check,
  CheckCheck,
} from "lucide-react";

interface MessageSender {
  id: string;
  name: string;
  username: string;
  profileImage: string | null;
}

interface MessageReceiptItem {
  userId: string;
  deliveredAt: string | null;
  readAt: string | null;
}

interface MessageItem {
  id: string;
  groupId: string;
  senderId: string | null;
  sender?: MessageSender | null;
  type: "TEXT" | "IMAGE" | "VIDEO" | "FILE" | "VOICE" | "AI";
  content: string | null;
  fileUrl: string | null;
  fileKey?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
  mimeType?: string | null;
  duration?: number | null;
  fileInfo: any | null;
  isPinned: boolean;
  isBlockedSender?: boolean;
  createdAt: string;
  tempId?: string;
  status?: "SENT" | "DELIVERED" | "READ";
  receipts?: MessageReceiptItem[];
}

interface GroupSummary {
  id: string;
  name: string;
  description: string | null;
  avatarUrl: string | null;
  currentUserRole: "OWNER" | "ADMIN" | "MEMBER";
  memberCount: number;
  isPinned?: boolean;
}

interface SelectedAttachment {
  file: File;
  previewUrl: string;
  category: "IMAGE" | "VIDEO" | "FILE" | "VOICE";
  name: string;
  size: number;
}

const DANGEROUS_EXTS = [
  ".exe", ".bat", ".cmd", ".sh", ".bash", ".php", ".phtml", ".js", ".mjs",
  ".ts", ".py", ".pl", ".cgi", ".msi", ".dll", ".vbs", ".ps1", ".scr", ".jar", ".apk"
];

/**
 * Deduplicate an array of messages by canonical ID and tempId.
 * Guarantees that canonical (persisted) messages always take precedence over temporary placeholders,
 * and every rendered message has a stable, unique identifier.
 */
function deduplicateMessageList(list: MessageItem[]): MessageItem[] {
  // 1. Collect all canonical IDs and any canonical messages that carry a known tempId
  const canonicalIds = new Set<string>();
  const canonicalTempIds = new Set<string>();

  for (const msg of list) {
    if (!msg || !msg.id) continue;
    const isTemp = msg.id.startsWith("temp_");
    if (!isTemp) {
      canonicalIds.add(msg.id);
      if (msg.tempId) {
        canonicalTempIds.add(msg.tempId);
      }
    }
  }

  // 2. Filter and deduplicate: Drop any temp placeholder if its canonical counterpart exists
  const seenIds = new Set<string>();
  const seenTempIds = new Set<string>();
  const result: MessageItem[] = [];

  for (const msg of list) {
    if (!msg || !msg.id) continue;
    const isTemp = msg.id.startsWith("temp_");

    if (isTemp) {
      // If a canonical message for this temp placeholder is present, skip the temporary placeholder
      if (
        canonicalIds.has(msg.id) ||
        (msg.tempId && canonicalTempIds.has(msg.tempId))
      ) {
        continue;
      }
      if (seenIds.has(msg.id) || (msg.tempId && seenTempIds.has(msg.tempId))) {
        continue;
      }
    } else {
      if (seenIds.has(msg.id)) {
        continue;
      }
    }

    seenIds.add(msg.id);
    if (msg.tempId) {
      seenTempIds.add(msg.tempId);
    }
    result.push(msg);
  }

  return result;
}

/**
 * Reconcile and merge a newly received or confirmed message into the message list.
 * - Replaces any optimistic message matching tempId (or id === tempId) in place.
 * - Prioritizes canonical messages over temporary placeholders.
 * - Updates existing messages matching canonical ID without creating duplicate keys.
 * - Appends new messages and ensures strict uniqueness across all IDs.
 */
function mergeMessage(prev: MessageItem[], incoming: MessageItem): MessageItem[] {
  if (!incoming || !incoming.id) return prev;

  const targetTempId = incoming.tempId;
  const canonicalId = incoming.id;
  const isIncomingTemp = incoming.id.startsWith("temp_");

  if (!isIncomingTemp) {
    let replaced = false;
    const updated = prev.map((m) => {
      const isOptimisticTarget =
        (targetTempId && (m.tempId === targetTempId || m.id === targetTempId)) ||
        m.id === canonicalId ||
        (m.id.startsWith("temp_") &&
          m.senderId === incoming.senderId &&
          m.type === incoming.type &&
          m.content === incoming.content &&
          Math.abs(new Date(m.createdAt).getTime() - new Date(incoming.createdAt).getTime()) < 60000);

      if (isOptimisticTarget && !replaced) {
        replaced = true;
        return {
          ...m,
          ...incoming,
          id: canonicalId,
          tempId: undefined, // Clears temporary status so 'sending...' is removed
        };
      }
      return m;
    });

    if (replaced) {
      return deduplicateMessageList(updated);
    }

    const existingIndex = prev.findIndex((m) => m.id === canonicalId);
    if (existingIndex !== -1) {
      const next = [...prev];
      next[existingIndex] = {
        ...next[existingIndex],
        ...incoming,
        id: canonicalId,
        tempId: undefined,
      };
      return next;
    }

    return deduplicateMessageList([...prev, { ...incoming, tempId: undefined }]);
  }

  // Incoming is an optimistic temporary message
  if (prev.some((m) => m.id === incoming.id || (incoming.tempId && m.tempId === incoming.tempId))) {
    return prev;
  }
  return [...prev, incoming];
}

/**
 * Prepend older messages during pagination without duplicating existing IDs
 */
function mergeOlderMessages(prev: MessageItem[], older: MessageItem[]): MessageItem[] {
  const existingIds = new Set(prev.map((m) => m.id));
  const uniqueOlder = older.filter((m) => m && m.id && !existingIds.has(m.id));
  return [...uniqueOlder, ...prev];
}

export default function GroupChatPage({ params }: { params: Promise<{ groupId: string }> }) {
  const resolvedParams = use(params);
  const groupId = resolvedParams.groupId;

  const { user, accessToken, isLoading: isAuthLoading } = useAuth();
  const router = useRouter();

  const [group, setGroup] = useState<GroupSummary | null>(null);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [inputContent, setInputContent] = useState("");
  const [isLoadingMessages, setIsLoadingMessages] = useState(true);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<"connecting" | "connected" | "disconnected" | "reconnecting">("connecting");
  const [error, setError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Pinning & Blocked state
  const [isPinningGroup, setIsPinningGroup] = useState(false);
  const [revealedBlockedIds, setRevealedBlockedIds] = useState<string[]>([]);
  const [isAIThinking, setIsAIThinking] = useState(false);

  // Group Info Modal & Header Menu
  const [isInfoModalOpen, setIsInfoModalOpen] = useState(false);
  const [isHeaderMenuOpen, setIsHeaderMenuOpen] = useState(false);

  // Attachment State
  const [selectedAttachment, setSelectedAttachment] = useState<SelectedAttachment | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Voice Recording State
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recordedVoice, setRecordedVoice] = useState<{
    blob: Blob;
    url: string;
    duration: number;
    mimeType: string;
  } | null>(null);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messageContainerRef = useRef<HTMLDivElement>(null);

  // Redirect if unauthenticated
  useEffect(() => {
    if (!isAuthLoading && !user) {
      router.push("/login");
    }
  }, [user, isAuthLoading, router]);

  // Fetch Group Details
  const fetchGroupSummary = useCallback(async () => {
    if (!accessToken) return;
    try {
      const apiUrl = getApiBaseUrl();
      const res = await fetch(`${apiUrl}/groups/${groupId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.status === 403) {
        throw new Error("You are not a member of this group");
      }
      if (!res.ok) {
        throw new Error("Failed to load group details");
      }
      const json = await res.json();
      setGroup({
        id: json.data.group.id,
        name: json.data.group.name,
        description: json.data.group.description,
        avatarUrl: json.data.group.avatarUrl,
        currentUserRole: json.data.group.currentUserRole,
        memberCount: json.data.group.memberCount,
        isPinned: json.data.group.isPinned,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error loading group";
      setError(msg);
    }
  }, [groupId, accessToken]);

  const handleTogglePin = async () => {
    if (!accessToken || !group || isPinningGroup) return;
    setIsPinningGroup(true);
    setIsHeaderMenuOpen(false);
    try {
      const apiUrl = getApiBaseUrl();
      const method = group.isPinned ? "DELETE" : "POST";
      const res = await fetch(`${apiUrl}/groups/${groupId}/pin`, {
        method,
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error("Failed to update pin state");
      setGroup((prev) => (prev ? { ...prev, isPinned: !prev.isPinned } : null));
    } catch (err: any) {
      console.error("Pin toggle error:", err);
    } finally {
      setIsPinningGroup(false);
    }
  };

  const toggleRevealBlocked = (msgId: string) => {
    setRevealedBlockedIds((prev) =>
      prev.includes(msgId) ? prev.filter((id) => id !== msgId) : [...prev, msgId]
    );
  };

  // Fetch Initial Messages
  const fetchInitialMessages = useCallback(async () => {
    if (!accessToken) return;
    setIsLoadingMessages(true);
    try {
      const apiUrl = getApiBaseUrl();
      const res = await fetch(`${apiUrl}/groups/${groupId}/messages?limit=40`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) {
        throw new Error("Failed to load messages");
      }
      const json = await res.json();
      const loadedMessages: MessageItem[] = json.data.messages || [];
      setMessages(deduplicateMessageList(loadedMessages));
      setHasMore(json.data.hasMore || false);
      setNextCursor(json.data.nextCursor || null);

      // Acknowledge delivery for incoming messages from other group members
      const incomingIds = loadedMessages
        .filter((m) => m.senderId !== user?.id && m.id && !m.id.startsWith("temp_"))
        .map((m) => m.id);
      if (incomingIds.length > 0) {
        const socket = getSocket(accessToken);
        if (socket && socket.connected) {
          socket.emit("message:delivered", { groupId, messageIds: incomingIds });
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error loading messages";
      setError(msg);
    } finally {
      setIsLoadingMessages(false);
    }
  }, [groupId, accessToken, user?.id]);

  // Realtime WhatsApp-style read receipt tracking
  const readMessageIdsRef = useRef<Set<string>>(new Set());
  const pendingReadBatchRef = useRef<Set<string>>(new Set());
  const readTimerRef = useRef<NodeJS.Timeout | null>(null);

  const flushReadReceipts = useCallback(() => {
    if (!accessToken || !groupId) return;
    if (pendingReadBatchRef.current.size === 0) return;
    const idsToSend = Array.from(pendingReadBatchRef.current);
    pendingReadBatchRef.current.clear();

    const socket = getSocket(accessToken);
    if (socket && socket.connected) {
      socket.emit("message:read", { groupId, messageIds: idsToSend });
    }
  }, [accessToken, groupId]);

  const scheduleMarkRead = useCallback((messageId: string) => {
    if (readMessageIdsRef.current.has(messageId)) return;
    readMessageIdsRef.current.add(messageId);
    pendingReadBatchRef.current.add(messageId);

    if (readTimerRef.current) clearTimeout(readTimerRef.current);
    readTimerRef.current = setTimeout(() => {
      flushReadReceipts();
    }, 250);
  }, [flushReadReceipts]);

  // Track message visibility with IntersectionObserver to mark as read only when actually viewed in foreground
  useEffect(() => {
    if (!messageContainerRef.current) return;
    const container = messageContainerRef.current;

    const observer = new IntersectionObserver(
      (entries) => {
        if (typeof document !== "undefined" && document.visibilityState !== "visible") {
          return;
        }
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const msgId = entry.target.getAttribute("data-message-id");
            const senderId = entry.target.getAttribute("data-sender-id");
            if (msgId && senderId && senderId !== user?.id && !msgId.startsWith("temp_")) {
              scheduleMarkRead(msgId);
            }
          }
        }
      },
      {
        root: container,
        threshold: 0.5,
      }
    );

    const messageElements = container.querySelectorAll("[data-message-id]");
    messageElements.forEach((el) => observer.observe(el));

    const handleVisibilityOrFocus = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        const visibleElements = container.querySelectorAll("[data-message-id]");
        visibleElements.forEach((el) => {
          const rect = el.getBoundingClientRect();
          const containerRect = container.getBoundingClientRect();
          if (rect.top >= containerRect.top && rect.bottom <= containerRect.bottom) {
            const msgId = el.getAttribute("data-message-id");
            const senderId = el.getAttribute("data-sender-id");
            if (msgId && senderId && senderId !== user?.id && !msgId.startsWith("temp_")) {
              scheduleMarkRead(msgId);
            }
          }
        });
      }
    };

    window.addEventListener("focus", handleVisibilityOrFocus);
    document.addEventListener("visibilitychange", handleVisibilityOrFocus);

    return () => {
      observer.disconnect();
      window.removeEventListener("focus", handleVisibilityOrFocus);
      document.removeEventListener("visibilitychange", handleVisibilityOrFocus);
      if (readTimerRef.current) clearTimeout(readTimerRef.current);
    };
  }, [messages, user?.id, scheduleMarkRead]);

  // Fetch Older Messages (Pagination)
  const fetchOlderMessages = async () => {
    if (!accessToken || !hasMore || !nextCursor || isLoadingOlder) return;

    setIsLoadingOlder(true);
    try {
      const apiUrl = getApiBaseUrl();
      const res = await fetch(`${apiUrl}/groups/${groupId}/messages?cursor=${nextCursor}&limit=30`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error("Failed to load older messages");

      const json = await res.json();
      const olderMessages: MessageItem[] = json.data.messages || [];

      setMessages((prev) => mergeOlderMessages(prev, olderMessages));
      setHasMore(json.data.hasMore || false);
      setNextCursor(json.data.nextCursor || null);
    } catch (e) {
      console.error("Pagination error", e);
    } finally {
      setIsLoadingOlder(false);
    }
  };

  const scrollToBottom = (behavior: ScrollBehavior = "smooth") => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  useEffect(() => {
    if (accessToken) {
      fetchGroupSummary();
      fetchInitialMessages();
    }
  }, [accessToken, fetchGroupSummary, fetchInitialMessages]);

  useEffect(() => {
    if (!isLoadingMessages && messages.length > 0) {
      scrollToBottom("auto");
    }
  }, [isLoadingMessages, messages.length]);

  // Socket.IO Room Lifecycle & Realtime Listeners
  useEffect(() => {
    if (!accessToken || !groupId || isAuthLoading || !user) return;
    if (error === "You are not a member of this group") return;

    const socket = getSocket(accessToken);
    socket.connect();

    const handleConnect = () => {
      setConnectionStatus("connected");
      socket.emit("join_group", { groupId }, (res: any) => {
        if (!res?.success) {
          console.warn("Failed to join group room:", res?.error);
          if (typeof res?.error === "string" && res.error.toLowerCase().includes("not a member")) {
            setError("You are not a member of this group");
          }
        } else {
          // Acknowledge delivery for all incoming messages from others
          setMessages((current) => {
            const incomingIds = current
              .filter((m) => m.senderId !== user?.id && m.id && !m.id.startsWith("temp_"))
              .map((m) => m.id);
            if (incomingIds.length > 0) {
              socket.emit("message:delivered", { groupId, messageIds: incomingIds });
            }
            return current;
          });
        }
      });
    };

    const handleDisconnect = () => {
      setConnectionStatus("disconnected");
    };

    const handleConnectError = () => {
      setConnectionStatus("disconnected");
    };

    const handleReconnectAttempt = () => {
      setConnectionStatus("reconnecting");
    };

    const handleReconnect = () => {
      setConnectionStatus("connected");
      socket.emit("join_group", { groupId }, (res: any) => {
        if (!res?.success) {
          console.warn("Failed to join group room on reconnect:", res?.error);
        } else {
          setMessages((current) => {
            const incomingIds = current
              .filter((m) => m.senderId !== user?.id && m.id && !m.id.startsWith("temp_"))
              .map((m) => m.id);
            if (incomingIds.length > 0) {
              socket.emit("message:delivered", { groupId, messageIds: incomingIds });
            }
            return current;
          });
        }
      });
    };

    const handleNewMessage = (payload: any) => {
      if (!payload) return;
      const rawMsg: MessageItem | undefined = payload?.message || payload;
      if (!rawMsg || !rawMsg.id || rawMsg.groupId !== groupId) return;

      if (rawMsg.type === "AI") {
        setIsAIThinking(false);
      }

      // Immediately acknowledge delivery if incoming from another user
      if (rawMsg.senderId !== user?.id && !rawMsg.id.startsWith("temp_")) {
        socket.emit("message:delivered", { groupId, messageIds: [rawMsg.id] });
      }

      // Extract tempId from payload or message to reconcile optimistic UI
      const resolvedTempId =
        payload?.tempId ||
        rawMsg?.tempId ||
        payload?.message?.tempId ||
        undefined;

      const normalizedMsg: MessageItem = {
        ...rawMsg,
        tempId: resolvedTempId || rawMsg.tempId,
      };

      setMessages((prev) => mergeMessage(prev, normalizedMsg));
      setTimeout(() => scrollToBottom("smooth"), 50);
    };

    const handleReceiptUpdate = (update: any) => {
      if (!update || update.groupId !== groupId) return;
      setMessages((prev) =>
        prev.map((msg) => {
          if (msg.id === update.messageId) {
            return {
              ...msg,
              status: update.status || msg.status,
              receipts: update.receipts || msg.receipts,
            };
          }
          return msg;
        })
      );
    };

    const handleAIMessageStart = (data: { groupId: string }) => {
      if (data?.groupId === groupId) {
        setIsAIThinking(true);
        setTimeout(() => scrollToBottom("smooth"), 50);
      }
    };

    const handleAIMessageComplete = (data: { groupId: string }) => {
      if (data?.groupId === groupId) {
        setIsAIThinking(false);
      }
    };

    const handleAIError = (data: { groupId: string; message: string }) => {
      if (data?.groupId === groupId) {
        setIsAIThinking(false);
      }
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("connect_error", handleConnectError);
    socket.io.on("reconnect_attempt", handleReconnectAttempt);
    socket.io.on("reconnect", handleReconnect);
    socket.on("new_message", handleNewMessage);
    socket.on("message:new", handleNewMessage);
    socket.on("message:receipt:update", handleReceiptUpdate);
    socket.on("receipt_update", handleReceiptUpdate);
    socket.on("ai_message_start", handleAIMessageStart);
    socket.on("ai_message_complete", handleAIMessageComplete);
    socket.on("ai_error", handleAIError);

    if (socket.connected) {
      handleConnect();
    }

    return () => {
      socket.emit("group:leave", { groupId });
      socket.emit("leave_group", { groupId });
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("connect_error", handleConnectError);
      socket.io.off("reconnect_attempt", handleReconnectAttempt);
      socket.io.off("reconnect", handleReconnect);
      socket.off("new_message", handleNewMessage);
      socket.off("message:new", handleNewMessage);
      socket.off("message:receipt:update", handleReceiptUpdate);
      socket.off("receipt_update", handleReceiptUpdate);
      socket.off("ai_message_start", handleAIMessageStart);
      socket.off("ai_message_complete", handleAIMessageComplete);
      socket.off("ai_error", handleAIError);
    };
  }, [accessToken, groupId, isAuthLoading, user, error]);

  // File Selection Handler
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadError(null);
    const fileName = file.name.toLowerCase();
    const ext = fileName.includes(".") ? `.${fileName.split(".").pop()}` : "";

    if (DANGEROUS_EXTS.includes(ext)) {
      setUploadError(`File type '${ext}' is not permitted.`);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    let category: "IMAGE" | "VIDEO" | "FILE" | "VOICE" = "FILE";
    if (file.type.startsWith("image/")) {
      category = "IMAGE";
      if (file.size > 10 * 1024 * 1024) {
        setUploadError("Image size cannot exceed 10 MB.");
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }
    } else if (file.type.startsWith("video/")) {
      category = "VIDEO";
      if (file.size > 50 * 1024 * 1024) {
        setUploadError("Video size cannot exceed 50 MB.");
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }
    } else if (file.type.startsWith("audio/")) {
      category = "VOICE";
      if (file.size > 15 * 1024 * 1024) {
        setUploadError("Audio size cannot exceed 15 MB.");
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }
    } else {
      if (file.size > 25 * 1024 * 1024) {
        setUploadError("File size cannot exceed 25 MB.");
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }
    }

    const previewUrl = URL.createObjectURL(file);
    setSelectedAttachment({
      file,
      previewUrl,
      category,
      name: file.name,
      size: file.size,
    });

    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeAttachment = () => {
    if (selectedAttachment?.previewUrl) {
      URL.revokeObjectURL(selectedAttachment.previewUrl);
    }
    setSelectedAttachment(null);
    setUploadError(null);
  };

  const uploadFileToBackend = async (
    fileBlob: Blob | File,
    category: string,
    duration?: number,
    tempId?: string,
    text?: string
  ) => {
    const apiUrl = getApiBaseUrl();
    const formData = new FormData();
    formData.append("file", fileBlob);
    formData.append("category", category);
    if (duration !== undefined) {
      formData.append("duration", duration.toString());
    }
    if (tempId) {
      formData.append("tempId", tempId);
    }
    if (text) {
      formData.append("text", text);
      formData.append("content", text);
    }

    const res = await fetch(`${apiUrl}/groups/${groupId}/attachments`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: formData,
    });

    const json = await res.json();
    if (!res.ok) {
      throw new Error(json?.error?.message || json?.message || "File upload failed");
    }

    return json.data;
  };

  // Voice Recording Functions per PRD Step 6
  const startVoiceRecording = async () => {
    setUploadError(null);
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setUploadError("Voice recording is not supported in this browser.");
      return;
    }

    // Cancel any previous recording or preview
    cancelVoiceRecording();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      audioChunksRef.current = [];

      let chosenMime = "audio/webm";
      if (typeof MediaRecorder !== "undefined") {
        if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) chosenMime = "audio/webm;codecs=opus";
        else if (MediaRecorder.isTypeSupported("audio/webm")) chosenMime = "audio/webm";
        else if (MediaRecorder.isTypeSupported("audio/ogg;codecs=opus")) chosenMime = "audio/ogg;codecs=opus";
        else if (MediaRecorder.isTypeSupported("audio/mp4")) chosenMime = "audio/mp4";
      }

      const mediaRecorder = new MediaRecorder(stream, chosenMime ? { mimeType: chosenMime } : undefined);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.start(200);
      setIsRecordingVoice(true);
      setRecordingSeconds(0);
      setRecordedVoice(null);

      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => {
          if (prev >= 300) {
            stopVoiceRecording();
            return 300;
          }
          return prev + 1;
        });
      }, 1000);
    } catch (err: any) {
      console.error("Microphone access error:", err);
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        setUploadError("Microphone access was denied. Please allow microphone permissions.");
      } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
        setUploadError("No microphone found on this device.");
      } else {
        setUploadError("Unable to access microphone. Please check permissions.");
      }
    }
  };

  const stopVoiceRecording = () => {
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);

    const recorder = mediaRecorderRef.current;
    if (!recorder) return;

    const currentSecs = recordingSeconds;

    recorder.onstop = () => {
      // Release microphone tracks immediately
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;

      const mimeType = recorder.mimeType || "audio/webm";
      const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });

      if (audioBlob.size === 0) {
        setUploadError("Voice recording was empty. Please try again.");
        setIsRecordingVoice(false);
        setRecordingSeconds(0);
        return;
      }

      const url = URL.createObjectURL(audioBlob);
      setRecordedVoice({
        blob: audioBlob,
        url,
        duration: Math.max(currentSecs, 1),
        mimeType,
      });
      setIsRecordingVoice(false);
    };

    if (recorder.state !== "inactive") {
      recorder.stop();
    }
  };

  const cancelVoiceRecording = () => {
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;

    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
    }
    if (recordedVoice?.url) {
      URL.revokeObjectURL(recordedVoice.url);
    }
    setRecordedVoice(null);
    setIsPreviewPlaying(false);
    audioChunksRef.current = [];
    setIsRecordingVoice(false);
    setRecordingSeconds(0);
  };

  const togglePreviewPlay = () => {
    const audio = previewAudioRef.current;
    if (!audio) return;
    if (isPreviewPlaying) {
      audio.pause();
      setIsPreviewPlaying(false);
    } else {
      audio
        .play()
        .then(() => setIsPreviewPlaying(true))
        .catch(() => setIsPreviewPlaying(false));
    }
  };

  const sendVoiceMessage = async () => {
    if (!recordedVoice || !user || isSending) return;
    if (recordedVoice.blob.size === 0 || recordedVoice.duration < 0.5) {
      setUploadError("Voice message is too short or empty.");
      cancelVoiceRecording();
      return;
    }

    setIsSending(true);
    setUploadError(null);

    const voiceData = recordedVoice;
    const tempId = `temp_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    const optimisticMessage: MessageItem = {
      id: tempId,
      tempId,
      groupId,
      senderId: user.id,
      sender: {
        id: user.id,
        name: user.name,
        username: user.username,
        profileImage: user.profileImage,
      },
      type: "VOICE",
      content: null,
      fileUrl: voiceData.url,
      fileName: "voice-message.webm",
      fileSize: voiceData.blob.size,
      mimeType: voiceData.mimeType,
      duration: voiceData.duration,
      fileInfo: null,
      isPinned: false,
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, optimisticMessage]);
    setTimeout(() => scrollToBottom("smooth"), 50);

    // Clean up preview bar and return to composer immediately
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
    }
    setRecordedVoice(null);
    setIsPreviewPlaying(false);
    setIsRecordingVoice(false);
    setRecordingSeconds(0);

    try {
      const uploaded = await uploadFileToBackend(
        voiceData.blob,
        "VOICE",
        voiceData.duration,
        tempId
      );

      const confirmedVoice = uploaded?.message || (uploaded?.id ? uploaded : null);
      if (confirmedVoice) {
        setMessages((prev) =>
          mergeMessage(prev, { ...confirmedVoice, tempId })
        );
      }
    } catch (err: any) {
      console.error("Failed to send voice message:", err);
      setUploadError(err.message || "Failed to send voice note");
      setMessages((prev) => prev.filter((m) => m.tempId !== tempId));
    } finally {
      setIsSending(false);
    }
  };

  // Cleanup microphone tracks, audio preview, and recorded voice blob on unmount
  useEffect(() => {
    const previewAudio = previewAudioRef.current;
    const mediaStream = mediaStreamRef.current;
    const recordingTimer = recordingTimerRef.current;
    return () => {
      if (recordingTimer) clearInterval(recordingTimer);
      mediaStream?.getTracks().forEach((track) => track.stop());
      if (previewAudio) {
        previewAudio.pause();
      }
      if (recordedVoice?.url) {
        URL.revokeObjectURL(recordedVoice.url);
      }
    };
  }, [recordedVoice?.url]);

  // Send Message Handler
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const content = inputContent.trim();
    if ((!content && !selectedAttachment) || !user || isSending) return;

    setIsSending(true);
    setUploadError(null);

    // If an attachment is selected, upload and broadcast through the backend
    if (selectedAttachment) {
      const tempId = `temp_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      const attachmentCategory = selectedAttachment.category;
      const fileToSend = selectedAttachment.file;
      const previewUrl = selectedAttachment.previewUrl;
      const fileName = selectedAttachment.name;
      const fileSize = selectedAttachment.size;

      const optimisticMessage: MessageItem = {
        id: tempId,
        tempId,
        groupId,
        senderId: user.id,
        sender: {
          id: user.id,
          name: user.name,
          username: user.username,
          profileImage: user.profileImage,
        },
        type: attachmentCategory,
        content: content || null,
        fileUrl: previewUrl,
        fileName,
        fileSize,
        fileInfo: null,
        isPinned: false,
        createdAt: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, optimisticMessage]);
      setTimeout(() => scrollToBottom("smooth"), 50);

      setInputContent("");
      removeAttachment();

      try {
        const uploadedData = await uploadFileToBackend(
          fileToSend,
          attachmentCategory,
          undefined,
          tempId,
          content
        );

        const confirmedAttachment = uploadedData?.message || (uploadedData?.id ? uploadedData : null);
        if (confirmedAttachment) {
          setMessages((prev) =>
            mergeMessage(prev, { ...confirmedAttachment, tempId })
          );
        }
      } catch (err: any) {
        console.error("Failed to upload attachment:", err);
        setUploadError(err.message || "Failed to upload file");
        setMessages((prev) => prev.filter((m) => m.tempId !== tempId));
      } finally {
        setIsSending(false);
      }
      return;
    }

    // Standard text message flow
    const tempId = `temp_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const optimisticMessage: MessageItem = {
      id: tempId,
      tempId,
      groupId,
      senderId: user.id,
      sender: {
        id: user.id,
        name: user.name,
        username: user.username,
        profileImage: user.profileImage,
      },
      type: "TEXT",
      content: content || null,
      fileUrl: null,
      fileInfo: null,
      isPinned: false,
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, optimisticMessage]);
    setTimeout(() => scrollToBottom("smooth"), 50);
    setInputContent("");

    try {
      const socket = getSocket(accessToken || undefined);
      if (socket && socket.connected) {
        let ackCompleted = false;
        const ackTimeout = setTimeout(() => {
          if (!ackCompleted) {
            ackCompleted = true;
            console.warn("Socket ACK timed out, triggering REST fallback");
            fallbackRestSend(content, tempId);
          }
        }, 3500);

        socket.emit(
          "send_message",
          {
            groupId,
            content,
            text: content,
            type: "TEXT",
            tempId,
          },
          (response: any) => {
            if (ackCompleted) return;
            ackCompleted = true;
            clearTimeout(ackTimeout);
            setIsSending(false);
            const confirmedText = response?.message || response?.data || (response?.id ? response : null);
            if (response?.success && confirmedText) {
              setMessages((prev) =>
                mergeMessage(prev, { ...confirmedText, tempId })
              );
            } else {
              fallbackRestSend(content, tempId);
            }
          }
        );
      } else {
        await fallbackRestSend(content, tempId);
      }
    } catch (err: any) {
      console.error("Send error:", err);
      setUploadError(err.message || "Failed to send message");
      setIsSending(false);
      setMessages((prev) => prev.filter((m) => m.id !== tempId && m.tempId !== tempId));
    }
  };

  const fallbackRestSend = async (
    content?: string,
    tempId?: string,
    attachmentData?: any
  ) => {
    try {
      const apiUrl = getApiBaseUrl();
      const payload: any = {
        text: content || undefined,
        content: content || undefined,
        type: attachmentData?.type || "TEXT",
        tempId,
      };
      if (attachmentData?.fileUrl) payload.fileUrl = attachmentData.fileUrl;
      if (attachmentData?.fileKey) payload.fileKey = attachmentData.fileKey;
      if (attachmentData?.fileName) payload.fileName = attachmentData.fileName;
      if (attachmentData?.fileSize) payload.fileSize = attachmentData.fileSize;
      if (attachmentData?.mimeType) payload.mimeType = attachmentData.mimeType;
      if (attachmentData?.duration) payload.duration = attachmentData.duration;

      const res = await fetch(`${apiUrl}/groups/${groupId}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorJson = await res.json().catch(() => null);
        throw new Error(errorJson?.message || errorJson?.error?.message || "Failed to send message");
      }
      const json = await res.json();
      const confirmedMsg = json.data?.message || (json.data?.id ? json.data : null);
      if (confirmedMsg && tempId) {
        setMessages((prev) =>
          mergeMessage(prev, { ...confirmedMsg, tempId })
        );
      }
    } catch (err: any) {
      console.error("REST send fallback failed:", err);
      setUploadError(err?.message || "Failed to send message");
      if (tempId) {
        setMessages((prev) => prev.filter((m) => m.id !== tempId && m.tempId !== tempId));
      }
    } finally {
      setIsSending(false);
    }
  };

  const formatTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch {
      return "";
    }
  };

  const formatDateHeader = (isoString: string) => {
    try {
      const d = new Date(isoString);
      const today = new Date();
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      if (d.toDateString() === today.toDateString()) return "Today";
      if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
      return d.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: d.getFullYear() !== today.getFullYear() ? "numeric" : undefined,
      });
    } catch {
      return "";
    }
  };

  const formatRecordSec = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remSecs = secs % 60;
    return `${mins}:${remSecs.toString().padStart(2, "0")}`;
  };

  if (error) {
    return (
      <div className="h-screen bg-[#071A33] text-[#F8FAFC] flex flex-col items-center justify-center p-6 text-center">
        <div className="w-12 h-12 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center mb-4">
          <AlertCircle className="w-6 h-6" />
        </div>
        <h2 className="text-[18px] font-semibold text-white mb-2">Unable to Load Group Chat</h2>
        <p className="text-[13px] text-[#94A3B8] max-w-sm mb-6">{error}</p>
        <Link
          href="/"
          className="px-4 py-2 rounded-[10px] bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-medium text-[13px] transition-colors"
        >
          Back to Groups
        </Link>
      </div>
    );
  }

  return (
    <div className="flex h-screen max-h-[100dvh] bg-[#071A33] text-[#F8FAFC] overflow-hidden">
      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        onChange={handleFileSelect}
        className="hidden"
        accept="image/*,video/*,audio/*,.pdf,.txt,.csv,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.json,.md"
      />

      {/* DESKTOP AREA 1: Group List Sidebar (hidden on mobile, visible md+) per PRD Section 17 */}
      <div className="hidden md:flex w-[340px] lg:w-[380px] shrink-0 h-full flex-col">
        <GroupSidebar selectedGroupId={groupId} />
      </div>

      {/* DESKTOP AREA 2 / MOBILE FULL SCREEN: Group Chat Screen per PRD Section 9, 17, 18 */}
      <div className="flex-1 flex flex-col h-full w-full bg-[#081D38] overflow-hidden">
        {/* Header per PRD Section 9: Back button, Group avatar, Group name, Member count, Three-dot menu */}
        <header className="border-b border-[#19345A] bg-[#071A33] px-3 sm:px-4 py-2.5 flex items-center justify-between z-30 shrink-0 shadow-[inset_0_-1px_0_rgba(255,255,255,0.04)]">
          <div className="flex items-center gap-2.5 min-w-0">
            {/* Back Button (links to home / group list) */}
            <Link
              href="/"
              className="p-1.5 rounded-[10px] text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#0B2345] hover:shadow-[0_0_12px_rgba(56,189,248,0.2)] transition-all duration-200 hover:scale-105 active:scale-95 md:hidden"
              title="Back to Group List"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>

            {/* Group Avatar & Details */}
            <div
              onClick={() => setIsInfoModalOpen(true)}
              className="flex items-center gap-2.5 cursor-pointer group min-w-0"
              title="Click to view Group Info"
            >
              <div className="w-10 h-10 rounded-full bg-[#0B2345] border border-cyan-400/25 shadow-[0_4px_10px_rgba(0,0,0,0.35),inset_0_1px_2px_rgba(255,255,255,0.2)] flex items-center justify-center font-bold text-white text-sm shrink-0 overflow-hidden group-hover:border-cyan-400/40 group-hover:scale-[1.03] transition-all duration-200">
                {group?.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={group.avatarUrl} alt={group.name} className="w-full h-full object-cover" />
                ) : (
                  group?.name.slice(0, 2).toUpperCase() || "GC"
                )}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <h2 className="text-[16px] font-semibold text-[#F8FAFC] leading-tight truncate group-hover:text-[#60A5FA] transition-colors">
                    {group?.name || "Loading..."}
                  </h2>
                  {group?.isPinned && (
                    <Pin className="w-3 h-3 text-[#38BDF8] fill-current drop-shadow-[0_0_4px_rgba(56,189,248,0.4)] shrink-0" />
                  )}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <p className="text-[12px] text-[#94A3B8] leading-tight">
                    {group ? `${group.memberCount} ${group.memberCount === 1 ? "member" : "members"}` : "..."}
                  </p>
                  {connectionStatus === "disconnected" && (
                    <span className="inline-flex items-center gap-1 text-[11px] text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded-full font-medium shadow-[0_0_8px_rgba(251,191,36,0.15)]">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                      Disconnected
                    </span>
                  )}
                  {connectionStatus === "reconnecting" && (
                    <span className="inline-flex items-center gap-1 text-[11px] text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded-full font-medium shadow-[0_0_8px_rgba(96,165,250,0.15)]">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                      Reconnecting...
                    </span>
                  )}
                  {connectionStatus === "connected" && (
                    <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded-full font-medium shadow-[0_0_8px_rgba(52,211,153,0.15)]">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      Live
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Three-dot menu */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsHeaderMenuOpen(!isHeaderMenuOpen)}
              className="p-2 rounded-[10px] text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#0B2345] hover:shadow-[0_0_12px_rgba(56,189,248,0.2)] transition-all duration-200 hover:scale-105 active:scale-95 cursor-pointer"
              title="Group Menu"
            >
              <MoreVertical className="w-4 h-4" />
            </button>

            {isHeaderMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setIsHeaderMenuOpen(false)}
                />
                <div className="absolute right-0 top-10 z-50 w-44 rounded-[14px] bg-[#0B2345]/95 backdrop-blur-xl border border-cyan-400/20 p-1.5 shadow-[0_16px_36px_rgba(2,6,23,0.7),0_0_20px_rgba(56,189,248,0.1),inset_0_1px_1px_rgba(255,255,255,0.15)] space-y-1 animate-in fade-in text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      setIsHeaderMenuOpen(false);
                      setIsInfoModalOpen(true);
                    }}
                    className="w-full text-left px-3 py-2 rounded-[8px] hover:bg-[#071A33] text-[#F8FAFC] flex items-center gap-2 cursor-pointer transition-colors"
                  >
                    <span>Group Info</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleTogglePin}
                    disabled={isPinningGroup}
                    className="w-full text-left px-3 py-2 rounded-[8px] hover:bg-[#071A33] text-[#F8FAFC] flex items-center justify-between cursor-pointer transition-colors"
                  >
                    <span>{group?.isPinned ? "Unpin Group" : "Pin Group"}</span>
                    <Pin className={`w-3.5 h-3.5 ${group?.isPinned ? "text-[#38BDF8] fill-current drop-shadow-[0_0_4px_rgba(56,189,248,0.4)]" : "text-[#94A3B8]"}`} />
                  </button>
                </div>
              </>
            )}
          </div>
        </header>

        {/* Message Area per PRD Section 10 & 11 */}
        <div
          ref={messageContainerRef}
          className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-3 bg-[#081D38]"
        >
          {/* Older messages pagination */}
          {hasMore && (
            <div className="text-center pb-2">
              <button
                type="button"
                onClick={fetchOlderMessages}
                disabled={isLoadingOlder}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#0B2345] border border-[#19345A] text-[12px] text-[#94A3B8] hover:text-[#F8FAFC] transition-colors cursor-pointer disabled:opacity-50"
              >
                {isLoadingOlder ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Loading...</span>
                  </>
                ) : (
                  <>
                    <ChevronUp className="w-3.5 h-3.5" />
                    <span>Load older messages</span>
                  </>
                )}
              </button>
            </div>
          )}

          {isLoadingMessages ? (
            <div className="h-full flex flex-col items-center justify-center space-y-2 py-16">
              <Loader2 className="w-6 h-6 animate-spin text-[#3B82F6]" />
              <p className="text-[13px] text-[#94A3B8]">Loading conversation...</p>
            </div>
          ) : messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center py-20 space-y-2">
              <p className="font-semibold text-white text-[15px]">No messages yet</p>
              <p className="text-[13px] text-[#94A3B8]">Send a message or @AI prompt to start chatting</p>
            </div>
          ) : (
            (() => {
              const displayMessages = deduplicateMessageList(messages);
              return displayMessages.map((msg, index) => {
                const isMe = msg.senderId === user?.id;
                const isTemp = Boolean(msg.id && msg.id.startsWith("temp_"));

                const prevMsg = displayMessages[index - 1];
                const showDateHeader =
                  !prevMsg ||
                  new Date(prevMsg.createdAt).toDateString() !== new Date(msg.createdAt).toDateString();

                return (
                  <div key={msg.id || `msg-${index}`} className="space-y-3">
                  {/* Date separator */}
                  {showDateHeader && (
                    <div className="flex items-center justify-center my-3">
                      <span className="px-3 py-1 rounded-full bg-[#0B2345]/90 backdrop-blur-md border border-cyan-400/20 text-[11px] font-medium text-[#94A3B8] shadow-[0_2px_8px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.08)]">
                        {formatDateHeader(msg.createdAt)}
                      </span>
                    </div>
                  )}

                  {/* AI Response per PRD Section 13 */}
                  {msg.type === "AI" ? (
                    <AIMessageBubble content={msg.content || ""} createdAt={msg.createdAt} />
                  ) : (
                    /* User Message Row */
                    <div className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}>
                      {/* Sender Name on incoming group messages */}
                      {!isMe && (
                        <div className="flex items-center gap-1.5 mb-1 pl-1">
                          <span className="text-[12px] font-semibold text-[#60A5FA]">
                            {msg.sender?.name || "Member"}
                          </span>
                        </div>
                      )}

                      {/* Blocked sender indicator */}
                      {msg.isBlockedSender && !revealedBlockedIds.includes(msg.id) ? (
                        <div className="rounded-[12px] px-3.5 py-2 bg-[#0B2345]/85 backdrop-blur-md border border-rose-500/30 text-xs text-[#94A3B8] flex items-center justify-between gap-3 max-w-sm shadow-[0_4px_12px_rgba(0,0,0,0.3)]">
                          <div className="flex items-center gap-1.5">
                            <UserX className="w-3.5 h-3.5 text-rose-400" />
                            <span>Message from blocked user</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => toggleRevealBlocked(msg.id)}
                            className="text-xs text-[#38BDF8] hover:text-[#60A5FA] font-medium cursor-pointer"
                          >
                            Reveal
                          </button>
                        </div>
                      ) : (
                        /* Message Bubble per PRD Section 11 with 3D Depth & Liquid Glass */
                        <div
                          data-message-id={msg.id}
                          data-sender-id={msg.senderId || ""}
                          className={`max-w-[80%] sm:max-w-[70%] rounded-[16px] px-3.5 py-2.5 text-[15px] transition-all duration-200 ${
                            isMe
                              ? "bg-gradient-to-br from-[#2563EB] via-[#225CD8] to-[#1D4ED8] text-[#F8FAFC] rounded-tr-sm border border-cyan-400/25 shadow-[0_4px_16px_rgba(37,99,235,0.35),inset_0_1px_1px_rgba(255,255,255,0.3)]"
                              : "bg-[#0B2345]/90 backdrop-blur-md border border-white/[0.08] text-[#F8FAFC] rounded-tl-sm shadow-[0_4px_16px_rgba(0,0,0,0.35),inset_0_1px_1px_rgba(255,255,255,0.1)]"
                          } ${isTemp ? "opacity-75" : ""}`}
                        >
                          {/* Media attachments */}
                          {msg.type !== "TEXT" && (
                            <MediaMessage
                              type={msg.type}
                              fileUrl={msg.fileUrl}
                              fileName={msg.fileName}
                              fileSize={msg.fileSize}
                              duration={msg.duration}
                              isMe={isMe}
                              accessToken={accessToken}
                            />
                          )}

                          {/* Message Text */}
                          {msg.content && (
                            <p className="whitespace-pre-wrap break-words leading-relaxed text-[15px]">
                              {msg.content}
                            </p>
                          )}

                          {/* Timestamp and Realtime WhatsApp-style Status Ticks */}
                          <div
                            className={`flex items-center justify-end gap-1 mt-1 text-[11px] ${
                              isMe ? "text-white/80" : "text-[#94A3B8]"
                            }`}
                          >
                            <span>{formatTime(msg.createdAt)}</span>
                            {isTemp ? (
                              <span className="italic text-[10px]">sending...</span>
                            ) : (
                              isMe && (
                                <span
                                  className="inline-flex items-center ml-0.5 select-none"
                                  title={
                                    msg.status === "READ"
                                      ? "Read by all members"
                                      : msg.status === "DELIVERED"
                                      ? "Delivered to all members"
                                      : "Sent"
                                  }
                                >
                                  {msg.status === "READ" ? (
                                    <CheckCheck className="w-3.5 h-3.5 text-[#38BDF8]" />
                                  ) : msg.status === "DELIVERED" ? (
                                    <CheckCheck className="w-3.5 h-3.5 text-[#94A3B8]" />
                                  ) : (
                                    <Check className="w-3.5 h-3.5 text-[#94A3B8]" />
                                  )}
                                </span>
                              )
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            });
          })()
          )}

          {/* AI Thinking Indicator */}
          {isAIThinking && (
            <div className="flex items-start gap-2.5 my-2 animate-in fade-in">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#3B82F6] via-[#2563EB] to-[#1D4ED8] border border-cyan-400/30 flex items-center justify-center text-white shrink-0 shadow-[0_4px_12px_rgba(37,99,235,0.4)]">
                <Sparkles className="w-4 h-4 animate-pulse text-cyan-200" />
              </div>
              <div className="bg-[#0B2345]/90 backdrop-blur-md border border-cyan-400/20 rounded-[14px] rounded-tl-sm px-3.5 py-2.5 text-xs text-[#CBD5E1] flex items-center gap-2 shadow-[0_4px_14px_rgba(0,0,0,0.35)]">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-[#38BDF8]" />
                <span className="font-medium text-[#60A5FA]">AI Assistant is thinking...</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Message Composer per PRD Section 12 */}
        <footer className="border-t border-[#19345A] bg-[#071A33] px-3 sm:px-4 py-2.5 z-30 shrink-0">
          <div className="space-y-2">
            {/* Error Notice */}
            {uploadError && (
              <div className="p-2 rounded-[10px] bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center justify-between animate-in fade-in">
                <span className="flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                  {uploadError}
                </span>
                <button
                  type="button"
                  onClick={() => setUploadError(null)}
                  className="text-rose-400 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Selected Attachment Chip */}
            {selectedAttachment && (
              <div className="flex items-center justify-between p-2 rounded-[10px] bg-[#0B2345] border border-[#19345A] animate-in fade-in">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-9 h-9 rounded-[8px] bg-[#071A33] border border-[#19345A] text-[#60A5FA] flex items-center justify-center shrink-0">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-white truncate max-w-[200px] sm:max-w-md">
                      {selectedAttachment.name}
                    </p>
                    <p className="text-[11px] text-[#94A3B8]">
                      {(selectedAttachment.size / (1024 * 1024)).toFixed(2)} MB • {selectedAttachment.category}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={removeAttachment}
                  className="p-1 rounded text-[#94A3B8] hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Active Voice Recording Bar (While Recording per PRD Section 4) */}
            {isRecordingVoice ? (
              <div className="flex items-center justify-between bg-rose-950/30 border border-rose-500/30 px-3.5 py-2 rounded-[10px] animate-in fade-in">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse" />
                  <span className="text-xs font-medium text-rose-300">
                    Recording: {formatRecordSec(recordingSeconds)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={cancelVoiceRecording}
                    className="px-2.5 py-1 rounded-[8px] bg-[#0B2345] hover:bg-[#19345A] text-[#94A3B8] text-xs flex items-center gap-1 cursor-pointer"
                    title="Cancel recording"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                    <span>Cancel</span>
                  </button>
                  <button
                    type="button"
                    onClick={stopVoiceRecording}
                    className="px-3 py-1 rounded-[8px] bg-rose-600 hover:bg-rose-700 text-white text-xs font-medium flex items-center gap-1 cursor-pointer"
                    title="Stop recording"
                  >
                    <Square className="w-3 h-3 fill-current" />
                    <span>Stop</span>
                  </button>
                </div>
              </div>
            ) : recordedVoice ? (
              /* Voice Recording Preview Bar (After Recording per PRD Section 4) */
              <div className="flex items-center justify-between bg-[#0B2345] border border-[#2563EB]/40 px-3.5 py-2 rounded-[10px] animate-in fade-in">
                <div className="flex items-center gap-3">
                  <audio
                    ref={previewAudioRef}
                    src={recordedVoice.url}
                    onEnded={() => setIsPreviewPlaying(false)}
                    preload="metadata"
                  />
                  <button
                    type="button"
                    onClick={togglePreviewPlay}
                    className="w-7 h-7 rounded-full bg-[#2563EB] hover:bg-[#1D4ED8] text-white flex items-center justify-center cursor-pointer shadow-sm"
                    title={isPreviewPlaying ? "Pause preview" : "Play preview"}
                  >
                    {isPreviewPlaying ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current ml-0.5" />}
                  </button>
                  <div className="text-xs text-[#CBD5E1] flex items-center gap-1.5">
                    <Mic className="w-3.5 h-3.5 text-[#60A5FA]" />
                    <span>Voice note ({formatRecordSec(recordedVoice.duration)})</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={cancelVoiceRecording}
                    disabled={isSending}
                    className="px-2.5 py-1 rounded-[8px] bg-[#071A33] hover:bg-[#19345A] text-[#94A3B8] text-xs flex items-center gap-1 cursor-pointer"
                    title="Discard recording"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                    <span>Discard</span>
                  </button>
                  <button
                    type="button"
                    onClick={sendVoiceMessage}
                    disabled={isSending}
                    className="px-3 py-1 rounded-[8px] bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-medium flex items-center gap-1 cursor-pointer"
                    title="Send voice message"
                  >
                    {isSending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                    <span>Send</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-1.5">
                {/* @AI Indicator per PRD Section 13 */}
                {inputContent.toLowerCase().includes("@ai") && (
                  <div className="flex items-center gap-1.5 px-3 py-1 bg-[#0B2345]/90 backdrop-blur-md border border-cyan-400/30 rounded-[10px] text-xs text-[#60A5FA] shadow-[0_2px_10px_rgba(56,189,248,0.15)] animate-in fade-in">
                    <Sparkles className="w-3 h-3 text-[#38BDF8]" />
                    <span className="font-semibold text-white">AI Assistant</span>
                    <span className="text-[#94A3B8] text-[11px] truncate">
                      — Ask questions or code prompts directly in chat
                    </span>
                  </div>
                )}

                {/* Structure per PRD Section 12: Attachment -> Text Input -> Voice -> Send */}
                <form onSubmit={handleSendMessage} className="flex items-center gap-2">
                  {/* Hidden File Input for Image, Video & Documents */}
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileSelect}
                    className="hidden"
                    accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.tar,.gz,.json,.md"
                  />

                  {/* 1. Attachment */}
                  <button
                    type="button"
                    disabled={isSending}
                    onClick={() => fileInputRef.current?.click()}
                    className="p-2 rounded-[10px] text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#0B2345] hover:shadow-[0_0_12px_rgba(56,189,248,0.2)] transition-all duration-200 hover:scale-105 active:scale-95 cursor-pointer shrink-0 disabled:opacity-50"
                    title="Attach image, video or document"
                  >
                    <Paperclip className="w-4 h-4" />
                  </button>

                  {/* 2. Text Input with Glassmorphism Depth */}
                  <input
                    type="text"
                    value={inputContent}
                    onChange={(e) => setInputContent(e.target.value)}
                    placeholder="Type a message..."
                    className="flex-1 rounded-[10px] bg-[#0B2345]/85 backdrop-blur-md border border-[#19345A] focus:border-[#38BDF8] px-3.5 py-2 text-[15px] text-[#F8FAFC] placeholder-[#94A3B8]/60 focus:outline-none focus:ring-1 focus:ring-[#38BDF8]/40 shadow-[inset_0_2px_4px_rgba(0,0,0,0.35)] focus:shadow-[0_0_16px_rgba(56,189,248,0.22)] transition-all duration-200"
                  />

                  {/* 3. Voice Recording Button */}
                  <button
                    type="button"
                    disabled={isSending || !!selectedAttachment}
                    onClick={startVoiceRecording}
                    className="p-2 rounded-[10px] text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#0B2345] hover:shadow-[0_0_12px_rgba(56,189,248,0.2)] transition-all duration-200 hover:scale-105 active:scale-95 cursor-pointer shrink-0 disabled:opacity-40"
                    title="Record voice message"
                  >
                    <Mic className="w-4 h-4" />
                  </button>

                  {/* 4. Send - 3D Blue Button */}
                  <button
                    type="submit"
                    disabled={(!inputContent.trim() && !selectedAttachment) || isSending}
                    className="p-2 rounded-[10px] bg-gradient-to-b from-[#3B82F6] via-[#2563EB] to-[#1D4ED8] border border-cyan-400/30 text-white font-medium shadow-[0_4px_14px_rgba(37,99,235,0.4),inset_0_1px_1px_rgba(255,255,255,0.35)] hover:shadow-[0_6px_20px_rgba(37,99,235,0.6),0_0_14px_rgba(56,189,248,0.4)] hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 disabled:opacity-40 disabled:hover:translate-y-0 disabled:hover:shadow-none cursor-pointer shrink-0 flex items-center justify-center"
                    title="Send"
                  >
                    {isSending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                  </button>
                </form>
              </div>
            )}
          </div>
        </footer>
      </div>

      {/* Group Info Modal */}
      <GroupInfoModal
        groupId={groupId}
        isOpen={isInfoModalOpen}
        onClose={() => setIsInfoModalOpen(false)}
        onGroupUpdated={fetchGroupSummary}
      />
    </div>
  );
}
