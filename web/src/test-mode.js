export function nearestScheduleDate(blocks, machineIds, currentDate) {
  const allowed = new Set(machineIds || []);
  const dates = [...new Set((blocks || [])
    .filter(block => allowed.has(block?.m) && /^\d{4}-\d{2}-\d{2}$/.test(block?.date || ''))
    .map(block => block.date))];
  if (!dates.length) return null;
  const base = Date.parse(`${currentDate}T00:00:00Z`);
  return dates.sort((a, b) => {
    const da = Math.abs(Date.parse(`${a}T00:00:00Z`) - base);
    const db = Math.abs(Date.parse(`${b}T00:00:00Z`) - base);
    return da - db || a.localeCompare(b);
  })[0];
}

export function scheduledMachinesFirst(machines, blocks, date) {
  const active = new Set((blocks || [])
    .filter(block => block?.date === date)
    .map(block => block.m));
  return (machines || [])
    .map((machine, index) => ({machine, index, active: active.has(machine?.id)}))
    .sort((a, b) => Number(b.active) - Number(a.active) || a.index - b.index)
    .map(entry => entry.machine);
}
