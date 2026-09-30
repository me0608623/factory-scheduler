export const PERMISSIONS = [
  ['schedule.manage','調整與自動排程','拖曳、手動排班、套用 OR-Tools 方案'],
  ['incidents.manage','故障與請假','回報故障、修復、請假與急用狀況'],
  ['orders.manage','工單管理','新增、修改與取消工單'],
  ['calendar.manage','工時與加班','上班日、加班日與臨時加班人員'],
  ['master.manage','員工、設備與產品','修改基本資料、技能與產品工序'],
  ['groups.manage','分組與部門','建立、調整與停用員工分組'],
  ['work_contents.manage','工作內容定義','設定純人工或需設備的工作資格'],
  ['transfers.manage','跨廠加工','加工單、批次、流轉與點收'],
  ['rush.manage','特別趕貨','一廠欠貨品項與二廠加工趕貨紀錄'],
  ['rosters.manage','輪班草稿','固定班與變形工時草稿'],
  ['scenarios.manage','試排情境','儲存與查看個人試排情境'],
  ['execution.manage','全部現場回報','可替任何員工開始、報量與完成'],
  ['archives.manage','Excel 與歷史排程','匯入、封存與查看歷史排程'],
  ['notes.manage','現場備忘','新增、修改與釘選人員或機台備忘'],
];

const LEAD_DEFAULT = new Set([
  'schedule.manage','incidents.manage','orders.manage','calendar.manage',
  'transfers.manage','rush.manage','rosters.manage','scenarios.manage','execution.manage','archives.manage',
  'notes.manage',
]);

export function roleDefaultPermission(role,key){
  return role==='boss'||role==='lead'&&LEAD_DEFAULT.has(key);
}

export function effectivePermission(role,overrides,key){
  if(role==='boss')return true;
  if(overrides&&Object.prototype.hasOwnProperty.call(overrides,key))return !!overrides[key];
  return roleDefaultPermission(role,key);
}
