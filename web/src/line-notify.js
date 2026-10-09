import { tx } from './i18n.js';
// LINE 通知：前端設定 + 推播觸發
// 需要在 Render solver 環境變數設定 LINE_CHANNEL_ACCESS_TOKEN 才能實際寄送

const LINE_EVENTS = [
  ['schedule_change', '排程變更', '別人調整排程時通知'],
  ['leave_request', '請假待批', '有人提交請假詢問時通知'],
  ['rush_order', '急單/趕貨', '新增急單或趕貨紀錄時通知'],
  ['fault', '設備故障', '設備報故障時通知'],
  ['daily_summary', '每日摘要', '每天早上 8:00 推播今日排程摘要'],
];

export async function sendLineNotify(solverUrl, jwt, event, message) {
  // 透過 solver 轉發（channel token 存在 Render 環境變數，不進前端）
  try {
    const res = await fetch(solverUrl + '/notify/line', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + jwt },
      body: JSON.stringify({ event, message }),
    });
    return res.ok;
  } catch { return false; }
}

export function notifySettingsHTML(current) {
  const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const s = current || { enabled: false, line_user_id: '', line_group_id: '', events: {} };
  return '<div class="field"><label class="setting-toggle" style="display:flex;align-items:center;gap:10px">' +
    '<input type="checkbox" id="ln-enabled"' + (s.enabled ? ' checked' : '') + '><span><b>'+tx('啟用 LINE 通知')+'</b></span></label></div>' +
    '<div class="field"><label for="ln-user">'+tx('LINE User ID（選填）')+'</label>' +
    '<input class="inp" id="ln-user" value="' + esc(s.line_user_id || '') + '" placeholder="U1234567890abcdef..." autocomplete="off"></div>' +
    '<div class="field"><label for="ln-group">'+tx('LINE 群組 ID（選填）')+'</label>' +
    '<input class="inp" id="ln-group" value="' + esc(s.line_group_id || '') + '" placeholder="C1234567890..." autocomplete="off"></div>' +
    '<div class="field"><span class="lab">'+tx('要通知的事件')+'</span><div class="toggles">' +
    LINE_EVENTS.map(([k, name, desc]) =>
      '<label class="permission-row"><input type="checkbox" data-ln-event="' + k + '"' +
      (s.events?.[k] !== false ? ' checked' : '') + '><span><b>' + name + '</b><small>' + desc + '</small></span></label>'
    ).join('') + '</div></div>' +
    '<div class="hint">需要到 LINE Developers Console 建立 Messaging API Channel，把 Channel Access Token 設定到 Render 環境變數 LINE_CHANNEL_ACCESS_TOKEN。</div>';
}
