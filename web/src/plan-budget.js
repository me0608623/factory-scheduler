// 每個預覽方案的求解秒數；大型案量的受限候選需要較長時間找可行解。
export function planTimeLimit(state) {
  const steps = new Map((state.products || []).map(product => [product.id, product.steps?.length || 0]));
  const operations = (state.orders || []).reduce((total, order) => total + (steps.get(order.pid) || 0), 0);
  return operations >= 2200 ? 5 : 3;
}
