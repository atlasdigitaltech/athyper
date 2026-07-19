self.addEventListener("push", (event) => {
  event.waitUntil(showLatestNotification(event));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(openNotificationTarget(event.notification.data));
});

const NOTIFICATION_FETCH_TIMEOUT_MS = 8_000;

async function showLatestNotification(event) {
  const pushData = readPushData(event);
  const latest = await fetchLatestNotification();
  const notification = buildNotification(pushData, latest);

  await self.registration.showNotification(notification.title, notification.options);
}

function readPushData(event) {
  if (!event.data) return null;

  try {
    return event.data.json();
  } catch {
    const text = event.data.text();
    return text ? { body: text } : null;
  }
}

async function fetchLatestNotification() {
  try {
    const response = await fetchWithTimeout("/api/relay/api/platform/notifications?limit=1&unread=true", {
      cache: "no-store",
      credentials: "include",
    }, NOTIFICATION_FETCH_TIMEOUT_MS);
    if (!response.ok) return null;

    const payload = await response.json();
    return Array.isArray(payload.data) ? payload.data[0] ?? null : null;
  } catch {
    return null;
  }
}

async function fetchWithTimeout(url, init, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

function buildNotification(pushData, latest) {
  const payload = isRecord(latest?.payload) ? latest.payload : {};
  const title = asText(pushData?.title)
    ?? asText(latest?.subject)
    ?? asText(payload.title)
    ?? "Athyper";
  const body = asText(pushData?.body)
    ?? asText(payload.rendered_text)
    ?? asText(payload.body)
    ?? asText(payload.message)
    ?? asText(latest?.event_code)
    ?? "You have a new notification";
  const url = toSameOriginPath(
    asText(pushData?.url)
      ?? asText(payload.action_url)
      ?? asText(payload.url)
      ?? "/notifications",
  );

  return {
    title,
    options: {
      body,
      icon: "/brand/appicon.png",
      badge: "/brand/icon.png",
      data: { url },
      tag: asText(latest?.id) ?? "athyper-notification",
    },
  };
}

async function openNotificationTarget(data) {
  const targetPath = toSameOriginPath(isRecord(data) ? asText(data.url) ?? "/notifications" : "/notifications");
  const targetUrl = new URL(targetPath, self.location.origin).href;
  const windows = await clients.matchAll({ type: "window", includeUncontrolled: true });

  for (const client of windows) {
    if (new URL(client.url).origin !== self.location.origin) continue;
    if ("navigate" in client) await client.navigate(targetUrl);
    if ("focus" in client) return client.focus();
  }

  return clients.openWindow(targetUrl);
}

function toSameOriginPath(value) {
  if (!value) return "/notifications";

  try {
    const url = new URL(value, self.location.origin);
    if (url.origin !== self.location.origin) return "/notifications";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/notifications";
  }
}

function asText(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isRecord(value) {
  return value != null && typeof value === "object" && !Array.isArray(value);
}
