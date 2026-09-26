// 每個預覽方案的求解秒數；大型案量的受限候選需要較長時間找可行解。
export function planTimeLimit(state) {
  const steps = new Map((state.products || []).map(product => [product.id, product.steps?.length || 0]));
  const operations = (state.orders || []).reduce((total, order) => total + (steps.get(order.pid) || 0), 0);
  return operations >= 2200 ? 10 : 3;
}

export function planEngineLabel(method, engine) {
  if (method === "skipped") return "尚未計算（整體等待上限）";
  if (method === "restricted_pairs") return "OR-Tools 快速初稿（可行但不保證最佳）";
  return engine === "OR-Tools" ? "OR-Tools" : "瀏覽器備援";
}
