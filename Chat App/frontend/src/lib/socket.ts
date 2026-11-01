import { io, Socket } from "socket.io-client";

let socket: Socket | null = null;
let currentToken: string | null = null;

export function getSocketBaseUrl(): string {
  if (typeof window !== "undefined") {
    const hostname = window.location.hostname;
    if (hostname && hostname !== "localhost" && hostname !== "127.0.0.1") {
      return `${window.location.protocol}//${hostname}:5001`;
    }
  }
  return process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:5001";
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
