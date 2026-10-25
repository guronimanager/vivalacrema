import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { loadTypeScript } from "./helpers/load-typescript.mjs";

test("PWA starts at role-aware sign-in and supplies installable PNG icons", () => {
  const manifest = loadTypeScript("src/app/manifest.ts").default();
  assert.equal(new URL(manifest.start_url, "https://example.test").pathname, "/giris");
  assert.equal(manifest.scope, "/");
  assert.equal(manifest.display, "standalone");
  assert.ok(manifest.icons.some(icon => icon.purpose === "maskable"));
  for (const icon of manifest.icons) {
    const png = fs.readFileSync(`public${icon.src}`);
    const expected = Number(icon.sizes.split("x")[0]);
    assert.equal(png.subarray(1, 4).toString(), "PNG");
    assert.equal(png.readUInt32BE(16), expected);
    assert.equal(png.readUInt32BE(20), expected);
  }
});
test("Service worker only handles lifecycle: no fetch interception or private-data cache", async () => {
  const listeners = new Map();
  let skips = 0, claims = 0;
  vm.runInNewContext(fs.readFileSync("public/sw.js", "utf8"), {
    self: {
      addEventListener: (event, handler) => listeners.set(event, handler),
      skipWaiting: () => { skips++; },
      clients: { claim: async () => { claims++; } },
    },
  });
  assert.deepEqual([...listeners.keys()], ["install", "activate"]);
  listeners.get("install")();
  let activation;
  listeners.get("activate")({ waitUntil: promise => { activation = promise; } });
  await activation;
  assert.equal(skips, 1);
  assert.equal(claims, 1);
});
test("Install metadata is public while anonymous financial APIs remain protected", async () => {
  const proxy = loadTypeScript("src/proxy.ts", {
    "@clerk/nextjs/server": { clerkMiddleware: handler => handler },
    "@/lib/users/auth": { portalIdentity: async () => null },
    "@/lib/onedrive/security": { sessionCookie: "owner-cookie" },
  }).default;
  for (const path of ["/manifest.webmanifest", "/sw.js", "/api/expenses", "/api/documents"]) {
    const url = new URL(path, "https://example.test");
    const request = new Request(url);
    request.nextUrl = url;
    request.cookies = { get: () => undefined };
    const response = await proxy(async () => ({ userId: null }), request);
    assert.equal(response.status, path.startsWith("/api/") ? 401 : 200);
  }
});
test("Worker response cannot be MIME-sniffed or served as a stale cached version", async () => {
  const config = loadTypeScript("next.config.ts").default;
  const worker = (await config.headers()).find(rule => rule.source === "/sw.js");
  const headers = Object.fromEntries(worker.headers.map(header => [header.key, header.value]));
  assert.match(headers["Cache-Control"], /no-store/);
  assert.equal(headers["X-Content-Type-Options"], "nosniff");
});

test("Public installation assets bypass the Clerk proxy matcher", () => {
  const { config } = loadTypeScript("src/proxy.ts", {
    "@clerk/nextjs/server": { clerkMiddleware: handler => handler },
    "@/lib/users/auth": { portalIdentity: async () => null },
    "@/lib/onedrive/security": { sessionCookie: "owner-cookie" },
  });
  const matchers = config.matcher.map(pattern => new RegExp(`^${pattern}$`));
  for (const path of ["/manifest.webmanifest", "/sw.js", "/icons/app-192.png"])
    assert.equal(matchers.some(pattern => pattern.test(path)), false);
  for (const path of ["/giderler", "/api/expenses", "/api/documents"])
    assert.equal(matchers.some(pattern => pattern.test(path)), true);
});
