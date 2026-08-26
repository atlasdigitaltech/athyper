export const notificationServiceWorkerSource = String.raw`
self.addEventListener("push", (event) => {
  let message = {};
  try { message = event.data ? event.data.json() : {}; } catch { message = {}; }
  const data = message && typeof message.data === "object" && message.data ? message.data : {};
  const title = typeof message.title === "string" && message.title ? message.title : "New activity";
  const body = typeof message.body === "string" ? message.body : "Open Activity Center to review this update.";
  const requestedHref = data.href || data.entity_url || data.action_url;
  const href = typeof requestedHref === "string" && requestedHref.startsWith("/") && !requestedHref.startsWith("//") && !requestedHref.includes("\\\\") ? requestedHref : "/notifications";
  event.waitUntil(self.registration.showNotification(title, {
    body,
    data: { href },
    tag: typeof (data.notificationId || data.notification_id) === "string" ? (data.notificationId || data.notification_id) : undefined,
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const requested = event.notification.data && event.notification.data.href;
  const target = new URL(typeof requested === "string" ? requested : "/notifications", self.location.origin);
  if (target.origin !== self.location.origin) target.pathname = "/notifications";
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (windows) => {
    for (const client of windows) {
      if ("navigate" in client) await client.navigate(target.href);
      if ("focus" in client) return client.focus();
    }
    return self.clients.openWindow ? self.clients.openWindow(target.href) : undefined;
  }));
});
`;
