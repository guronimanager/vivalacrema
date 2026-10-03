import test from "node:test";
import assert from "node:assert/strict";
import { loadTypeScript } from "./helpers/load-typescript.mjs";
const {
  canAccess,
  defaults,
  validPermissions,
  moduleForPath,
  landing,
  modules,
} = loadTypeScript("src/lib/users/permissions.ts");
test("Administrators can manage all modules; staff has no financial access by default", () => {
  for (const area of Object.keys(modules)) {
    assert.equal(
      canAccess({ role: "ADMIN", permissions: {} }, area, true),
      true,
    );
    assert.equal(canAccess({ role: "STAFF", permissions: {} }, area), false);
  }
  assert.equal(landing({ role: "STAFF", permissions: {} }), "/evraklarim");
});
test("Read-only grants deny every mutation; write grants permit read and write", () => {
  const user = {
    role: "STAFF",
    permissions: { expenses: "READ", bank: "WRITE" },
  };
  assert.equal(canAccess(user, "expenses"), true);
  assert.equal(canAccess(user, "expenses", true), false);
  assert.equal(canAccess(user, "bank", true), true);
  assert.equal(canAccess(user, "users"), false);
  assert.equal(
    canAccess({ ...user, permissions: { users: "WRITE" } }, "users", true),
    false,
  );
});
test("Accountant defaults cover finance but never user management or employees", () => {
  const user = { role: "ACCOUNTANT", permissions: defaults("ACCOUNTANT") };
  assert.equal(canAccess(user, "expenses", true), true);
  assert.equal(canAccess(user, "users"), false);
  assert.equal(canAccess(user, "employees"), false);
});
test("Malformed and prototype permission keys fail closed", () => {
  for (const value of [
    null,
    [],
    { unknown: "READ" },
    { constructor: "WRITE" },
    { bank: "ADMIN" },
  ])
    assert.throws(() => validPermissions(value));
  assert.equal(moduleForPath("/api/constructor"), null);
  assert.equal(moduleForPath("/api/invoices/payments"), "expenses");
  assert.equal(moduleForPath("/kullanicilar"), "users");
});
class ArchiveError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}
test("Verified identity checks current database approval and permissions on each request", async () => {
  const previous = process.env.CLERK_SECRET_KEY;
  process.env.CLERK_SECRET_KEY = "test-fixture";
  let profile = {
    id: "user",
    name: "User",
    email: "staff@example.test",
    role: "STAFF",
    permissions: { bank: "READ" },
    employeeId: "employee",
    businessId: "business",
    employee: { active: true, businessId: "business" },
  };
  let verified = true;
  const api = loadTypeScript("src/lib/users/auth.ts", {
    "@clerk/nextjs/server": {
      auth: async () => ({ userId: "clerk-user" }),
      currentUser: async () => ({
        primaryEmailAddressId: "email",
        emailAddresses: [
          {
            id: "email",
            emailAddress: "staff@example.test",
            verification: { status: verified ? "verified" : "unverified" },
          },
        ],
      }),
    },
    "@/lib/prisma": {
      prisma: {
        business: { findFirst: async () => ({ id: "business" }) },
        portalUser: {
          findFirst: async ({ where }) => {
            assert.equal(where.accessState, "ACTIVE");
            assert.equal(where.businessId, "business");
            return profile;
          },
        },
      },
    },
    "@/lib/onedrive/security": {
      ArchiveError,
      allowedEmail: () => "owner@example.test",
      session: async () => ({ email: "owner@example.test" }),
    },
  });
  try {
    assert.equal((await api.requirePortal("bank")).id, "user");
    await assert.rejects(
      () => api.requirePortal("bank", true),
      (e) => e.status === 403,
    );
    profile = null;
    await assert.rejects(
      () => api.requirePortal(),
      (e) => e.status === 403,
    );
    verified = false;
    await assert.rejects(
      () => api.requirePortal(),
      (e) => e.status === 403,
    );
  } finally {
    if (previous === undefined) delete process.env.CLERK_SECRET_KEY;
    else process.env.CLERK_SECRET_KEY = previous;
  }
});
function proxyFixture(user) {
  const api = loadTypeScript("src/proxy.ts", {
    "@clerk/nextjs/server": { clerkMiddleware: (handler) => handler },
    "@/lib/users/auth": { portalIdentity: async () => user },
    "@/lib/onedrive/security": { sessionCookie: "owner-cookie" },
  });
  return async (
    path,
    method = "GET",
    body,
    origin = "https://example.test",
  ) => {
    const url = new URL(path, "https://example.test");
    const request = new Request(url, {
      method,
      headers: { origin },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    request.nextUrl = url;
    request.cookies = { get: () => undefined };
    return api.default(async () => ({ userId: null }), request);
  };
}
test("Anonymous requests redirect pages and return 401 for financial APIs", async () => {
  const proxy = proxyFixture(null);
  assert.equal((await proxy("/api/expenses")).status, 401);
  const page = await proxy("/giderler");
  assert.equal(page.status, 307);
  assert.equal(new URL(page.headers.get("location")).pathname, "/giris");
});
test("Staff cannot call user management or fetch financial data without page grants", async () => {
  const proxy = proxyFixture({ role: "STAFF", permissions: {} });
  for (const route of [
    "/api/users",
    "/api/expenses",
    "/api/employees",
    "/api/db-test",
  ])
    assert.equal((await proxy(route)).status, 403);
  assert.equal((await proxy("/kullanicilar")).status, 307);
});
test("Read-only APIs are enforced server-side and cross-origin writes are denied", async () => {
  const proxy = proxyFixture({
    role: "ACCOUNTANT",
    permissions: { expenses: "READ", bank: "WRITE" },
  });
  assert.equal((await proxy("/api/expenses")).status, 200);
  assert.equal((await proxy("/api/expenses", "POST", {})).status, 403);
  assert.equal(
    (await proxy("/api/bank-transactions", "POST", {}, "https://foreign.test"))
      .status,
    403,
  );
  assert.equal((await proxy("/api/bank-transactions", "POST", {})).status, 200);
});
test("TillHub, SumUp, personal downloads and signed Blob callbacks retain their own guards", async () => {
  const proxy = proxyFixture(null);
  for (const route of [
    "/api/integrations/tillhub/webhook",
    "/api/integrations/tillhub/payments",
    "/api/integrations/sumup/sync",
    "/api/personnel/documents",
    "/api/personnel/mail-download",
  ])
    assert.equal((await proxy(route)).status, 200);
  assert.equal(
    (
      await proxy("/api/documents/upload", "POST", {
        type: "blob.upload-completed",
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await proxy("/api/documents/upload", "POST", {
        type: "blob.generate-client-token",
      })
    ).status,
    401,
  );
});
function usersRoute() {
  const effects = { identities: [], writes: [] };
  const api = loadTypeScript("src/app/api/users/route.ts", {
    "@/lib/users/auth": {
      requirePortal: async (area, write) => {
        assert.equal(area, "users");
        assert.equal(write, true);
        return { email: "owner@example.test" };
      },
    },
    "@/lib/onedrive/security": {
      ArchiveError,
      assertOrigin: () => {},
      allowedEmail: () => "owner@example.test",
    },
    "@/lib/personnel/clerk": {
      ensureEmployeeIdentity: async (email) => effects.identities.push(email),
    },
    "@/lib/prisma": {
      prisma: {
        business: { findFirst: async () => ({ id: "business" }) },
        employee: { findFirst: async () => ({ id: "employee", active: true }) },
        portalUser: {
          create: async ({ data }) => {
            effects.writes.push(data);
            return data;
          },
        },
      },
    },
  });
  const save = (body) =>
    api.POST(
      new Request("https://example.test/api/users", {
        method: "POST",
        body: JSON.stringify({
          name: "Test User",
          email: "user@example.test",
          role: "ACCOUNTANT",
          ...body,
        }),
      }),
    );
  return { effects, save };
}
test("Approved accountant and administrator identities are prepared before profile creation", async () => {
  for (const role of ["ACCOUNTANT", "ADMIN"]) {
    const { save, effects } = usersRoute();
    assert.equal((await save({ role, accessEnabled: true })).status, 200);
    assert.equal(effects.identities[0], "user@example.test");
    assert.equal(effects.writes[0].accessState, "ACTIVE");
    assert.equal(effects.writes[0].role, role);
  }
});
test("Unapproved profiles default closed; malformed grants and owner changes cause no writes", async () => {
  const { save, effects } = usersRoute();
  assert.equal((await save({})).status, 200);
  assert.equal(effects.writes[0].accessState, "PLANNED");
  assert.equal(effects.identities.length, 0);
  for (const body of [
    { email: "owner@example.test" },
    { role: "STAFF", employeeId: "", accessEnabled: true },
    { permissions: { users: "WRITE" } },
    { permissions: { bank: "ALL" } },
  ]) {
    const fixture = usersRoute();
    assert.equal((await fixture.save(body)).status, 400);
    assert.equal(fixture.effects.writes.length, 0);
    assert.equal(fixture.effects.identities.length, 0);
  }
});
