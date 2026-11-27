import { webConfig } from "./config";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

let tokenProvider: () => string | null = () => null;

export function setTokenProvider(fn: () => string | null) {
  tokenProvider = fn;
}

async function request<T>(method: string, path: string, body?: unknown, init?: { auth?: boolean; signal?: AbortSignal }): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const token = init?.auth === false ? null : tokenProvider();
  if (token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${webConfig.apiBaseUrl}/v1${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: init?.signal });
  } catch {
    throw new ApiError("Can't reach the KAAFILA server. Check your connection.", 0);
  }

  const text = await res.text();
  const data = text ? safeJson(text) : null;
  if (!res.ok) {
    const message = (data && typeof data === "object" && "message" in data ? (data as { message: unknown }).message : null) ?? res.statusText;
    throw new ApiError(Array.isArray(message) ? message.join(", ") : String(message), res.status);
  }
  return data as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export const api = {
  get: <T>(path: string, init?: { auth?: boolean; signal?: AbortSignal }) => request<T>("GET", path, undefined, init),
  post: <T>(path: string, body?: unknown, init?: { auth?: boolean }) => request<T>("POST", path, body ?? {}, init),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body ?? {}),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body ?? {}),
  del: <T>(path: string, body?: unknown) => request<T>("DELETE", path, body)
};

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "Something went wrong";
}
