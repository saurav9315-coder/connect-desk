import { io, Socket } from "socket.io-client";

let socket: Socket | null = null;
let currentToken: string | null = null;

export function getSocketBaseUrl(): string {
  // 1. Explicit production or custom environment variable takes highest priority
  if (process.env.NEXT_PUBLIC_SOCKET_URL) {
    return process.env.NEXT_PUBLIC_SOCKET_URL.replace(/\/+$/, "");
  }

  // 2. Client-side browser runtime resolution
  if (typeof window !== "undefined") {
    const hostname = window.location.hostname;
    // Support local network / phone testing over LAN
    const isLanIp =
      hostname.startsWith("192.168.") ||
      hostname.startsWith("10.") ||
      hostname.startsWith("172.") ||
      hostname.endsWith(".local");

    if (isLanIp) {
      return `${window.location.protocol}//${hostname}:5001`;
    }
  }

  // 3. Fallback to default local development backend
  return "http://localhost:5001";
}

export const getSocket = (token?: string): Socket => {
  const socketUrl = getSocketBaseUrl();

  if (!socket) {
    currentToken = token || null;
    socket = io(socketUrl, {
      auth: token ? { token } : {},
      autoConnect: false,
      transports: ["websocket", "polling"],
    });
    return socket;
  }

  // If token has changed (e.g. user logged in as another user, or session refreshed)
  if (token && token !== currentToken) {
    const wasConnected = socket.connected;
    currentToken = token;
    socket.auth = { token };
    if (wasConnected) {
      socket.disconnect();
      socket.connect();
    }
  }

  return socket;
};

export const disconnectSocket = (): void => {
  if (socket) {
    socket.disconnect();
    socket = null;
    currentToken = null;
  }
};
