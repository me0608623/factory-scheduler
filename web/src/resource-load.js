// Read-only analysis of the saved schedule, not a capacity/feasibility promise.
import { inFactory } from './factory.js';
import { overtimeAllowed } from './overtime.js';

const valid = ([s, e]) => Number.isFinite(s) && Number.isFinite(e) && s >= 0 && e <= 1440 && s < e;
export function unionIntervals(intervals) {
  const result = [];
  for (const [s, e] of intervals.filter(valid).map(x => [...x]).sort((a, b) => a[0] - b[0])) {
    const last = result.at(-1);
    if (last && s <= last[1]) last[1] = Math.max(last[1], e);
    else result.push([s, e]);
  }
  return result;
}
const minutes = intervals => intervals.reduce((total, [s, e]) => total + e - s, 0);
export function subtractIntervals(windows, busy) {
  const result = [], occupied = unionIntervals(busy);
  for (const [s, e] of unionIntervals(windows)) {
    let cursor = s;
    for (const [bs, be] of occupied) {
      if (be <= cursor || bs >= e) continue;
      if (bs > cursor) result.push([cursor, bs]);
      cursor = Math.max(cursor, be);
      if (cursor >= e) break;
    }
    if (cursor < e) result.push([cursor, e]);
  }
  return result;
}
function occupancy(intervals, limit) {
  const events = intervals.flatMap(([s, e]) => [[s, 1], [e, -1]]).sort((a, b) => a[0] - b[0]);
  let count = 0, previous = null, peak = 0;
  const overloaded = [];
  for (let i = 0; i < events.length;) {
    const at = events[i][0];
    if (previous !== null && at > previous && count > limit) overloaded.push([previous, at]);
    while (i < events.length && events[i][0] === at) count += events[i++][1];
    peak = Math.max(peak, count);
    previous = at;
  }
  return { peak, overloadMinutes: minutes(unionIntervals(overloaded)) };
}
function metrics(resource, blocks, available, pending, limit) {
  const intervals = blocks.map(b => [b.s, b.e]), busy = unionIntervals(intervals);
  const busyMinutes = minutes(busy), assignedMinutes = minutes(intervals);
  const availability = pending ? null : minutes(available);
  const outsideMinutes = pending ? null : minutes(subtractIntervals(busy, available));
  const occupiedMinutes = pending ? null : busyMinutes - outsideMinutes;
  const free = pending ? [] : subtractIntervals(available, busy);
  const longest = free.reduce((best, iv) => !best || iv[1] - iv[0] > best[1] - best[0] ? iv : best, null);
  const concurrency = occupancy(intervals, limit);
  return { id: resource.id, name: resource.name || resource.label || resource.id,
    factory: resource.factory || 1, pending, blockCount: blocks.length, assignedMinutes, busyMinutes,
    availableMinutes: availability, occupiedMinutes, outsideMinutes,
    utilization: availability > 0 ? occupiedMinutes / availability : null,
    freeMinutes: pending ? null : minutes(free), free, longest,
    limit: pending ? null : limit, peak: concurrency.peak,
    overloadMinutes: pending ? null : concurrency.overloadMinutes };
}
export function resourceLoad(state, date, windows, factory = 'all') {
  const dayBlocks = (state.blocks || []).filter(b => b.date === date);
  const invalidBlocks = dayBlocks.filter(b => !valid([b.s, b.e])).length;
  const goodBlocks = dayBlocks.filter(b => valid([b.s, b.e]));
  const allEmployees = state.employees || [], allMachines = state.machines || [];
  const employeeIds = new Set(allEmployees.map(e => e.id)), machineIds = new Set(allMachines.map(m => m.id));
  const missingResources = dayBlocks.filter(b => !employeeIds.has(b.emp) || !machineIds.has(b.m)).length;
  const byMachine = new Map(), byEmployee = new Map();
  for (const b of goodBlocks) {
    if (!byMachine.has(b.m)) byMachine.set(b.m, []);
    if (!byEmployee.has(b.emp)) byEmployee.set(b.emp, []);
    byMachine.get(b.m).push(b); byEmployee.get(b.emp).push(b);
  }
  const machineWindows = unionIntervals(windows.map(w => [w.s, w.e]));
  const machines = allMachines.filter(m => inFactory(m, factory)).map(m => {
    // A repaired fault still blocked this historical interval, matching the scheduler.
    const faults = (m.faults || []).filter(f => f.date === date).map(f => [f.s, f.e]);
    const available = subtractIntervals(machineWindows, faults);
    const row = metrics(m, byMachine.get(m.id) || [], available,
      !!state.setupPending || m.reviewStatus === 'pending', 1);
    row.faultMinutes = row.pending ? null : minutes(machineWindows) - minutes(available);
    row.invalidFaults = faults.filter(iv => !valid(iv)).length;
    return row;
  });
  const employees = allEmployees.filter(e => inFactory(e, factory)).map(e => {
    const leave = (e.leaves || []).includes(date);
    const available = leave ? [] : unionIntervals(windows.filter(w => !w.ot || overtimeAllowed(e, date)).map(w => [w.s, w.e]));
    const limit = Number.isInteger(e.maxMachines) && e.maxMachines > 0 ? e.maxMachines : 1;
    return { ...metrics(e, byEmployee.get(e.id) || [], available,
      !!state.setupPending || e.reviewStatus === 'pending', limit), leave };
  });
  // Show confirmed anomalies first; then highest occupancy. Unknown capacity sorts last.
  const sort = (a, b) => (b.overloadMinutes + (b.outsideMinutes || 0)) - (a.overloadMinutes + (a.outsideMinutes || 0)) ||
    (b.utilization ?? -1) - (a.utilization ?? -1) || a.name.localeCompare(b.name, 'zh-Hant');
  return { date, factory, machines: machines.sort(sort), employees: employees.sort(sort), invalidBlocks, missingResources,
    invalidWindows: windows.filter(w => !valid([w.s, w.e])).length };
}
