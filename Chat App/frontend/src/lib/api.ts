export function getApiBaseUrl(): string {
  // 1. Explicit production or custom environment variable takes highest priority
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL.replace(/\/+$/, "");
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
      return `${window.location.protocol}//${hostname}:5001/api`;
    }
  }

  // 3. Fallback to default local development backend
  return "http://localhost:5001/api";
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export async function fetchApi<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const apiBase = getApiBaseUrl();
  const url = `${apiBase}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;
  
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  const response = await fetch(url, {
    credentials: "include",
    ...options,
    headers,
  });

  const data = await response.json();
  return data as T;
}
