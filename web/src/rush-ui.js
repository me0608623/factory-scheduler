// 特別趕貨紀錄頁：對照現場 Excel 的「一廠欠貨 / 二廠加工」追蹤表。
// 只是紀錄頁，不推測產能、不連動排程；修改權限走 rush.manage。

import { validateRush } from './rush.js';

const fmtDate = d => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d.slice(5).replace('-', '/') : '—');

export function rushUI({ state, ui, esc, uid, canEdit, open, close, syncInputs, commit, toast, today, clearUndo }) {
  const btn = (act, label, id = '', extra = '') => '<button class="btn" data-act="' + act + '" data-id="' + esc(id) + '" ' + extra + '>' + label + '</button>';
  const rows = () => state().rushOrders || [];
  const commitRush = (orders, title) => {
    const S = state();
    validateRush(orders);
    S.rushOrders = orders;
    clearUndo();
    close();
    commit({ kind: 'edit', title, lines: [] });
  };
  const safe = f => () => { if (!canEdit()) return; try { f(); } catch (e) { toast(e.message); } };

  const modals = {
    rush() {
      const list = [...rows()].sort((a, b) => String(a.f1?.shipDate || '9999').localeCompare(String(b.f1?.shipDate || '9999')));
      const td = v => (v === null || v === undefined || v === '') ? '<span class="mute">—</span>' : esc(String(v));
      return {
        title: '特別趕貨紀錄',
        body: '<div class="hint">對照現場的趕貨 Excel：左半是一廠欠貨品項，右半是二廠加工回覆。同一列可以先填一邊之後再補；這裡只做紀錄，不自動改成排程。</div>' +
          '<div class="rush-table"><table><thead><tr><th class="rush-f1" colspan="5">一廠（欠貨品項）</th><th class="rush-f2" colspan="6">二廠（加工）</th></tr>' +
          '<tr><th>出貨日期</th><th>廠商</th><th>描述／品號</th><th>欠貨數量</th><th>備註</th><th>開工時間</th><th>預計完成</th><th>品號／製程</th><th>描述</th><th>數量</th><th>備註</th></tr></thead><tbody>' +
          (list.map(r => '<tr class="rush-row" data-act="rush-edit" data-id="' + esc(r.id) + '">' +
            [fmtDate(r.f1?.shipDate), r.f1?.vendor, r.f1?.desc, r.f1?.shortQty, r.f1?.note,
             fmtDate(r.f2?.startDate), fmtDate(r.f2?.dueDate), r.f2?.itemProcess, r.f2?.desc, r.f2?.qty, r.f2?.note]
              .map(v => '<td>' + td(v) + '</td>').join('') + '</tr>').join('') ||
           '<tr><td colspan="11"><div class="empty">還沒有特別趕貨紀錄</div></td></tr>') +
          '</tbody></table></div>',
        foot: (canEdit() ? '<button class="btn primary" data-act="rush-new">＋新增一列</button>' : '') + btn('close', '關閉')
      };
    },
    'rush-edit'(m) {
      m.draft ||= structuredClone(rows().find(r => r.id === m.id) || {
        id: uid(),
        f1: { shipDate: today(), vendor: '', desc: '', shortQty: null, note: '' },
        f2: { startDate: '', dueDate: '', itemProcess: '', desc: '', qty: null, note: '' },
      });
      const D = m.draft, off = !canEdit();
      const field = (k, l, v, t = 'text') => '<div class="field"><label for="ru-' + k.replace('.', '-') + '">' + l + '</label><input class="inp" id="ru-' + k.replace('.', '-') + '" data-bind="' + k + '" type="' + t + '" value="' + esc(v ?? '') + '" ' + (off ? 'disabled' : '') + '></div>';
      return {
        title: m.id ? '編輯趕貨紀錄' : '新增趕貨紀錄',
        body: '<div class="rush-sec f1"><b>一廠 · 欠貨品項</b></div>' +
          '<div class="row2">' + field('f1.shipDate', '出貨日期', D.f1.shipDate, 'date') + field('f1.vendor', '廠商', D.f1.vendor) + '</div>' +
          field('f1.desc', '描述／品號', D.f1.desc) +
          '<div class="row2">' + field('f1.shortQty', '欠貨數量', D.f1.shortQty, 'number') + field('f1.note', '備註', D.f1.note) + '</div>' +
          '<div class="rush-sec f2"><b>二廠 · 加工回覆</b></div>' +
          '<div class="row2">' + field('f2.startDate', '開工時間', D.f2.startDate, 'date') + field('f2.dueDate', '預計完成日期', D.f2.dueDate, 'date') + '</div>' +
          field('f2.itemProcess', '品號／製程', D.f2.itemProcess) +
          '<div class="row2">' + field('f2.desc', '描述', D.f2.desc) + field('f2.qty', '數量', D.f2.qty, 'number') + '</div>' +
          field('f2.note', '備註', D.f2.note) +
          '<div class="hint">空白表示待確認；系統不推測數量、日期或品號。</div>',
        foot: '<button class="btn" data-act="close">取消</button>' +
          (m.id && canEdit() ? '<button class="btn danger" data-act="rush-del">' + (m.confirmDel ? '再按一次刪除' : '刪除') + '</button><div class="spacer"></div>' : '<div class="spacer"></div>') +
          (canEdit() ? '<button class="btn primary" data-act="rush-save">儲存</button>' : '')
      };
    }
  };

  const actions = {
    'rush-new': () => { if (canEdit()) open({ t: 'rush-edit' }); },
    'rush-edit': a => open({ t: 'rush-edit', id: a.dataset.id }),
    'rush-del': a => {
      if (!canEdit()) return;
      const m = ui.modal;
      if (!m.confirmDel) { m.confirmDel = true; open(m); return; }
      commitRush(rows().filter(r => r.id !== m.id), '刪除一列特別趕貨紀錄');
      toast('已刪除');
    },
    'rush-save': safe(() => {
      syncInputs();
      const m = ui.modal, D = m.draft;
      for (const side of ['f1', 'f2']) {
        D[side] ||= {};
        for (const [k, v] of Object.entries(D[side])) {
          if (typeof v === 'string') D[side][k] = v.trim();
        }
        for (const k of ['shortQty', 'qty']) {
          if (D[side][k] === '' || D[side][k] === undefined) D[side][k] = null;
          else if (D[side][k] !== null) D[side][k] = Number(D[side][k]);
        }
      }
      commitRush(rows().filter(r => r.id !== D.id).concat(D), m.id ? '更新特別趕貨紀錄' : '新增特別趕貨紀錄');
      toast('已儲存');
    })
  };
  return { modals, actions };
}
