// Deliberately project only structural facts. Restored snapshots contain real personnel data.
export function safeSnapshotDebug(snapshot,pickedIds=[]){
  const length=value=>Array.isArray(value)?value.length:0;
  const calendar=snapshot.calendar||{},employees=snapshot.employees||[];
  return {
    counts:Object.fromEntries(['blocks','employees','machines','orders','work_execution',
      'work_assignments','transfer_orders','staff_rosters','work_contents'].map(key=>[key,length(snapshot[key])])),
    calendar:{week:calendar.week,windows:(calendar.windows||[]).map(w=>({start:w.start,end:w.end,overtime:!!w.overtime})),
      holidayCount:Object.keys(calendar.holidays||{}).length,overrideCount:Object.keys(calendar.overrides||{}).length},
    employees:pickedIds.map((id,index)=>{
      const e=employees.find(x=>x.id===id)||{};
      return {code:`TEST-E${String(index+1).padStart(2,'0')}`,factory:e.factory,
        skillCount:length(e.skills),leaveCount:length(e.leaves),noOvertime:e.no_overtime,
        holidayLeaveCount:(e.leaves||[]).filter(day=>Object.hasOwn(calendar.holidays||{},day)).length};
    }),
    overlappingHolidayLeaveEmployees:employees.filter(e=>(e.leaves||[]).some(day=>
      Object.hasOwn(calendar.holidays||{},day)&&
      (e.overtime_overrides?.[day]===false||(!Object.hasOwn(e.overtime_overrides||{},day)&&
        (Array.isArray(e.overtime_weekdays)?!e.overtime_weekdays.includes(new Date(day+'T00:00:00Z').getUTCDay()):e.no_overtime))))).length,
  };
}
