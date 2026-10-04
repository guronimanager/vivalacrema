import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTypeScript } from './helpers/load-typescript.mjs';
class ArchiveError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }
class NoObjectError extends Error { constructor(finishReason) { super('private statement content'); this.finishReason = finishReason; } }
function reader(generate) {
  return loadTypeScript('src/lib/statements/ocr.ts', {
    ai: { gateway: { getCredits: async () => ({ balance: '1' }) }, generateText: generate, jsonSchema: value => value, Output: { object: value => value }, NoObjectGeneratedError: { isInstance: error => error instanceof NoObjectError } },
    '@vercel/blob': { get: async () => ({ statusCode: 200, stream: new Response('fixture PDF').body }) },
    '@/lib/onedrive/security': { ArchiveError },
    '@/lib/onedrive/documents': { readDocument: async () => ({ document: { id: 'fixture', kind: 'BANK_STATEMENT', contentType: 'application/pdf', size: 11, pathname: 'fixture.pdf' } }) },
  });
}
test('Gemini extraction reserves output tokens for transactions and validates full EUR data', async () => {
  const original = process.env.STATEMENT_OCR_MODEL;
  delete process.env.STATEMENT_OCR_MODEL;
  try {
    const ocr = reader(async options => {
      assert.equal(options.providerOptions.google.thinkingConfig.thinkingBudget, 0);
      return { finishReason: 'stop', output: { currency: 'EUR', iban: null, complete: true, warnings: [], rows: [{ date: '2026-09-01', amount: '-10.00', description: 'Supplier', reference: '' }] } };
    });
    assert.equal((await ocr.extractStatement('fixture', 'owner')).rows.length, 1);
  } finally { if (original !== undefined) process.env.STATEMENT_OCR_MODEL = original; }
});
test('Truncated or malformed output returns actionable error without leaking statement content', async () => {
  for (const reason of ['length', 'stop']) {
    const ocr = reader(async () => { throw new NoObjectError(reason); });
    await assert.rejects(ocr.extractStatement('fixture', 'owner'), error => error.status === 422 && error.message.includes('CSV') && !error.message.includes('private statement content'));
  }
});
test('A parseable but incomplete statement never returns partial transaction rows', async () => {
  const ocr = reader(async () => ({ finishReason: 'stop', output: { currency: 'EUR', complete: false, warnings: [], rows: [] } }));
  await assert.rejects(ocr.extractStatement('fixture', 'owner'), /bütün EUR hareketleri/);
});
