// 廠區平面圖（2D Canvas，無新依賴）
// 狀態：故障（紅）＞ 當日有排程（藍）＞ 閒置（灰）。唯讀視圖，不吃任何寫入。
// 座標：machine_layout 的 x/y 為 0–100 的廠內正規化座標；沒有佈局資料時自動按工序分組排列。
// 手機：欄數由呼叫端依寬度決定（cols），格子帶自身 w/h（正規化單位）；觸控以點擊 toast 取代 hover。

const STATUS_COLOR = { fault: "#DC2626", busy: "#315FA7", idle: "#9AA3AF" };

// 純邏輯：算出每台機台的格子（位置、狀態、當日摘要）。S 為畫面狀態。
export function floorCells(S, factory, date, cols = 9) {
  cols = Math.max(1, Math.min(9, Math.floor(cols)));
  const machines = (S.machines || []).filter((m) => (m.factory || 1) === factory);
  const blocks = (S.blocks || []).filter((b) => b.date === date);
  const faults = (S.machines || []).reduce((a, m) => a.concat((m.faults || []).map((f) => ({ machineId: m.id, ...f }))), [])
    .filter((f) => f.date === date && !f.fixed);
  const layout = new Map((S.machineLayout || []).filter((l) => l.x != null && l.y != null)
    .map((l) => [l.machineId, l]));
  const cells = machines.map((m) => {
    const bs = blocks.filter((b) => b.m === m.id);
    const codes = [...new Set(bs.map((b) => (S.orders.find((o) => o.id === b.oid) || {}).code).filter(Boolean))];
    const emps = [...new Set(bs.map((b) => (S.employees.find((e) => e.id === b.emp) || {}).name).filter(Boolean))];
    const status = faults.some((f) => f.machineId === m.id) ? "fault"
      : bs.length ? "busy" : "idle";
    return { id: m.id, label: m.label || m.id, process: m.proc || "", status,
      detail: [codes.join("、"), emps.join("、")].filter(Boolean).join("｜"),
      loadMin: bs.reduce((t, b) => t + (b.e - b.s), 0), x: null, y: null, w: 10, h: 8 };
  });
  // 有佈局資料的機台用佈局；其餘自動排列到沒被佔用的區域（格寬依欄數縮放）
  const stepX = 100 / cols, gapX = stepX * 0.12;
  const autoW = stepX - gapX, used = [];
  const free = (x, y, w, h) => !used.some((r) => x < r.x + r.w && x + w > r.x && y < r.y + r.h && y + h > r.y);
  for (const c of cells) {
    const l = layout.get(c.id);
    if (l) { c.x = +l.x; c.y = +l.y; used.push({ x: c.x, y: c.y, w: c.w, h: c.h }); }
  }
  let cursor = 0;
  const auto = cells.filter((c) => c.x == null)
    .sort((a, b) => (a.process || "").localeCompare(b.process || "", "zh") || a.id.localeCompare(b.id));
  for (const c of auto) {
    c.w = autoW;
    for (;;) {
      const x = (cursor % cols) * stepX, y = Math.floor(cursor / cols) * 9;
      if (free(x, y, c.w, c.h)) { c.x = x; c.y = y; used.push({ x, y, w: c.w, h: c.h }); break; }
      if (++cursor > 999) { c.x = 0; c.y = 0; break; }
    }
  }
  return cells;
}

// 渲染到 canvas。回傳每格的螢幕矩形供 hover/click 命中。
export function renderFloor(canvas, cells, opts = {}) {
  const dpr = Math.min(opts.pixelRatio || window.devicePixelRatio || 1, 2);
  const W = Math.max(320, canvas.clientWidth || 900);
  const maxRows = Math.max(1, Math.ceil(Math.max(...cells.map((c) => c.y + c.h), 8) / 9));
  const H = 40 + maxRows * 9 * (W / 100);
  canvas.width = W * dpr; canvas.height = H * dpr;
  canvas.style.height = H + "px";
  const g = canvas.getContext("2d"); g.scale(dpr, dpr);
  const k = W / 100;
  const cs = getComputedStyle(document.documentElement);
  const ink = cs.getPropertyValue("--ink").trim() || "#20252C";
  const surface = cs.getPropertyValue("--surface").trim() || "#FFFFFF";
  const line = cs.getPropertyValue("--line").trim() || "#D4D9E0";
  const rects = [];
  for (const c of cells) {
    const x = c.x * k, y = 40 + c.y * k, cellW = c.w * k, cellH = c.h * k;
    const fMain = Math.max(11, Math.round(cellH * 0.24));
    const fSub = Math.max(10, Math.round(cellH * 0.19));
    g.font = `${fMain}px "Microsoft JhengHei UI",sans-serif`;
    g.fillStyle = STATUS_COLOR[c.status] || STATUS_COLOR.idle;
    g.globalAlpha = c.status === "idle" ? 0.35 : 0.85;
    g.beginPath(); g.roundRect(x, y, cellW, cellH, Math.min(6, cellW / 8)); g.fill();
    g.globalAlpha = 1; g.strokeStyle = line; g.stroke();
    g.fillStyle = surface; g.textAlign = "center";
    const maxChars = Math.max(2, Math.floor(cellW / (fMain * 0.9)));
    g.fillText(c.label.slice(0, maxChars), x + cellW / 2, y + cellH * 0.42);
    g.fillStyle = ink; g.font = `${fSub}px sans-serif`;
    g.fillText(c.status === "fault" ? "故障" : c.loadMin ? Math.round(c.loadMin / 60) + "h" : "", x + cellW / 2, y + cellH * 0.74);
    rects.push({ cell: c, x, y, w: cellW, h: cellH });
  }
  return rects;
}

export function hitFloor(rects, px, py) {
  return rects.find((r) => px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) || null;
}
