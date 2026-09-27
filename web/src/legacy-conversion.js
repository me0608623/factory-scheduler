// 舊版原表只提供每日欄位安排。這裡僅建立可核對的轉換草稿；
// 不推測起訖時間、工單件數、產能、技能，也不產生正式排程方塊。
const DAY_MS = 86_400_000;

function dayNumber(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) throw new Error("日期須為 YYYY-MM-DD");
  const time = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== value) {
    throw new Error(`日期不存在：${value}`);
  }
  return time / DAY_MS;
}

function dateAt(day) { return new Date(day * DAY_MS).toISOString().slice(0, 10); }

export function buildLegacyConversionDraft(legacy, targetStart) {
  if (!legacy?.dates?.length || !legacy?.days || !legacy?.catalog) throw new Error("歷史排程缺少日期或名冊");
  const firstDay = dayNumber(legacy.dates[0]);
  const targetDay = dayNumber(targetStart);
  const factories = ["1廠", "2廠"];
  const stations = [], people = [], work = [], dates = [];
  let previous = firstDay - 1;
  for (const sourceDate of legacy.dates) {
    const sourceDay = dayNumber(sourceDate);
    if (sourceDay <= previous) throw new Error("歷史排程日期不是遞增且唯一");
    previous = sourceDay;
    const targetDate = dateAt(targetDay + sourceDay - firstDay);
    dates.push({ sourceDate, targetDate });
    for (const factory of factories) {
      for (const item of legacy.days[sourceDate]?.[factory] || []) {
        work.push({ sourceDate, targetDate, factory, sourceCell: item.cell,
          stationLabel: item.machine, operatorLabel: item.operator || "", rawText: item.value,
          status: "pending", missing: ["machine_confirmation", "employee_confirmation", "order", "quantity", "start", "end", "process_rate"] });
      }
    }
  }
  for (const factory of factories) {
    for (const item of legacy.catalog[factory]?.stations || []) {
      stations.push({ factory, sourceCell: item.cell, label: item.label, status: "pending", kind: "station_candidate" });
    }
    for (const item of legacy.catalog[factory]?.people || []) {
      people.push({ factory, sourceCell: item.cell, label: item.label, status: "pending",
        kind: /[+＋]/.test(item.label) ? "team_candidate" : "person_candidate" });
    }
  }
  return { sourceStart: legacy.dates[0], targetStart, dates, stations, people, work,
    scheduleBlocks: [], solverReady: false };
}
