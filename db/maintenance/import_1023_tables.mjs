// 一次性匯入：排程1023.xlsx 的 B-特別趕貨 / B / A / 工作紀錄表 → 正式 Supabase
// 規則：跳過 **範例** 列；公式欄（#VALUE!、F: 結果）不匯；Excel 日期自動轉 ISO；
//       「08\16」這類文字原樣存到 *Raw 欄並顯示待確認格式；重跑先清除上一次匯入（body.imported=true）。
import ExcelJS from 'exceljs';
import pg from 'pg';
import fs from 'node:fs';
import crypto from 'node:crypto';

const raw = fs.readFileSync('C:/Users/me060/Downloads/factory-scheduler-backups/db-credential.txt', 'utf8');
const url = 'postgresql://' + raw.split('postgresql://')[1].split('\n')[0].trim();
const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile('C:/Users/me060/Downloads/排程1023.xlsx');

const cellVal = (ws, r, c) => {
  const v = ws.getRow(r).getCell(c).value;
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') return v.text ?? (v.result !== undefined ? { formula: v.result } : v.text) ?? null;
  return v;
};
const isFormula = (ws, r, c) => {
  const v = ws.getRow(r).getCell(c).value;
  return v !== null && typeof v === 'object' && !(v instanceof Date) && (v.formula !== undefined || v.sharedFormula !== undefined);
};
const num = v => v === null || v === undefined || v === '' ? null : (Number.isFinite(+v) && String(v).trim() !== '' ? Math.round(+v) : null);
const txt = v => v === null || v === undefined ? '' : String(v).trim();
const uuid5 = s => {
  const h = crypto.createHash('sha1').update(s).digest('hex');
  return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20,32)}`;
};

// ---- A. 欠缺品項 ← B-特別趕貨（資料從 r4 起；表頭 r3）----
const wsR = wb.worksheets.find(w => w.name === 'B-特別趕貨');
const rush = [];
for (let r = 4; r <= wsR.rowCount; r++) {
  const g = c => cellVal(wsR, r, c);
  const note1 = txt(g(6)), desc1 = txt(g(4));
  const row = {
    id: uuid5('rush:' + r),
    f1: { shipDate: g(1), vendor: txt(g(2)), desc: txt(g(3)), shortQty: num(g(5)), note: desc1 ? (note1 ? desc1 + '；' + note1 : desc1) : note1 },
    f2: { startDate: g(7), dueDate: g(8), itemProcess: txt(g(9)), desc: txt(g(10)), qty: num(g(11)), note: txt(g(12)) },
    imported: true,
  };
  const any = [row.f1.shipDate, row.f1.vendor, row.f1.desc, row.f1.shortQty, row.f1.note, row.f2.startDate, row.f2.dueDate, row.f2.itemProcess, row.f2.desc, row.f2.qty, row.f2.note].some(v => v !== null && v !== '' && v !== undefined);
  if (!any) continue;
  if ((row.f1.note + row.f2.note).includes('範') && (row.f1.note + row.f2.note).includes('例')) continue; // **範  例**
  rush.push(row);
}

// ---- B. 給二廠／回一廠 ← B（主檔）＋ A（加工序／1樓／3樓）----
const wsB = wb.worksheets.find(w => w.name === 'B');
const wsA = wb.worksheets.find(w => w.name === 'A');
const aMap = {};
for (let r = 2; r <= wsA.rowCount; r++) {
  const code = txt(cellVal(wsA, r, 3));
  if (!code) continue;
  aMap[code] = { seq: num(cellVal(wsA, r, 2)), floor1: num(cellVal(wsA, r, 7)), floor3: num(cellVal(wsA, r, 8)) };
}
const transfers = [];
const codeCount = {};
for (let r = 2; r <= wsB.rowCount; r++) {
  const code = txt(cellVal(wsB, r, 2));
  if (!code) continue;
  if (isFormula(wsB, r, 2)) continue;
  const g = c => cellVal(wsB, r, c);
  // 同一加工編號會多筆出貨紀錄；DB 要求唯一 → 重複的加 -2/-3 後綴，原始編號保留在 itemCode（品號欄）
  codeCount[code] = (codeCount[code] || 0) + 1;
  const uniq = codeCount[code] === 1 ? code : `${code}-${codeCount[code]}`;
  let urgentQty = 0, urgentDue = null, urgentRaw = null;
  const uv = g(5);
  if (uv !== null && uv !== '') {
    if (/^\d+(\.\d+)?$/.test(String(uv))) urgentQty = Math.round(+uv);
    else if (/^\d{4}-\d{2}-\d{2}$/.test(String(uv))) urgentDue = String(uv);
    else urgentRaw = String(uv);
  }
  const sendRaw = g(4) !== null && g(4) !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(String(g(4))) ? String(g(4)) : null;
  const extra = aMap[code] || {};
  transfers.push({
    id: uuid5('tf:' + code + ':' + r),
    code: uniq, itemCode: code,
    fromFactory: 1, toFactory: 2, returnFactory: 1,
    totalQty: num(g(3)), urgentQty,
    notified: /^\d{4}-\d{2}-\d{2}$/.test(String(g(1) ?? '')) ? g(1) : null,
    expectedSend: /^\d{4}-\d{2}-\d{2}$/.test(String(g(4) ?? '')) ? g(4) : null, expectedSendRaw: sendRaw,
    due: /^\d{4}-\d{2}-\d{2}$/.test(String(g(6) ?? '')) ? g(6) : null,
    urgentDue, urgentRaw,
    seq: extra.seq ?? null, floor1: extra.floor1 ?? null, floor3: extra.floor3 ?? null,
    returned: false, workIds: [], status: 'active', note: '', batches: [], events: [],
    imported: true,
  });
}

// ---- C. 工作紀錄 ← 工作紀錄表（表頭 r2/r3，資料 r4 起；欄 1-8,9,12,15+）----
const wsW = wb.worksheets.find(w => w.name === '工作紀錄表');
const worklog = [];
for (let r = 4; r <= wsW.rowCount; r++) {
  const g = c => cellVal(wsW, r, c);
  const d = g(1);
  const row = {
    id: uuid5('wl:' + r),
    date: /^\d{4}-\d{2}-\d{2}$/.test(String(d ?? '')) ? d : null,
    code: txt(g(2)), goodQty: num(g(3)), badQty: num(g(4)),
    startH: num(g(5)), startM: num(g(6)), endH: num(g(7)), endM: num(g(8)),
    reworkMin: num(g(9)), worker: txt(g(12)), note: txt(g(15)),
    imported: true,
  };
  const any = [row.date, row.code, row.worker, row.note, row.goodQty, row.badQty, row.reworkMin, row.startH, row.endH].some(v => v !== null && v !== '' && v !== undefined);
  if (any) worklog.push(row);
}

console.log(`parsed: rush=${rush.length} transfers=${transfers.length} worklog=${worklog.length}`);

// ---- 寫入正式資料庫（先清掉上一次匯入）----
const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000 });
await c.connect();
await c.query('begin');
try {
  for (const [table, rows] of [['rush_orders', rush], ['transfer_orders', transfers], ['work_log', worklog]]) {
    await c.query(`delete from ${table} where body->>'imported'='true'`);
    for (const row of rows) {
      if (table === 'transfer_orders')
        await c.query('insert into transfer_orders(id,code,body) values($1,$2,$3) on conflict(id) do update set code=excluded.code, body=excluded.body', [row.id, row.code, JSON.stringify(row)]);
      else
        await c.query(`insert into ${table}(id,body) values($1,$2) on conflict(id) do update set body=excluded.body`, [row.id, JSON.stringify(row)]);
    }
  }
  await c.query('commit');
  console.log('IMPORTED to production');
} catch (e) { await c.query('rollback'); console.log('FAILED:', e.message); process.exitCode = 1; }
const counts = await c.query("select (select count(*) from rush_orders) rush, (select count(*) from transfer_orders) tf, (select count(*) from work_log) wl");
console.log('DB counts:', counts.rows[0]);
const rawCheck = await c.query("select count(*) n from transfer_orders where body->>'expectedSendRaw' is not null");
console.log('待確認格式 expectedSendRaw:', rawCheck.rows[0].n);
await c.end();
