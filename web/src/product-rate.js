// Product steps persist as positive numeric(8,3). Validate the original decimal
// text before Number can discard digits; never expand an untrusted exponent.
export function productRate(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const match = /^\+?(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(String(value).trim());
  if (!match || !(match[1] || match[2])) return null;
  const fraction = match[2] || '';
  const digits = (match[1] + fraction).replace(/^0+/, '');
  if (!digits) return null;
  const significant = digits.replace(/0+$/, '');
  const exponent = Number(match[3] || 0);
  const scale = exponent - fraction.length + digits.length - significant.length;
  if (!Number.isFinite(exponent) || scale < -3 || significant.length + scale > 5) return null;
  const rate = Number(value);
  return Number.isFinite(rate) && rate >= 0.001 && rate <= 99999.999 && Number(rate.toFixed(3)) === rate ? rate : null;
}
