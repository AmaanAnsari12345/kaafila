export class UpstreamError extends Error {
  constructor(
    message: string,
    readonly status?: number
  ) {
    super(message);
  }
}

export async function fetchJson<T>(url: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? 8000);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new UpstreamError(`${new URL(url).host} responded ${res.status}: ${body.slice(0, 200)}`, res.status);
    }
    return (await res.json()) as T;
  } catch (err) {
    if (err instanceof UpstreamError) throw err;
    throw new UpstreamError(`${new URL(url).host} request failed: ${(err as Error).message}`);
  } finally {
    clearTimeout(timer);
  }
}
