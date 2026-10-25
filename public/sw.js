/* App installation only. Never intercept or cache pages, APIs or documents. */
self.addEventListener("install", () => {
  self.skipWaiting();
});
self.addEventListener("activate", event => {
  event.waitUntil(self.clients.claim());
});
