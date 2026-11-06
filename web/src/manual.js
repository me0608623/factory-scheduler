// 已完成的工作以現場回報為準；尚未完成仍以排定件數保留產能。
export function effectiveBlockQty(block, execution = []) {
  const report = execution.find(r => r.blockId === block.id && r.status === "done");
  return report ? Number(report.qtyDone) || 0 : Number(block.qty) || 0;
}

// Only quantity reductions are checked: unrelated legacy over-allocation must not
// prevent other edits. Completed blocks retain nominal history but count actuals.
export function assertOrderReductions(before, after) {
  const oldQty = new Map((before?.orders || []).map(o => [o.id, Number(o.qty)]));
  const reduced = new Map((after.orders || []).filter(o => oldQty.has(o.id) && Number(o.qty) < oldQty.get(o.id)).map(o => [o.id, o]));
  if (!reduced.size) return;
  const totals = new Map();
  for (const b of after.blocks || []) {
    const order = reduced.get(b.oid);
    if (!order) continue;
    let steps = totals.get(b.oid);
    if (!steps) totals.set(b.oid, steps = new Map());
    const step = Number(b.step);
    const qty = (steps.get(step) || 0) + effectiveBlockQty(b, after.execution || []);
    steps.set(step, qty);
    if (qty > Number(order.qty)) throw new Error('工單 ' + (order.code || order.id) + ' 第 ' + (step + 1) + ' 道工序：實際完成加待做件數超過工單件數');
  }
}

// 手動排班：預估件數與工單剩餘量。時間以分鐘計，未排入或完工短少的件數不會憑空消失。
export function remainingQty(orderQty, blocks, orderId, step, exceptId = null, execution = []) {
  const scheduled = blocks.reduce((total, b) => total +
    (b.oid === orderId && b.step === step && b.id !== exceptId ? effectiveBlockQty(b, execution) : 0), 0);
  return Math.max(0, orderQty - scheduled);
}

export function quantityForMinutes(minutes, rate, remaining) {
  if (!(minutes > 0) || !(rate > 0) || !(remaining > 0)) return 0;
  return Math.min(remaining, Math.floor(minutes * rate + 1e-8));
}

// 交接批量完成後即可開工；不必等前站的整張工單排完。
export function batchReadyMinute(orderQty, batch, blocks, orderId, step, toAbs, excludeIds = new Set(), execution = []) {
  if (step === 0) return 0;
  const required = batch > 0 && batch < orderQty ? batch : orderQty;
  const previous = blocks.filter(b => b.oid === orderId && b.step === step - 1 && !excludeIds.has(b.id))
    .filter(b => effectiveBlockQty(b, execution) > 0 && b.e > b.s);
  if (previous.reduce((total, b) => total + effectiveBlockQty(b, execution), 0) < required) return Infinity;
  const points = [...new Set(previous.flatMap(b => [toAbs(b.date, b.s), toAbs(b.date, b.e)]))]
    .sort((a, b) => a - b);
  const produced = at => previous.reduce((total, b) => {
    const start = toAbs(b.date, b.s), end = toAbs(b.date, b.e);
    return total + effectiveBlockQty(b, execution) * Math.max(0, Math.min(1, (at - start) / (end - start)));
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
export function materialFlowIssue(blocks, orderId, step, toAbs, execution = []) {
  if (step === 0) return false;
  const previous = blocks.filter(b => b.oid === orderId && b.step === step - 1);
  const current = blocks.filter(b => b.oid === orderId && b.step === step);
  if (!current.length) return false;
  const points = [...new Set([...previous, ...current].flatMap(b => [toAbs(b.date, b.s), toAbs(b.date, b.e)]))]
    .sort((a, b) => a - b);
  const produced = (items, at) => items.reduce((total, b) => {
    const start = toAbs(b.date, b.s), end = toAbs(b.date, b.e);
    return total + effectiveBlockQty(b, execution) * Math.max(0, Math.min(1, (at - start) / (end - start)));
  }, 0);
  return points.some(at => produced(current, at) > produced(previous, at) + 0.5);
}
