// A work order can visit both factories; its product steps decide where each stage runs.
export const FACTORIES = [1, 2];
export const factoryOf = item => FACTORIES.includes(Number(item?.factory)) ? Number(item.factory) : 1;
export const factoryName = value => `${factoryOf({ factory: value })} 廠`;
export const inFactory = (item, selected) => selected === "all" || factoryOf(item) === selected;
export const orderFactories = (order, products) => {
  const product = products.find(p => p.id === order.pid);
  return [...new Set((product?.steps || []).map(factoryOf))];
};
export const orderRoute = (order, products) => {
  const product = products.find(p => p.id === order.pid);
  return (product?.steps || []).map(factoryOf).filter((value, index, values) => index === 0 || value !== values[index - 1]);
};
export const orderInFactory = (order, products, selected) =>
  selected === "all" || orderFactories(order, products).includes(selected);
export const compatible = (employee, machine, product, step) =>
  !!employee && !!machine && !!product && !!step &&
  factoryOf(employee) === factoryOf(machine) && factoryOf(machine) === factoryOf(step) &&
  employee.skills.includes(machine.id) && machine.proc === step.proc && machine.products.includes(product.id);
