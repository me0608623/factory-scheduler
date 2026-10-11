// 測試種子資料：兩廠、12 員工、8 機台（含人工工位）、20 工單
// 設計原則：
// - 全部以「測試」前綴命名，避免與任何真實資料混淆
// - 工時/技能/數量/交期完整可計算，無待確認資料冒充已核對
// - 涵蓋：跨廠加工、多人同機、同人顧多台、已固定工作、休假、
//   機台故障、缺料（欠缺品項）、急單、可能逾期
// - 種子日期錨定在「下週一」——登入後點「今天」旁的日期即可找到

export function buildTestSeed(todayStr, addDays) {
  // 找下一個週一（或今天就是週一）
  const d = new Date(todayStr + "T00:00:00Z");
  const dow = d.getUTCDay(); // 0=Sun
  const daysToMonday = dow === 1 ? 0 : dow === 0 ? 1 : 8 - dow;
  const mon = addDays(todayStr, daysToMonday);
  const D = n => addDays(mon, n);

  return {
    v: 1, demo: false, savedAt: new Date().toISOString(),
    dayOT: {}, cal: { week: [false, true, true, true, true, true, false], over: {} },
    log: [], blocks: [], leaveRequests: [], memos: [],
    groups: [
      { id: "g1", name: "測試-一班", department: "裁切組", homeFactory: 1 },
      { id: "g2", name: "測試-二班", department: "組裝組", homeFactory: 2 },
    ],
    groupMembers: [],
    employees: [
      // === 1 廠 8 人 ===
      { id: "t-e01", name: "測試-陳一", color: 0, factory: 1, skills: ["t-m01", "t-m02", "t-m08"], maxMachines: 1, leaves: [], noOT: false, otWeekdays: [0,1,2,3,4,5,6], otOverrides: {}, reviewStatus: "confirmed" },
      { id: "t-e02", name: "測試-林二", color: 1, factory: 1, skills: ["t-m01", "t-m03", "t-m08"], maxMachines: 1, leaves: [], noOT: false, otWeekdays: [0,1,2,3,4,5,6], otOverrides: {}, reviewStatus: "confirmed" },
      { id: "t-e03", name: "測試-王三", color: 2, factory: 1, skills: ["t-m04", "t-m08"], maxMachines: 2, leaves: [D(2)], noOT: false, otWeekdays: [0,1,2,3,4,5,6], otOverrides: {}, reviewStatus: "confirmed" },
      { id: "t-e04", name: "測試-劉四", color: 3, factory: 1, skills: ["t-m05", "t-m08"], maxMachines: 1, leaves: [], noOT: false, otWeekdays: [0,1,2,3,4,5,6], otOverrides: {}, reviewStatus: "confirmed" },
      { id: "t-e05", name: "測試-張五", color: 4, factory: 1, skills: ["t-m01", "t-m02", "t-m04", "t-m08"], maxMachines: 3, leaves: [], noOT: true, otWeekdays: [], otOverrides: {}, reviewStatus: "confirmed" },
      { id: "t-e06", name: "測試-趙六", color: 5, factory: 1, skills: ["t-m03", "t-m05", "t-m08"], maxMachines: 1, leaves: [], noOT: false, otWeekdays: [0,1,2,3,4,5,6], otOverrides: {}, reviewStatus: "confirmed" },
      { id: "t-e07", name: "測試-孫七", color: 6, factory: 1, skills: ["t-m02", "t-m04", "t-m08"], maxMachines: 2, leaves: [], noOT: false, otWeekdays: [0,1,2,3,4,5,6], otOverrides: {}, reviewStatus: "confirmed" },
      { id: "t-e08", name: "測試-周八", color: 7, factory: 1, skills: ["t-m05", "t-m08"], maxMachines: 1, leaves: [D(4)], noOT: false, otWeekdays: [0,1,2,3,4,5,6], otOverrides: {}, reviewStatus: "confirmed" },
      // === 2 廠 4 人 ===
      { id: "t-e09", name: "測試-吳九", color: 0, factory: 2, skills: ["t-m06", "t-m07", "t-m08"], maxMachines: 1, leaves: [], noOT: false, otWeekdays: [0,1,2,3,4,5,6], otOverrides: {}, reviewStatus: "confirmed" },
      { id: "t-e10", name: "測試-鄭十", color: 1, factory: 2, skills: ["t-m06", "t-m07", "t-m08"], maxMachines: 1, leaves: [], noOT: false, otWeekdays: [0,1,2,3,4,5,6], otOverrides: {}, reviewStatus: "confirmed" },
      { id: "t-e11", name: "測試-馮十一", color: 2, factory: 2, skills: ["t-m06", "t-m08"], maxMachines: 2, leaves: [], noOT: false, otWeekdays: [0,1,2,3,4,5,6], otOverrides: {}, reviewStatus: "confirmed" },
      { id: "t-e12", name: "測試-褚十二", color: 3, factory: 2, skills: ["t-m07", "t-m08"], maxMachines: 1, leaves: [], noOT: false, otWeekdays: [0,1,2,3,4,5,6], otOverrides: {}, reviewStatus: "confirmed" },
    ],
    machines: [
      // === 1 廠：裁切×2、沖壓、焊接、組裝 ===
      { id: "t-m01", label: "測試-裁切機A", proc: "裁切", products: ["t-p1", "t-p2"], factory: 1, faults: [] },
      { id: "t-m02", label: "測試-裁切機B", proc: "裁切", products: ["t-p1"], factory: 1, faults: [] },
      { id: "t-m03", label: "測試-沖壓機", proc: "沖壓", products: ["t-p1", "t-p3"], factory: 1, faults: [] },
      { id: "t-m04", label: "測試-焊接機", proc: "焊接", products: ["t-p2", "t-p3"], factory: 1, faults: [{ date: D(3), s: 480, e: 600, note: "測試-上午故障", fixed: false }] },
      { id: "t-m05", label: "測試-組裝線", proc: "組裝", products: ["t-p1", "t-p2", "t-p3"], factory: 1, faults: [] },
      // === 2 廠：電鍍、檢驗 ===
      { id: "t-m06", label: "測試-電鍍槽", proc: "電鍍", products: ["t-p4"], factory: 2, faults: [] },
      { id: "t-m07", label: "測試-檢驗台", proc: "檢驗", products: ["t-p4"], factory: 2, faults: [] },
      // === 跨廠共用人工工位 ===
      { id: "t-m08", label: "測試-搬運工位", proc: "搬運", products: ["t-p1", "t-p2", "t-p3", "t-p4"], factory: 1, faults: [] },
    ],
    products: [
      // === 1 廠產品（含跨廠到 2 廠的工序）===
      { id: "t-p1", name: "測試-外殼", steps: [
        { proc: "裁切", rate: 2, batch: 0, factory: 1 },
        { proc: "沖壓", rate: 3, batch: 60, factory: 1 },
        { proc: "電鍍", rate: 1.5, batch: 30, factory: 2 },   // 跨廠：1廠做半成品→2廠電鍍
        { proc: "組裝", rate: 4, batch: 0, factory: 1 } ] },  // 回1廠組裝
      { id: "t-p2", name: "測試-支架", steps: [
        { proc: "裁切", rate: 1.5, batch: 0, factory: 1 },
        { proc: "焊接", rate: 1, batch: 0, factory: 1 },
        { proc: "組裝", rate: 4, batch: 0, factory: 1 } ] },
      { id: "t-p3", name: "測試-底座", steps: [
        { proc: "沖壓", rate: 2, batch: 0, factory: 1 },
        { proc: "焊接", rate: 1.5, batch: 0, factory: 1 },
        { proc: "檢驗", rate: 3, batch: 0, factory: 2 },      // 跨廠檢驗
        { proc: "組裝", rate: 3, batch: 0, factory: 1 } ] },
      // === 2 廠自製產品 ===
      { id: "t-p4", name: "測試-散熱片", steps: [
        { proc: "電鍍", rate: 2, batch: 0, factory: 2 },
        { proc: "檢驗", rate: 4, batch: 0, factory: 2 } ] },
    ],
    orders: [
      // 正常單（期限充裕）
      { id: "t-o01", code: "測試A01", pid: "t-p1", qty: 120, due: D(6), pri: 1 },
      { id: "t-o02", code: "測試A02", pid: "t-p2", qty: 180, due: D(7), pri: 1 },
      { id: "t-o03", code: "測試A03", pid: "t-p3", qty: 240, due: D(8), pri: 1 },
      { id: "t-o04", code: "測試A04", pid: "t-p4", qty: 100, due: D(5), pri: 1 },
      { id: "t-o05", code: "測試A05", pid: "t-p1", qty: 200, due: D(9), pri: 2 },
      { id: "t-o06", code: "測試A06", pid: "t-p2", qty: 300, due: D(8), pri: 2 },
      { id: "t-o07", code: "測試A07", pid: "t-p3", qty: 150, due: D(7), pri: 2 },
      { id: "t-o08", code: "測試A08", pid: "t-p4", qty: 250, due: D(6), pri: 2 },
      // 急單（priority 0 = 特急）
      { id: "t-o09", code: "測試R09", pid: "t-p1", qty: 80, due: D(2), pri: 0 },
      { id: "t-o10", code: "測試R10", pid: "t-p2", qty: 60, due: D(2), pri: 0 },
      // 可能逾期（量大+期限緊）
      { id: "t-o11", code: "測試L11", pid: "t-p3", qty: 500, due: D(3), pri: 1 },
      { id: "t-o12", code: "測試L12", pid: "t-p1", qty: 600, due: D(4), pri: 1 },
      // 跨廠加工單（大量走跨廠路徑）
      { id: "t-o13", code: "測試X13", pid: "t-p1", qty: 400, due: D(8), pri: 1 },
      { id: "t-o14", code: "測試X14", pid: "t-p3", qty: 350, due: D(7), pri: 2 },
      // 小量單（驗證整工序本來就短→合法短工段）
      { id: "t-o15", code: "測試S15", pid: "t-p4", qty: 20, due: D(5), pri: 2 },
      { id: "t-o16", code: "測試S16", pid: "t-p2", qty: 30, due: D(4), pri: 1 },
      // 逾期（已過期限）
      { id: "t-o17", code: "測試O17", pid: "t-p1", qty: 100, due: addDays(todayStr, -2), pri: 1 },
      { id: "t-o18", code: "測試O18", pid: "t-p3", qty: 200, due: addDays(todayStr, -1), pri: 2 },
      // 多人同機（同一工序大量→需拆分到多機多人）
      { id: "t-o19", code: "測試M19", pid: "t-p1", qty: 800, due: D(9), pri: 1 },
      { id: "t-o20", code: "測試M20", pid: "t-p2", qty: 700, due: D(9), pri: 2 },
    ],
    // 欠缺品項：1 廠缺料、二廠補
    rushOrders: [
      { id: "t-r01", f1: { shipDate: D(1), vendor: "測試供應商甲", shortQty: 50, note: "測試-缺料" }, f2: { startDate: D(2), dueDate: D(4), itemProcess: "測試-沖壓", desc: "測試-補件", qty: 50, note: "" }, archived: false },
      { id: "t-r02", f1: { shipDate: D(2), vendor: "測試供應商乙", shortQty: 30, note: "" }, f2: { startDate: D(3), dueDate: D(5), itemProcess: "測試-焊接", desc: "測試-補件", qty: 30, note: "" }, archived: false },
    ],
    // 跨廠加工單：由 UI「給二廠／回一廠」建立（複雜驗證格式，種子不直接寫入）
    transferOrders: [],
    workLog: [],
    workContents: [],
    workAssignments: [],
    execution: [],
    machineLayout: [],
  };
}
