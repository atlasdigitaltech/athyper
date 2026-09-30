/** Use normal saved DEV browser sessions. Never synthesizes grants, assurance or MFA evidence. */
import { request } from "@playwright/test";
export async function actor(name) {
  if (
    !["catl.admin", "catl.owner", "athyper.admin", "tksa.admin"].includes(name)
  )
    throw Error("Unsupported DEV acceptance actor");
  const origin = "https://neon.dev.athyper.test",
    client = await request.newContext({
      storageState: `tests/e2e/.auth/dev/neon/${name}.json`,
      ignoreHTTPSErrors: true,
    });
  const csrf = async () => {
    const state = await client.storageState();
    const cookie = state.cookies.find(
      (c) =>
        ["__Host-athyper-csrf", "athyper-csrf"].includes(c.name) &&
        c.domain === "neon.dev.athyper.test",
    );
    return cookie ? { "X-CSRF-Token": decodeURIComponent(cookie.value) } : {};
  };
  try {
    const sessionResponse = await client.get(origin + "/api/auth/session");
    if (!sessionResponse.ok() || !sessionResponse.headers()["content-type"]?.includes("application/json"))
      throw Error(`DEV session endpoint unavailable (${sessionResponse.status()}); this is not a login/MFA denial`);
    const session = await sessionResponse.json();
    if (session.state !== "authenticated")
      throw Error(`Refresh the normal ${name} login`);
    const refreshed = await client.post(origin + "/api/auth/refresh", {
      headers: { Origin: origin, ...(await csrf()) },
    });
    if (!refreshed.ok())
      throw Error(`Normal refresh failed for ${name}: ${refreshed.status()}`);
    return {
      dispose: () => client.dispose(),
      async call(path, body, commandHeaders = {}) {
        const response = await client.fetch(origin + "/api/relay/" + path, {
          method: body ? "POST" : "GET",
          headers: {
            Origin: origin,
            ...(await csrf()),
            ...(body?.idempotencyKey
              ? { "Idempotency-Key": body.idempotencyKey }
              : {}),
            ...(commandHeaders.idempotencyKey ? {"Idempotency-Key":commandHeaders.idempotencyKey} : {}),
            ...(commandHeaders.expectedVersion !== undefined ? {"If-Match":String(commandHeaders.expectedVersion)} : {}),
          },
          ...(body ? { data: body } : {}),
        });
        return {
          status: response.status(),
          body: await response.json().catch(() => null),
        };
      },
    };
  } catch (error) {
    await client.dispose();
    throw error;
  }
}
