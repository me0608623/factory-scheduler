// Validate the schedule_snapshot RPC envelope before defaults/conversion can
// turn missing data into an authoritative empty board and reset write baselines.
// This is a transport contract, not a new scheduling/business-rule validator.
const core=['employees','machines','products','orders','blocks'];
const extensions=['work_execution','machine_layout','work_contents','work_assignments','work_reference_orders',
  'transfer_orders','rush_orders','work_log','staff_rosters','leave_requests','schedule_memos','staff_groups','staff_group_members'];
const own=(value,key)=>Object.hasOwn(value,key);
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const records=value=>Array.isArray(value)&&value.every(record);
const text=value=>typeof value==='string'&&value.trim().length>0;
const identifiers=value=>Array.isArray(value)&&value.every(text);
function invalid(){throw new Error('讀取排程失敗：伺服器沒有回傳有效排程，請重新整理後再試');}
function optionalRecords(value,key){if(own(value,key)&&!records(value[key]))invalid();}

export function assertCloudSnapshot(data){
  if(!record(data)||!Number.isSafeInteger(data.version)||data.version<0||!record(data.calendar))invalid();
  if(own(data,'setup_pending')&&typeof data.setup_pending!=='boolean')invalid();
  for(const key of core){
    if(!records(data[key]))invalid();
    const seen=new Set();
    for(const row of data[key]){
      if(!text(row.id)||seen.has(row.id))invalid();
      seen.add(row.id);
    }
  }
  // Older snapshots may omit extensions. A present-but-invalid extension must
  // never silently erase execution locks, leave requests, memos or work data.
  for(const key of extensions)optionalRecords(data,key);
  for(const employee of data.employees){
    if(!identifiers(employee.skills))invalid();
    if(own(employee,'leaves')&&!identifiers(employee.leaves))invalid();
  }
  for(const machine of data.machines){
    if(!identifiers(machine.products))invalid();
    optionalRecords(machine,'faults');
    for(const fault of machine.faults||[])optionalRecords(fault,'original_blocks');
  }
  for(const product of data.products)if(!records(product.steps))invalid();
  const calendar=data.calendar;
  // PostgreSQL jsonb_agg returns null for an uninitialized empty weekly table.
  // Preserve that existing empty-state behavior, but reject malformed weeks.
  if(calendar.week!=null&&(!Array.isArray(calendar.week)||calendar.week.length!==7||
    calendar.week.some(day=>typeof day!=='boolean')))invalid();
  for(const key of ['overrides','overtime','holidays']){
    if(!own(calendar,key))continue;
    if(!record(calendar[key]))invalid();
    if(Object.values(calendar[key]).some(value=>typeof value!==(key==='holidays'?'string':'boolean')))invalid();
  }
}
