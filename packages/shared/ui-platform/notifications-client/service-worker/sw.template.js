self.addEventListener("push", (event) => {
  event.waitUntil(showNotification(event));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(openTarget(event.notification.data));
});

async function showNotification(event) {
  let pushed = {};
  try {
    pushed = event.data?.json() ?? {};
  } catch {
    pushed = { body: event.data?.text() ?? "" };
  }

  let latest = {};
  try {
    const response = await fetch("/api/relay/platform/notifications?limit=1&unread=true", {
      cache: "no-store",
      credentials: "include",
    });
    const payload = response.ok ? await response.json() : {};
    latest = Array.isArray(payload.data) ? payload.data[0] ?? {} : {};
  } catch {
    latest = {};
  }

  const title = text(pushed.title) ?? text(latest.title) ?? "Athyper";
  const body = text(pushed.body) ?? text(latest.body) ?? "You have a new notification";
  const url = notificationPath(pushed, latest);

  await self.registration.showNotification(title, {
    body,
    icon: "/brand/appicon.png",
    badge: "/brand/icon.png",
    data: { url },
    tag: text(latest.id) ?? "athyper-notification",
  });
}

function notificationPath(pushed, latest) {
  const target = latest?.payload?.target ?? pushed?.target;
  if (target && typeof target === "object") {
    const notificationPlane = text(latest.plane_key) ?? text(pushed.plane);
    const targetPlane = text(target.plane);
    if (!notificationPlane || targetPlane !== notificationPlane) return "/notifications";
    if (text(target.entityCode) && text(target.entityId)) {
      return `/app/${encodeURIComponent(target.entityCode)}/${encodeURIComponent(target.entityId)}`;
    }
    const route = text(target.routeName) ?? text(target.surface);
    const routes = {
      dashboard: "/dashboard",
      inbox: "/inbox",
      notifications: "/notifications",
      settings: "/settings",
      content: "/content",
      governance: "/governance",
      workbench: "/workbench",
    };
    return sameOriginPath(routes[route] ?? "/notifications");
  }
  return sameOriginPath(text(pushed.url) ?? text(latest.action_url) ?? "/notifications");
}

async function openTarget(data) {
  const path = sameOriginPath(data && typeof data === "object" ? text(data.url) : null);
  const target = new URL(path, self.location.origin).href;
  const windows = await clients.matchAll({ type: "window", includeUncontrolled: true });
  for (const client of windows) {
    if (new URL(client.url).origin !== self.location.origin) continue;
    if ("navigate" in client) await client.navigate(target);
    if ("focus" in client) return client.focus();
  }
  return clients.openWindow(target);
}

function sameOriginPath(value) {
  try {
    const url = new URL(value || "/notifications", self.location.origin);
    return url.origin === self.location.origin
      ? `${url.pathname}${url.search}${url.hash}`
      : "/notifications";
  } catch {
    return "/notifications";
  }
}

function text(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
