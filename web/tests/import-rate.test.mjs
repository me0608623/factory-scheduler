import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { IMPORT_HEADERS, readImportXlsx } from '../src/excel.js';
import { makeDb, FakeSupabase } from './fake-supabase.mjs';
import { SupabaseStore } from '../src/store/supabase.js';

async function importedRate(rate) {
  const workbook = new ExcelJS.Workbook();
  for (const [name, headers] of Object.entries(IMPORT_HEADERS)) workbook.addWorksheet(name).addRow(headers);
  // Valid database identities isolate rate validation from spreadsheet-code mapping.
  const employee = '11111111-1111-4111-8111-111111111112';
  const product = '11111111-1111-4111-8111-111111111113';
  workbook.getWorksheet('員工').addRow([employee, 'Synthetic worker', 1, 'test1', '否', '']);
  workbook.getWorksheet('機台').addRow(['test1', 'Synthetic machine', '裁切', product]);
  workbook.getWorksheet('產品工序').addRow([product, 'Synthetic product', 1, '裁切', rate, 0]);
  workbook.getWorksheet('工單').addRow([`TEST-RATE-${rate}`, product, 1, '2026-11-30', 1]);
  return readImportXlsx(await workbook.xlsx.writeBuffer(), 'synthetic-rate.xlsx');
}

test('Excel rate rejects unsupported precision and numeric(8,3) overflow before confirmation', async () => {
  for (const rate of [0.0001, 0.0014, 1.0001, 99999.9991, 100000, 1e20, '0.0014', '1e-4', '1.00000000000000001', '0.00099999999999999999', '99999.9990000000001']) {
    const result = await importedRate(rate);
    assert.ok(result.errors.some(error => error.includes('每分鐘件數') && error.includes('0.001–99999.999')), `accepted unsupported rate ${rate}`);
  }
});

test('Excel rate preserves supported decimal boundaries without binary scaling false positives', async () => {
  for (const rate of [0.001, 1.001, 1.005, 32.001, 99999.999, '0.001', '99999.999', '1e-3', '1.0000', '.001000', '+1000e-6', '99999999e-3']) {
    const result = await importedRate(rate);
    assert.deepEqual(result.errors, [], String(rate));
    assert.equal(result.data.products[0].steps[0].rate, Number(rate));
  }
});

test('Excel rate handles long exponents without exponent-sized allocations', { timeout: 10000 }, async () => {
  for (const rate of ['1e' + '9'.repeat(10000), '1e-' + '9'.repeat(10000)]) {
    assert.ok((await importedRate(rate)).errors.length > 0);
  }
  const result = await importedRate('1e-' + '0'.repeat(10000) + '3');
  assert.deepEqual(result.errors, []);
  assert.equal(result.data.products[0].steps[0].rate, 0.001);
});

test('accepted Excel rate survives SupabaseStore database roundtrip unchanged', async () => {
  const db = await makeDb();
  try {
    const boss = '11111111-1111-4111-8111-111111111111';
    await db.query("insert into auth.users (id,email) values ($1,'synthetic-rate@x')", [boss]);
    await db.query("update profiles set role='boss' where user_id=$1", [boss]);
    const store = new SupabaseStore(new FakeSupabase(db, { 'synthetic-rate@x': { id: boss, password: 'pw' } }));
    await store.init();
    await store.login('synthetic-rate@x', 'pw');
    for (const rate of [0.001, 1.001, 1.005, 99999.999]) {
      const parsed = await importedRate(rate);
      assert.deepEqual(parsed.errors, []);
      const candidate = { ...await store.load(), ...parsed.data, blocks: [], demo: false };
      await store.sync(candidate);
      const reloaded = await store.load();
      assert.equal(reloaded.products.find(p => p.id === parsed.data.products[0].id).steps[0].rate, rate);
      assert.equal(candidate.products[0].steps[0].rate, rate);
    }
  } finally { await db.close(); }
});
