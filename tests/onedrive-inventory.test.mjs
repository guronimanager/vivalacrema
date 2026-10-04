import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { loadTypeScript } from "./helpers/load-typescript.mjs";
class ArchiveError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}
function harness() {
  const effects = { puts: [], writes: [], urls: [], existing: null };
  const inventory = loadTypeScript("src/lib/onedrive/inventory.ts", {
    "./connection": { accessToken: async () => "test-token" },
    "./folder": { resolveArchiveFolder: async () => ({ id: "root" }) },
    "./security": {
      ArchiveError,
      seal: (value) => JSON.stringify(value),
      unseal: (value) => JSON.parse(value),
    },
    "./documents": {
      readDocument: async (id, account) => {
        effects.read = [id, account];
        if (!effects.existing) throw new ArchiveError("Missing", 404);
        return { document: effects.existing };
      },
      writeDocument: async (document) => effects.writes.push(document),
    },
    "@vercel/blob": {
      put: async (path, content) => {
        effects.puts.push([path, content]);
        return { pathname: path };
      },
    },
  });
  const bytes = Buffer.from("sample original document");
  const remote = {
    id: "item",
    name: "old-invoice.pdf",
    size: bytes.length,
    eTag: "v1",
    file: { mimeType: "application/pdf" },
    parentReference: { id: "month-folder" },
  };
  const original = globalThis.fetch;
  globalThis.fetch = async (url) => {
    effects.urls.push(url);
    if (url.includes("children?"))
      return Response.json({
        value: [remote],
        ...(effects.next ? { "@odata.nextLink": effects.next } : {}),
      });
    if (url.includes("root:"))
      return Response.json({ id: "month-folder", folder: {} });
    if (url.endsWith("/content")) return new Response(bytes);
    return Response.json(
      effects.changed && url.includes("?$select=eTag,")
        ? { ...remote, eTag: "v2" }
        : effects.outside
          ? { ...remote, parentReference: { id: "outside" } }
          : remote,
    );
  };
  return {
    inventory,
    effects,
    bytes,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}
test("Inventory validates period/folder before network and preserves pagination", async () => {
  const h = harness();
  try {
    for (const [period, folder] of [
      ["2026-13", "02_Online_Rechnungen"],
      ["2026-09", "../other"],
    ])
      await assert.rejects(() =>
        h.inventory.scanArchive("owner", period, folder),
      );
    assert.equal(h.effects.urls.length, 0);
    h.effects.next =
      "https://graph.microsoft.com/v1.0/me/drive/items/month-folder/children?$skiptoken=page2";
    const page = await h.inventory.scanArchive(
      "owner",
      "2026-09",
      "02_Online_Rechnungen",
    );
    assert.equal(
      page.files[0].path,
      "VLC UG 2026/2026.09_September/02_Online_Rechnungen/old-invoice.pdf",
    );
    assert.ok(page.cursor);
    await h.inventory.scanArchive(
      "owner",
      "2026-09",
      "02_Online_Rechnungen",
      page.cursor,
    );
    assert.equal(h.effects.urls.at(-1), h.effects.next);
    await assert.rejects(() =>
      h.inventory.scanArchive(
        "other",
        "2026-09",
        "02_Online_Rechnungen",
        page.cursor,
      ),
    );
    const forged = JSON.stringify({
      accountId: "owner",
      parentId: "month-folder",
      expires: Date.now() + 5000,
      url: "https://attacker.test/",
    });
    await assert.rejects(() =>
      h.inventory.scanArchive(
        "owner",
        "2026-09",
        "02_Online_Rechnungen",
        forged,
      ),
    );
    assert.ok(
      h.effects.urls.every((url) =>
        url.startsWith("https://graph.microsoft.com/"),
      ),
    );
  } finally {
    h.restore();
  }
});
test("Identical bytes under a different OneDrive name return existing document without upload or duplicate metadata", async () => {
  const h = harness();
  try {
    h.effects.existing = {
      id: createHash("sha256").update(h.bytes).digest("hex"),
      oneDrivePath: "already/archived.pdf",
      employeeId: "staff",
    };
    const result = await h.inventory.registerRemoteDocument(
      "owner",
      "2026-09",
      "02_Online_Rechnungen",
      "item",
    );
    assert.equal(result.duplicate, true);
    assert.equal(result.document, h.effects.existing);
    assert.equal(h.effects.puts.length, 0);
    assert.equal(h.effects.writes.length, 0);
    assert.deepEqual(h.effects.read, [h.effects.existing.id, "owner"]);
  } finally {
    h.restore();
  }
});
test("Existing OneDrive original is indexed as synced and never re-uploaded to OneDrive", async () => {
  const h = harness();
  try {
    const result = await h.inventory.registerRemoteDocument(
      "owner",
      "2026-09",
      "02_Online_Rechnungen",
      "item",
    );
    assert.equal(result.duplicate, false);
    assert.equal(result.document.syncStatus, "SYNCED");
    assert.equal(result.document.source, "ONEDRIVE");
    assert.equal(result.document.dateNeedsReview, true);
    assert.equal(result.document.oneDriveItemId, "item");
    assert.ok(result.document.oneDrivePath.endsWith("/old-invoice.pdf"));
    assert.equal(h.effects.puts.length, 1);
    assert.equal(h.effects.writes.length, 1);
    assert.ok(
      h.effects.urls.every((url) =>
        url.startsWith("https://graph.microsoft.com/"),
      ),
    );
  } finally {
    h.restore();
  }
});
test("Moved and changed documents are refused before private storage writes", async () => {
  for (const condition of ["outside", "changed"]) {
    const h = harness();
    try {
      h.effects[condition] = true;
      await assert.rejects(() =>
        h.inventory.registerRemoteDocument(
          "owner",
          "2026-09",
          "02_Online_Rechnungen",
          "item",
        ),
      );
      assert.equal(h.effects.puts.length, 0);
      assert.equal(h.effects.writes.length, 0);
    } finally {
      h.restore();
    }
  }
});
test("Payroll indexing does not guess staff identity or send email", async () => {
  const h = harness();
  try {
    const result = await h.inventory.registerRemoteDocument(
      "owner",
      "2026-09",
      "05_Lohnabrechnungen",
      "item",
    );
    assert.equal(result.document.kind, "EMPLOYEE");
    assert.equal(result.document.employeeId, undefined);
    assert.equal(result.document.notifyEmployee, undefined);
  } finally {
    h.restore();
  }
});

test('Upload preflight recognizes an unindexed remote original without uploading it to OneDrive', async () => {
 const h=harness();try {
  const id=createHash('sha256').update(h.bytes).digest('hex');
  const result=await h.inventory.findRemoteDuplicate('owner','2026-09','02_Online_Rechnungen',id,h.bytes.length);
  assert.equal(result.id,id);assert.equal(result.source,'ONEDRIVE');assert.equal(h.effects.writes.length,1);
 }finally{h.restore();}
});
test('Different content with same size is not treated as duplicate or registered',async()=>{
 const h=harness();try {
  assert.equal(await h.inventory.findRemoteDuplicate('owner','2026-09','02_Online_Rechnungen','a'.repeat(64),h.bytes.length),null);
  assert.equal(h.effects.puts.length,0);assert.equal(h.effects.writes.length,0);
 }finally{h.restore();}
});

test('Nested archive paths remain within selected month/folder and traversal is refused',async()=>{
 const h=harness();try{
  assert.equal(h.inventory.inventorySelection('2026-01','02_Online_Rechnungen','ok').path,'VLC UG 2026/2026.01_Januar/02_Online_Rechnungen/ok');
  for(const path of ['../other','ok/../../other','/outside','ok\\outside'])assert.throws(()=>h.inventory.inventorySelection('2026-01','02_Online_Rechnungen',path));
  const result=await h.inventory.registerRemoteDocument('owner','2026-01','02_Online_Rechnungen','item','ok');assert.ok(result.document.oneDrivePath.includes('/02_Online_Rechnungen/ok/'));
 }finally{h.restore();}
});
