import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTypeScript } from './helpers/load-typescript.mjs';
class ArchiveError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }
const security = { ArchiveError, assertOrigin: () => {}, requireSession: async () => ({ accountId: 'owner' }) };
const errors = { invoiceFailure: error => Response.json({ message: error.message }, { status: error.status || 502 }) };
const request = body => new Request('https://example.test/api', { method: 'POST', body: JSON.stringify(body) });
function importRoute() {
  const effects = { downloads: 0, writes: 0, metadata: null };
  const route = loadTypeScript('src/app/api/documents/import/route.ts', {
    '@/lib/onedrive/security': security, '@/lib/invoices/errors': errors,
    '@/lib/invoices/remote-document': { downloadDocument: async () => { effects.downloads++; return { contentType: 'application/pdf', content: Buffer.from('fixture') }; } },
    '@vercel/blob': { put: async (pathname, content, options) => { effects.writes++; assert.equal(options.access, 'private'); return { pathname }; } },
    '@/lib/onedrive/documents': { finalizeDocument: async (pathname, metadata, accountId) => { assert.equal(accountId, 'owner'); effects.metadata = metadata; return metadata; }, publicDocument: document => document },
  });
  return { route, effects };
}
test('Link import keeps chosen period/folder and service type independent of invoice date', async () => {
  const { route, effects } = importRoute();
  const response = await route.POST(request({ url: 'https://example.test/invoice.pdf', kind: 'INVOICE_SERVICE', date: '2026-10-03', archivePeriod: '2025-09', archiveFolder: '04_Quittungen' }));
  assert.equal(response.status, 201);
  assert.equal(effects.metadata.archivePeriod, '2025-09');
  assert.equal(effects.metadata.date, '2026-10-03');
  assert.equal(effects.metadata.archiveFolder, '04_Quittungen');
  assert.equal(effects.metadata.kind, 'INVOICE_SERVICE');
});
test('Invalid archive inputs are rejected before downloading or storing a linked file', async () => {
  for (const invalid of [{ archivePeriod: '2026-13' }, { archivePeriod: '../2026' }, { archiveFolder: '../private' }, { kind: 'EMPLOYEE' }, { date: '2026-02-30' }]) {
    const { route, effects } = importRoute();
    assert.equal((await route.POST(request({ url: 'https://example.test/invoice.pdf', ...invalid }))).status, 400);
    assert.equal(effects.downloads, 0); assert.equal(effects.writes, 0);
  }
});
test('Existing link import clients retain default invoice folder and type', async () => {
  const { route, effects } = importRoute();
  assert.equal((await route.POST(request({ url: 'https://example.test/invoice.pdf' }))).status, 201);
  assert.equal(effects.metadata.archiveFolder, '02_Online_Rechnungen');
  assert.equal(effects.metadata.kind, 'INVOICE_MATERIAL');
  assert.equal(effects.metadata.archivePeriod, undefined);
});
function invoiceRoute() {
  const effects = { metadata: null, saves: 0 };
  const document = { id: 'a'.repeat(64), kind: 'INVOICE_MATERIAL', date: '2026-10-03', entity: 'Supplier', originalName: 'invoice.pdf', archivePeriod: '2026-10' };
  const route = loadTypeScript('src/app/api/invoices/route.ts', {
    '@/lib/prisma': { prisma: {} }, '@/lib/onedrive/security': security, '@/lib/invoices/errors': errors,
    '@/lib/invoices/input': { invoiceInput: () => ({ kind: 'INVOICE_SERVICE', supplierName: 'Supplier', date: new Date('2026-10-03T00:00:00Z') }) },
    '@/lib/invoices/service': { listInvoices: async () => [], saveInvoice: async () => { effects.saves++; return { id: 'invoice' }; } },
    '@/lib/onedrive/documents': { readDocument: async () => ({ document }), updatePendingDocument: async (id, metadata) => { effects.metadata = metadata; }, syncDocument: async () => ({ syncStatus: 'SYNCED' }) },
  });
  return { route, effects, document };
}
test('Invoice confirmation keeps the chosen archive month without changing invoice date', async () => {
  const { route, effects, document } = invoiceRoute();
  assert.equal((await route.POST(request({ documentId: document.id, archivePeriod: '2025-09', archiveFolder: '04_Quittungen' }))).status, 201);
  assert.equal(effects.metadata.archivePeriod, '2025-09');
  assert.equal(effects.metadata.date, '2026-10-03');
  assert.equal(effects.metadata.archiveFolder, '04_Quittungen');
  assert.equal(effects.saves, 1);
});
test('Invalid invoice archive period is rejected before document or financial writes', async () => {
  const { route, effects, document } = invoiceRoute();
  assert.equal((await route.POST(request({ documentId: document.id, archivePeriod: '2026-00' }))).status, 400);
  assert.equal(effects.metadata, null); assert.equal(effects.saves, 0);
});
