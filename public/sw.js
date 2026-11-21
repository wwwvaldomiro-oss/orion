/* Órion Service Worker — Escopo de notificações e ações de alarme na Agenda */
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("notificationclick", (event) => {
  const action = event.action || "open";
  const data = (event.notification && event.notification.data) || {};
  const alarmId = data.alarmId ? String(data.alarmId) : "";
  event.notification.close();

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientsList) => {
      const targetUrl = alarmId
        ? `/agenda?alarm=${encodeURIComponent(alarmId)}&action=${encodeURIComponent(action)}`
        : "/agenda";

      for (const client of clientsList) {
        if ("focus" in client) {
          client.postMessage({
            type: "ORION_ALARM_NOTIFICATION_ACTION",
            alarmId,
            action,
          });
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
      return undefined;
    }),
  );
});
