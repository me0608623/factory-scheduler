// 0 = 週日。舊資料只有 noOT 時，沿用原本「全部可／全部不可」的意思。
export const ALL_WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];

export function overtimeWeekdays(employee) {
  return Array.isArray(employee.otWeekdays)
    ? employee.otWeekdays.filter(w => Number.isInteger(w) && w >= 0 && w <= 6)
    : employee.noOT ? [] : [...ALL_WEEKDAYS];
}

export function overtimeDefault(employee, date) {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  return overtimeWeekdays(employee).includes(weekday);
}

export function overtimeStatus(employee, date) {
  const overrides = employee.otOverrides || {};
  const custom = Object.prototype.hasOwnProperty.call(overrides, date);
  return { available: custom ? !!overrides[date] : overtimeDefault(employee, date), custom };
}

export function overtimeAllowed(employee, date) {
  return overtimeStatus(employee, date).available;
}
