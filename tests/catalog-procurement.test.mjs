import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { loadTypeScript } from "./helpers/load-typescript.mjs";
import { writeFile } from "node:fs/promises";
const period = loadTypeScript("src/lib/period.ts");
test("period filters preserve leap years, cross-month dates and reject invalid ranges", () => {
  assert.equal(period.presetPeriod("YEAR", "2024").days, 366);
  assert.equal(period.presetPeriod("MONTH", "2026-02").end, "2026-02-28");
  assert.equal(period.periodFor("2026-12-31", "2027-01-01").days, 2);
  assert.throws(() => period.periodFor("2026-02-30", "2026-03-01"));
  assert.throws(() => period.periodFor("2026-10-03", "2026-10-01"));
  assert.throws(() => period.periodFor("2025-01-01", "2026-12-31"));
});
const target = process.env.CATALOG_TEST_DATABASE_URL;
test(
  "isolated catalog import, concurrency, supplier association and request snapshots",
  { skip: !target },
  async () => {
    const u = new URL(target);
    assert.equal(u.hostname, "127.0.0.1");
    assert.equal(u.port, "55439");
    assert.match(u.pathname, /^\/vlc_catalog_test_/);
    const prisma = new PrismaClient({ datasources: { db: { url: target } } }),
      overrides = { "@/lib/prisma": { prisma } };
    const catalog = loadTypeScript("src/lib/catalog/service.ts", overrides),
      procurement = loadTypeScript("src/lib/procurement/service.ts", overrides);
    try {
      const business = await prisma.business.create({
        data: { name: "ISOLATED CATALOG TEST" },
      });
      const supplier = await prisma.supplier.create({
        data: {
          businessId: business.id,
          name: "Test Lieferant",
          email: "supplier@example.invalid",
        },
      });
      const base = {
        name: "Kaffee",
        brand: "Test",
        packSize: "1 kg",
        category: "Hammadde",
        kind: "MATERIAL",
        unit: "KG",
        supplierId: supplier.id,
        supplierCode: "TEST-1",
        unitPrice: "12.3456",
      };
      const [one, two] = await Promise.all([
        catalog.saveProduct(base),
        catalog.saveProduct(base),
      ]);
      assert.equal(one.id, two.id);
      assert.equal(one.code, "VLC-MAT-000001");
      const ready = await catalog.saveProduct({
        ...base,
        name: "Kuchen",
        kind: "READY",
        unit: "ADET",
        supplierCode: "TEST-2",
      });
      assert.equal(ready.code, "VLC-HAZ-000001");
      const manufactured = await catalog.saveProduct({
        ...base,
        name: "Cappuccino",
        kind: "PRODUCED",
        unit: "ADET",
        supplierCode: "TEST-3",
      });
      assert.equal(manufactured.code, "VLC-URE-000001");
      await assert.rejects(
        catalog.saveProduct({
          ...base,
          name: "Collision",
          supplierCode: "TEST-1",
        }),
      );
      assert.equal(await prisma.product.count(), 3);
      const body = {
        documentId: "a".repeat(64),
        supplierId: supplier.id,
        items: [{ ...base, lineNumber: 1, quantity: "2" }],
      };
      assert.equal(
        (await catalog.importCatalog(body, "owner"))[0].created,
        true,
      );
      assert.equal(
        (await catalog.importCatalog(body, "owner"))[0].created,
        false,
      );
      await assert.rejects(
        catalog.importCatalog(
          {
            ...body,
            items: [{ ...base, name: "Other", lineNumber: 1, quantity: "2" }],
          },
          "owner",
        ),
      );
      const req = {
        requestId: randomUUID(),
        supplierId: supplier.id,
        date: "2026-10-03",
        requiredDate: "2026-10-08",
        lines: [{ productId: one.id, quantity: "2.5" }],
        notes: "Türkçe çığ şeker · Größe",
      };
      const r = await procurement.createRequest(
        req,
        "owner",
        "owner@example.invalid",
      );
      assert.equal(
        (await procurement.createRequest(req, "owner", "owner@example.invalid"))
          .id,
        r.id,
      );
      await assert.rejects(
        procurement.createRequest(req, "other", "other@example.invalid"),
      );
      await assert.rejects(procurement.getRequest(r.id, "other"));
      await catalog.updateProduct({
        ...base,
        id: one.id,
        name: "Changed",
        unitPrice: "99",
      });
      const saved = await procurement.getRequest(r.id, "owner");
      assert.equal(saved.lines[0].name, "Test · Kaffee · 1 kg");
      assert.equal(saved.lines[0].unitPrice.toString(), "12.3456");
      await assert.rejects(
        procurement.createRequest(
          {
            ...req,
            requestId: randomUUID(),
            lines: [{ productId: one.id, quantity: "0" }],
          },
          "owner",
          "owner@example.invalid",
        ),
      );
      assert.equal(await prisma.expense.count(), 0);
      assert.equal(await prisma.sale.count(), 0);
      assert.equal(await prisma.transaction.count(), 0);
      const { requestPdf } = loadTypeScript("src/lib/procurement/pdf.ts");
      const pdf = await requestPdf({
        ...saved,
        lines: Array.from({ length: 30 }, (_, i) => ({
          ...saved.lines[0],
          code: `VLC-MAT-${i}`,
          name: "Türkçe çığ şeker · Größe Milch Schokolade 1 kg – ".repeat(3),
        })),
      });
      assert.equal(pdf.subarray(0, 4).toString(), "%PDF");
      await writeFile("/private/tmp/vlc-procurement-test.pdf", pdf);
    } finally {
      await prisma.$disconnect();
    }
  },
);
test("email ownership, recipient preview, accepted and uncertain duplicate protection", async () => {
  let state = "NOT_SENT",
    count = 0;
  const record = {
    id: "r",
    creatorEmail: "owner@example.invalid",
    supplier: { email: "supplier@example.invalid" },
    emailStatus: state,
  };
  const overrides = {
    "@/lib/prisma": {
      prisma: {
        purchaseRequest: {
          updateMany: async () => {
            if (!["NOT_SENT", "FAILED"].includes(state)) return { count: 0 };
            state = "SENDING";
            return { count: 1 };
          },
          update: async ({ data }) => {
            state = data.emailStatus;
          },
        },
      },
    },
    "@/lib/onedrive/connection": {
      accessToken: async () => "TEST_ONLY",
      mailScopes: [],
    },
    "./service": {
      getRequest: async () => ({ ...record, emailStatus: state }),
      requestMessage: () => "TEST",
    },
    "./pdf": { requestPdf: async () => Buffer.from("TEST") },
  };
  const { sendRequestEmail } = loadTypeScript(
    "src/lib/procurement/email.ts",
    overrides,
  );
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => {
      count++;
      return { status: 202 };
    };
    await assert.rejects(
      sendRequestEmail(
        "r",
        "owner",
        "other@example.invalid",
        record.supplier.email,
      ),
    );
    await assert.rejects(
      sendRequestEmail(
        "r",
        "owner",
        record.creatorEmail,
        "changed@example.invalid",
      ),
    );
    assert.equal(count, 0);
    await sendRequestEmail(
      "r",
      "owner",
      record.creatorEmail,
      record.supplier.email,
    );
    assert.equal(state, "ACCEPTED");
    await assert.rejects(
      sendRequestEmail(
        "r",
        "owner",
        record.creatorEmail,
        record.supplier.email,
      ),
    );
    assert.equal(count, 1);
    state = "NOT_SENT";
    globalThis.fetch = async () => {
      count++;
      throw new Error("Lost response");
    };
    await assert.rejects(
      sendRequestEmail(
        "r",
        "owner",
        record.creatorEmail,
        record.supplier.email,
      ),
    );
    assert.equal(state, "UNKNOWN");
    await assert.rejects(
      sendRequestEmail(
        "r",
        "owner",
        record.creatorEmail,
        record.supplier.email,
      ),
    );
    assert.equal(count, 2);
  } finally {
    globalThis.fetch = original;
  }
});
test(
  "supplier period debt uses payments as of period end and user profiles grant no login",
  { skip: !target },
  async () => {
    const prisma = new PrismaClient({ datasources: { db: { url: target } } });
    const overrides = {
      "@/lib/prisma": { prisma },
      "@/lib/onedrive/security": {
        requireSession: async () => ({
          accountId: "owner",
          email: "owner@example.invalid",
        }),
        assertOrigin: () => {},
      },
    };
    try {
      const business = await prisma.business.findFirst();
      const s = await prisma.supplier.findFirst();
      const { saveInvoice } = loadTypeScript(
        "src/lib/invoices/service.ts",
        overrides,
      );
      const invoice = await saveInvoice(
        {
          supplierName: s.name,
          invoiceNumber: "PERIOD-1",
          date: "2026-09-01",
          totalAmount: "119",
          netAmount: "100",
          vatAmount: "19",
          documentId: "b".repeat(64),
          kind: "INVOICE_MATERIAL",
          category: "Hammadde",
        },
        "owner",
      );
      await prisma.invoicePayment.createMany({
        data: [
          {
            invoiceId: invoice.id,
            method: "MANUAL",
            amount: "19",
            date: new Date("2026-09-20"),
            requestId: randomUUID(),
          },
          {
            invoiceId: invoice.id,
            method: "MANUAL",
            amount: "100",
            date: new Date("2026-10-02"),
            requestId: randomUUID(),
          },
        ],
      });
      const { GET } = loadTypeScript(
        "src/app/api/suppliers/summary/route.ts",
        overrides,
      );
      let result = await (
        await GET(
          new Request(
            "http://localhost/api/suppliers/summary?start=2026-09-01&end=2026-09-30",
          ),
        )
      ).json();
      let row = result.records.find((x) => x.id === s.id);
      assert.equal(row.purchaseTotal, 119);
      assert.equal(row.outstanding, 100);
      assert.equal(row.periodOutstanding, 100);
      result = await (
        await GET(
          new Request(
            "http://localhost/api/suppliers/summary?start=2026-10-01&end=2026-10-31",
          ),
        )
      ).json();
      row = result.records.find((x) => x.id === s.id);
      assert.equal(row.purchaseTotal, 0);
      assert.equal(row.outstanding, 0);
      const users = loadTypeScript("src/app/api/users/route.ts", overrides);
      const response = await users.POST(
        new Request("http://localhost/api/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "Planned Staff",
            email: "staff@example.invalid",
            role: "ADMIN",
          }),
        }),
      );
      const user = await response.json();
      assert.equal(user.record.accessState, "PLANNED");
      await assert.rejects(
        saveInvoice(
          {
            supplierName: "Different Supplier",
            invoiceNumber: "WRONG-1",
            date: "2026-10-03",
            totalAmount: "119",
            netAmount: "100",
            vatAmount: "19",
            documentId: "a".repeat(64),
            kind: "INVOICE_MATERIAL",
            category: "Hammadde",
          },
          "owner",
        ),
      );
      assert.equal(await prisma.purchaseInvoice.count(), 1);
    } finally {
      await prisma.$disconnect();
    }
  },
);
