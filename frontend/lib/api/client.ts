import type { ApiError } from "@/types/api";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

export class ApiClientError extends Error {
  code: string;

  constructor(message: string, code: string = "UNKNOWN_ERROR") {
    super(message);
    this.name = "ApiClientError";
    this.code = code;
  }
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE_URL.replace(/\/$/, "")}/${endpoint.replace(/^\//, "")}`;

  const headers = new Headers(options.headers || {});
  if (!headers.has("Content-Type") && options.body && typeof options.body === "string") {
    headers.set("Content-Type", "application/json");
  }

  const config: RequestInit = {
    ...options,
    headers,
  };

  try {
    const response = await fetch(url, config);
    const contentType = response.headers.get("content-type");

    let data: unknown;
    if (contentType && contentType.includes("application/json")) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    if (!response.ok) {
      const errObj = data as { error?: ApiError; message?: string; code?: string };
      const message = errObj?.error?.message || errObj?.message || `HTTP ${response.status}: ${response.statusText}`;
      const code = errObj?.error?.code || errObj?.code || `HTTP_${response.status}`;
      throw new ApiClientError(message, code);
    }

    return data as T;
  } catch (error) {
    if (error instanceof ApiClientError) {
      throw error;
    }
    throw new ApiClientError(
      error instanceof Error ? error.message : "Network request failed",
      "NETWORK_ERROR"
    );
  }
}

export const apiClient = {
  get: <T>(endpoint: string, options?: RequestInit) =>
    request<T>(endpoint, { ...options, method: "GET" }),

  post: <T>(endpoint: string, body?: unknown, options?: RequestInit) =>
    request<T>(endpoint, {
      ...options,
      method: "POST",
      body: body ? JSON.stringify(body) : undefined,
    }),

  put: <T>(endpoint: string, body?: unknown, options?: RequestInit) =>
    request<T>(endpoint, {
      ...options,
      method: "PUT",
      body: body ? JSON.stringify(body) : undefined,
    }),

  patch: <T>(endpoint: string, body?: unknown, options?: RequestInit) =>
    request<T>(endpoint, {
      ...options,
      method: "PATCH",
      body: body ? JSON.stringify(body) : undefined,
    }),

  delete: <T>(endpoint: string, options?: RequestInit) =>
    request<T>(endpoint, { ...options, method: "DELETE" }),
};
