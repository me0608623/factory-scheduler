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
