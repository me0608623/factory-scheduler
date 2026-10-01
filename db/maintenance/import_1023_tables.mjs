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
  if (typeof v === "number" && v > 40000 && v < 60000) { const d = new Date(Date.UTC(1899, 11, 30) + v * 86400000); return d.toISOString().slice(0, 10); }  // Excel 序號 → 日期
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
// 日期合理性：必須是 ISO 且 2000–2100；否則不當日期（年份異常 → 匯入錯誤註記）
const saneDate = v => {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const y = +v.slice(0, 4);
  return y >= 2000 && y <= 2100 ? v : null;
};
// 品號／品號製程：只收零件碼（英數為主、20 字內）
const looksItem = t => /^[A-Za-z0-9][A-Za-z0-9 ./+-]{2,19}$/.test(t);
// 描述：短、不含疑問／指示語；否則視為備註句
const looksDesc = t => t.length <= 12 && !/[?？請查明]/.test(t);
for (let r = 4; r <= wsR.rowCount; r++) {
  const g = c => cellVal(wsR, r, c);
  // 一廠
  const sdRaw = g(1);
  const sd = saneDate(sdRaw);
  const sdNote = sd ? null : (sdRaw === null || sdRaw === undefined || String(sdRaw).trim() === '' ? null
    : (typeof sdRaw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(sdRaw) ? `匯入錯誤日期(原 ${sdRaw})` : String(sdRaw).trim()));
  const rawItem = txt(g(3));
  const itemOk = looksItem(rawItem);
  const notes1 = [...new Set([(itemOk ? '' : rawItem), txt(g(4)), txt(g(6)), sdNote].filter(Boolean))].join('；');
  // 二廠
  const s2 = saneDate(g(7)), d2 = saneDate(g(8));
  const extra2 = [s2 ? null : (g(7) === null || g(7) === undefined || String(g(7)).trim() === '' ? null : (typeof g(7) === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(g(7)) ? `匯入錯誤日期(原 ${g(7)})` : String(g(7)).trim())),
                  d2 ? null : (g(8) === null || g(8) === undefined || String(g(8)).trim() === '' ? null : (typeof g(8) === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(g(8)) ? `匯入錯誤日期(原 ${g(8)})` : String(g(8)).trim()))].filter(Boolean);
  const rawProc = txt(g(9)), rawDesc = txt(g(10));
  const procOk = looksItem(rawProc);
  const descOk = looksDesc(rawDesc);
  const notes2 = [...new Set([txt(g(12)), procOk ? '' : rawProc, descOk ? '' : rawDesc, ...extra2].filter(Boolean))].join('；');
  const row = {
    id: uuid5('rush:' + r),
    f1: { shipDate: sd, vendor: txt(g(2)), desc: itemOk ? rawItem : '', shortQty: num(g(5)), note: notes1 },
    f2: { startDate: s2, dueDate: d2, itemProcess: procOk ? rawProc : '', desc: descOk ? rawDesc : '', qty: num(g(11)), note: notes2 },
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
  // A col5「2廠時間」＝急用日期（Date→ISO；08\16 這類文字 → urgentRaw）
  const ud = cellVal(wsA, r, 5);
  aMap[code] = {
    seq: num(cellVal(wsA, r, 2)), floor1: num(cellVal(wsA, r, 7)), floor3: num(cellVal(wsA, r, 8)),
    urgentDate: saneDate(typeof ud === 'string' ? ud : null),
    urgentDateRaw: (ud !== null && ud !== undefined && String(ud).trim() !== '' && !saneDate(typeof ud === 'string' ? ud : null)) ? String(ud) : null,
  };
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
    else if (saneDate(String(uv))) urgentDue = String(uv);          // 急用欄的日期 → 急用日期
    else urgentRaw = String(uv);
  }
  const noteBits = [];
  // 日期合理性：不合理年份（如 1902-10-10）不當真日期，原值註記為匯入錯誤
  const dateOr = v => { const d = saneDate(typeof v === 'string' ? v : null); if (d) return [d, null]; if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return [null, `匯入錯誤日期(原 ${v})`]; return [null, null]; };
  const [nOk, nErr] = dateOr(g(1));
  const [sOk, sErr] = dateOr(g(4));
  const [dOk, dErr] = dateOr(g(6));
  if (nErr) noteBits.push(nErr);
  if (sErr) noteBits.push(sErr);
  if (dErr) noteBits.push(dErr);
  if (urgentRaw) noteBits.push(`急用原值 ${urgentRaw}`);
  const extra = aMap[code] || {};
  // 急用日期：A 表「2廠時間」（B 表急用欄只是數量）；文字值 → urgentRaw 標待確認格式
  const aUrgentDue = extra.urgentDate || null;
  if (extra.urgentDateRaw) urgentRaw = extra.urgentDateRaw;
  const sendRaw = g(4) !== null && g(4) !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(String(g(4))) ? String(g(4)) : null;
  transfers.push({
    id: uuid5('tf:' + code + ':' + r),
    code: uniq, itemCode: code,
    fromFactory: 1, toFactory: 2, returnFactory: 1,
    totalQty: num(g(3)), urgentQty,
    notified: nOk,
    expectedSend: sOk, expectedSendRaw: sendRaw,
    due: dOk,
    urgentDue: aUrgentDue, urgentRaw,
    seq: extra.seq ?? null, floor1: extra.floor1 ?? null, floor3: extra.floor3 ?? null,
    returned: false, workIds: [], status: 'active', note: noteBits.join('；'), batches: [], events: [],
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

// ---- DRY-RUN 對照：對原 Excel 抽查關鍵列，通過才可寫入（--apply 才會寫 DB）----
const DRY = !process.argv.includes('--apply');
{
  const checks = [];
  // 1) JUMBO 5252S0115：出貨 10/2、欠貨 240、二廠空白
  const j = rush.find(x => x.f1.vendor === 'JUMBO' && x.f1.desc === '5252S0115');
  checks.push(['JUMBO 5252S0115', j ? { ship: j.f1.shipDate, qty: j.f1.shortQty, f2empty: shortageRowFlagsLike(j) } : 'NOT FOUND']);
  // 2) 出貨日期欄位有值率（非範例列）
  const withShip = rush.filter(x => x.f1.shipDate).length;
  checks.push(['shipDate 有值', `${withShip}/${rush.length}`]);
  // 3) 會晚筆數（預計完成 > 出貨日）
  const late = rush.filter(x => x.f1.shipDate && x.f2.dueDate && x.f2.dueDate > x.f1.shipDate).length;
  checks.push(['會晚筆數', late]);
  // 4) 備註句不得在品號/製程/描述
  const leak = rush.filter(x => /[?？請查明]/.test(x.f1.desc + x.f2.itemProcess + x.f2.desc)).length;
  checks.push(['備註句外漏到代碼欄', leak]);
  // 5) 1902 之類異常年份不得存在任何日期欄
  const badYears = [...rush.flatMap(x => [x.f1.shipDate, x.f2.startDate, x.f2.dueDate]), ...transfers.flatMap(x => [x.notified, x.expectedSend, x.due, x.urgentDue])]
    .filter(v => v && (+String(v).slice(0, 4) < 2000)).length;
  checks.push(['異常年份日期', badYears]);
  // 6) 急用有日期的筆數
  checks.push(['急用日期有值', transfers.filter(x => x.urgentDue).length]);
  for (const [k, v] of checks) console.log('CHECK', k, '=', JSON.stringify(v));
  function shortageRowFlagsLike(x) { return !(x.f2.startDate || x.f2.dueDate || x.f2.itemProcess || x.f2.desc || x.f2.qty || x.f2.note); }
}
if (DRY) { console.log('DRY-RUN（未寫入）。確認 CHECK 全部符合原 Excel 後，加 --apply 重新執行。'); process.exit(0); }

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
