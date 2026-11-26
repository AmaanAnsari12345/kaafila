export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/edge-health") {
      return Response.json({ status: "ok", edge: "cloudflare", at: new Date().toISOString() });
    }

    return fetch(request);
  }
};
