"use strict";

// Increment VERSION whenever any cached application file changes.
const VERSION = "0.1.2";
const PREFIX = `marriage-table:${self.registration.scope}:`;
const CACHE = `${PREFIX}${VERSION}`;
const url = (path) => new URL(path, self.registration.scope).href;
const SHELL = url("index.html");
const ASSETS = [
  "index.html", "style.css", "app.js", "pwa.js", "manifest.webmanifest",
  "icons/icon-192.png", "icons/icon-512.png",
  "icons/icon-maskable-512.png", "icons/apple-touch-icon.png"
].map(url);

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      cache.addAll(ASSETS.map((asset) => new Request(asset, { cache: "reload" })))
    )
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) =>
      key.startsWith(PREFIX) && key !== CACHE
    ).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const requested = new URL(event.request.url);
  requested.search = "";
  requested.hash = "";
  const isShell = event.request.mode === "navigate" &&
    [self.registration.scope, SHELL].includes(requested.href);
  if (!isShell && !ASSETS.includes(requested.href)) return;

  // One cache version keeps HTML, CSS and JavaScript consistent, online or offline.
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const key = isShell ? SHELL : requested.href;
    const response = await cache.match(key);
    if (response) return response;
    return fetch(event.request);
  })());
});

self.addEventListener("message", (event) => {
  if (event.data?.type !== "REQUEST_UPDATE") return;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({
      type: "window", includeUncontrolled: true
    });
    const appWindows = windows.filter((client) =>
      client.url.startsWith(self.registration.scope)
    );
    if (appWindows.length > 1) {
      event.source?.postMessage({ type: "UPDATE_BLOCKED" });
      return;
    }
    // Never force a new version onto several open games.
    await self.skipWaiting();
  })());
});
