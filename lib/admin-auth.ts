/** Gate the entire Worker, including APIs, QR images and Next/RSC requests. */
export async function authorizeAdmin(request: Request, env: Record<string, unknown>): Promise<Response | null> {
  const headers = { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" };
  const password = env.ADMIN_PASSWORD;
  const username = typeof env.ADMIN_USERNAME === "string" ? env.ADMIN_USERNAME : "admin";
  if (typeof password !== "string" || password.length < 16) {
    return new Response("Admin access is not configured. Set ADMIN_PASSWORD (at least 16 characters).", { status: 503, headers });
  }
  let credentials = "";
  const authorization = request.headers.get("Authorization") || "";
  if (/^Basic /i.test(authorization)) {
    try { credentials = atob(authorization.slice(6)); } catch { /* reject malformed credentials */ }
  }
  const digest = async (text: string) => new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
  const [actual, expected] = await Promise.all([digest(credentials), digest(`${username}:${password}`)]);
  let different = 0;
  for (let i = 0; i < expected.length; i++) different |= actual[i] ^ expected[i];
  if (different !== 0) {
    return new Response("Admin sign-in required.", {
      status: 401,
      headers: { ...headers, "WWW-Authenticate": 'Basic realm="D3 Admin", charset="UTF-8"' },
    });
  }
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    const origin = request.headers.get("Origin");
    if ((origin && origin !== new URL(request.url).origin) || request.headers.get("Sec-Fetch-Site") === "cross-site") {
      return new Response("Cross-origin admin request denied.", { status: 403, headers });
    }
  }
  return null;
}
