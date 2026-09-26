// 手動排班：預估件數與工單剩餘量。時間以分鐘計，未排入的件數不會憑空消失。
export function remainingQty(orderQty, blocks, orderId, step, exceptId = null) {
  const scheduled = blocks.reduce((total, b) => total +
    (b.oid === orderId && b.step === step && b.id !== exceptId ? Number(b.qty) || 0 : 0), 0);
  return Math.max(0, orderQty - scheduled);
}

export function quantityForMinutes(minutes, rate, remaining) {
  if (!(minutes > 0) || !(rate > 0) || !(remaining > 0)) return 0;
  return Math.min(remaining, Math.floor(minutes * rate + 1e-8));
}

// 交接批量完成後即可開工；不必等前站的整張工單排完。
export function batchReadyMinute(orderQty, batch, blocks, orderId, step, toAbs, excludeIds = new Set()) {
  if (step === 0) return 0;
  const required = batch > 0 && batch < orderQty ? batch : orderQty;
  const previous = blocks.filter(b => b.oid === orderId && b.step === step - 1 && !excludeIds.has(b.id))
    .filter(b => Number(b.qty) > 0 && b.e > b.s);
  if (previous.reduce((total, b) => total + (Number(b.qty) || 0), 0) < required) return Infinity;
  const points = [...new Set(previous.flatMap(b => [toAbs(b.date, b.s), toAbs(b.date, b.e)]))]
    .sort((a, b) => a - b);
  const produced = at => previous.reduce((total, b) => {
    const start = toAbs(b.date, b.s), end = toAbs(b.date, b.e);
    return total + Number(b.qty) * Math.max(0, Math.min(1, (at - start) / (end - start)));
  }, 0);
  let earlier = points[0], made = produced(earlier);
  for (const at of points.slice(1)) {
    const next = produced(at);
    if (next + 1e-8 >= required) {
      const crossed = earlier + (required - made) / (next - made) * (at - earlier);
      return Math.min(at, Math.ceil((crossed - 1e-8) / 10) * 10);
    }
    earlier = at;
    made = next;
  }
  return Infinity;
}

// 比較每個開始／結束時點的累積產量，避免後站做出尚未取得的件數。
export function materialFlowIssue(blocks, orderId, step, toAbs) {
  if (step === 0) return false;
  const previous = blocks.filter(b => b.oid === orderId && b.step === step - 1);
  const current = blocks.filter(b => b.oid === orderId && b.step === step);
  if (!current.length) return false;
  const points = [...new Set([...previous, ...current].flatMap(b => [toAbs(b.date, b.s), toAbs(b.date, b.e)]))]
    .sort((a, b) => a - b);
  const produced = (items, at) => items.reduce((total, b) => {
    const start = toAbs(b.date, b.s), end = toAbs(b.date, b.e);
    return total + (Number(b.qty) || 0) * Math.max(0, Math.min(1, (at - start) / (end - start)));
  }, 0);
  return points.some(at => produced(current, at) > produced(previous, at) + 0.5);
}
