// Public diagnostic output is a fixed vocabulary of aggregate counts only.
// Queries run on a disposable public-schema copy, never the live database.
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const metrics=[
  ['employees','員工名冊','名冊總數','SELECT count(*) FROM employees'],
  ['employees_f1','員工名冊','一廠人數','SELECT count(*) FROM employees WHERE factory=1'],
  ['employees_f2','員工名冊','二廠人數','SELECT count(*) FROM employees WHERE factory=2'],
  ['employees_pending','員工名冊','啟用中待確認','SELECT count(*) FROM employees WHERE active AND review_status=\'pending\''],
  ['employees_duplicate','員工名冊','同名重複組數','SELECT count(*) FROM (SELECT name FROM employees GROUP BY name HAVING count(*)>1) d'],
  ['employees_no_skill','員工技能','啟用中沒有技能的人數','SELECT count(*) FROM employees e WHERE e.active AND NOT EXISTS (SELECT 1 FROM employee_skills s WHERE s.employee_id=e.id)'],
  ['skills','員工技能','技能列數','SELECT count(*) FROM employee_skills'],
  ['machines_no_staff','員工技能','沒有在職操作人員的資源數','SELECT count(*) FROM machines m WHERE NOT EXISTS (SELECT 1 FROM employee_skills s JOIN employees e ON e.id=s.employee_id WHERE s.machine_id=m.id AND e.active)'],
  ['skills_cross_factory','員工技能','跨廠技能列數','SELECT count(*) FROM employee_skills s JOIN employees e ON e.id=s.employee_id JOIN machines m ON m.id=s.machine_id WHERE m.factory<>e.factory'],
  ['skills_inactive_machine','員工技能','指向停用資源的技能列數','SELECT count(*) FROM employee_skills s JOIN machines m ON m.id=s.machine_id WHERE NOT m.active'],
  ['windows','班別與工時','工作時段數','SELECT count(*) FROM work_windows'],
  ['open_weekdays','班別與工時','每週開工日數','SELECT count(*) FROM calendar_weekly WHERE is_open'],
  ['calendar_days','班別與工時','未來單日調整數','SELECT count(*) FROM calendar_days WHERE date>=current_date'],
  ['holidays_unconfigured','班別與工時','未來假日未設定單日調整數','SELECT count(*) FROM holidays h WHERE h.date>=current_date AND NOT EXISTS (SELECT 1 FROM calendar_days c WHERE c.date=h.date)'],
  ['holidays_open','班別與工時','未來假日標成上班日數','SELECT count(*) FROM holidays h JOIN calendar_days c ON c.date=h.date WHERE c.is_open AND h.date>=current_date'],
  ['overtime_days','班別與工時','未來個人加班設定列數','SELECT count(*) FROM employee_overtime_days WHERE date>=current_date'],
  ['machines','設備與工位','資源總數','SELECT count(*) FROM machines'],
  ['machines_pending','設備與工位','待確認資源數','SELECT count(*) FROM machines WHERE review_status=\'pending\''],
  ['machines_no_product','設備與工位','沒有產品或模具對應的資源數','SELECT count(*) FROM machines m WHERE NOT EXISTS (SELECT 1 FROM machine_products p WHERE p.machine_id=m.id)'],
  ['faults','設備與工位','近30日尚未修復的故障數','SELECT count(*) FROM machine_faults WHERE fixed_at IS NULL AND date>=current_date-30'],
  ['products','產品與工序','啟用產品數','SELECT count(*) FROM products WHERE active'],
  ['steps','產品與工序','工序總數','SELECT count(*) FROM product_steps'],
  ['products_no_steps','產品與工序','沒有工序定義的產品數','SELECT count(*) FROM products p WHERE NOT EXISTS (SELECT 1 FROM product_steps s WHERE s.product_id=p.id)'],
  ['rates_suspicious','產品與工序','加工速率待核對站數（低於0.01或高於50）','SELECT count(*) FROM product_steps WHERE rate<0.01 OR rate>50'],
  ['batch_zero','產品與工序','整批完成才流轉的站數','SELECT count(*) FROM product_steps WHERE transfer_batch=0'],
  ['orders','工單','工單總數','SELECT count(*) FROM orders'],
  ['steps_no_machine','排程資源缺漏','對應廠沒有啟用資源的站數','SELECT count(*) FROM product_steps s JOIN products p ON p.id=s.product_id WHERE p.active AND NOT EXISTS (SELECT 1 FROM machines m WHERE m.process=s.process AND m.factory=s.factory AND m.active)'],
  ['steps_no_mold','排程資源缺漏','沒有資源產品對應的站數','SELECT count(*) FROM product_steps s JOIN products p ON p.id=s.product_id WHERE p.active AND NOT EXISTS (SELECT 1 FROM machines m JOIN machine_products mp ON mp.machine_id=m.id WHERE m.process=s.process AND m.factory=s.factory AND m.active AND mp.product_id=p.id)'],
  ['steps_no_staff','排程資源缺漏','沒有在職可操作人員的站數','SELECT count(*) FROM product_steps s JOIN products p ON p.id=s.product_id WHERE p.active AND NOT EXISTS (SELECT 1 FROM machines m JOIN machine_products mp ON mp.machine_id=m.id JOIN employee_skills es ON es.machine_id=m.id JOIN employees e ON e.id=es.employee_id WHERE m.process=s.process AND m.factory=s.factory AND m.active AND mp.product_id=p.id AND e.active)'],
];

export const inventorySQL='BEGIN READ ONLY;\nSELECT jsonb_build_object(\n'+
  metrics.map(([key,,,sql])=>`  '${key}', (${sql})`).join(',\n')+'\n);\nROLLBACK;\n';

export function renderInventory(input,{artifactId}={}){
  const invalid=()=>{throw new Error('Inventory result rejected; private diagnostics withheld');};
  if(!/^\d+$/.test(String(artifactId))||!Number.isSafeInteger(Number(artifactId))||Number(artifactId)<=0)invalid();
  if(!input||typeof input!=='object'||Array.isArray(input)||
    Object.keys(input).length!==metrics.length||
    Object.keys(input).some(key=>!metrics.some(([known])=>known===key)))invalid();
  // No database strings, unknown keys, nested data, NaN or lossy counts can escape.
  for(const [key] of metrics)if(!Number.isSafeInteger(input[key])||input[key]<0)invalid();
  const lines=['# 隔離資料盤點（公開統計）',`- 密文備份 artifact：${artifactId}`,
    '- 只檢查拋棄式 public 副本；不修改正式資料。',
    '- 本報告不是完整還原證明，也不是 OR-Tools 可行性驗收。',
    '- 僅公開數量；姓名、代號、產品、日期、排程與 SQL 錯誤不公開。'];
  let previous;
  for(const [key,section,label] of metrics){
    if(section!==previous){lines.push('',`## ${section}`);previous=section;}
    lines.push(`- ${label}：${input[key]}`);
  }
  lines.push('','缺漏須由老闆與組長在系統內核對；跨廠技能不一定是錯誤。','');
  return lines.join('\n');
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    if(process.argv[2]==='sql')process.stdout.write(inventorySQL);
    else if(process.argv[2]==='report'){
      const input=JSON.parse(await readFile(process.argv[3],'utf8'));
      process.stdout.write(renderInventory(input,{artifactId:process.env.ARTIFACT_ID}));
    }else throw new Error();
  }catch{console.error('Inventory failed; private diagnostics withheld');process.exitCode=1;}
}
