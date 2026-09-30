// 備援排程與手動拖曳共用：找出員工已達（或超過）顧機台上限的時段。
export function capacityIntervals(blocks, day, employee, excludedIds = new Set(), extra = 0) {
  if (!employee) return [];
  const events = [];
  for (const block of blocks) {
    if (block.date === day && block.emp === employee.id && !excludedIds.has(block.id)) {
      const demand=block.weight||1;
      events.push([block.s, demand], [block.e, -demand]);
    }
  }
  events.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const full = [], limit = (employee.maxMachines || 1) + extra;
  let active = 0, last = null, index = 0;
  while (index < events.length) {
    const minute = events[index][0];
    if (last !== null && minute > last && active >= limit) full.push([last, minute]);
    while (index < events.length && events[index][0] === minute) active += events[index++][1];
    last = minute;
  }
  const merged = [];
  for (const interval of full) {
    const previous = merged.at(-1);
    if (previous && interval[0] <= previous[1]) previous[1] = Math.max(previous[1], interval[1]);
    else merged.push(interval);
  }
  return merged;
}
