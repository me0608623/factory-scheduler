// Membership is organizational, never an implicit machine skill or attendance record.
export const memberStatus = status => ({source:'原檔分組',pending:'分組待確認',confirmed:'已確認'}[status] || '分組待確認');
export function employeeGroups(S,employeeId){
  return (S.groupMembers||[]).filter(m=>m.employeeId===employeeId)
    .map(m=>({group:(S.groups||[]).find(g=>g.id===m.groupId),membership:m})).filter(x=>x.group);
}
export function groupedEmployees(S,employees,selected='all'){
  if(selected==='all')return employees;
  const known=new Set((S.groups||[]).map(g=>g.id));
  const members=(S.groupMembers||[]).filter(m=>known.has(m.groupId));
  return employees.filter(e=>selected==='ungrouped'? !members.some(m=>m.employeeId===e.id):members.some(m=>m.employeeId===e.id&&m.groupId===selected));
}
export function groupCatalog(S){
  return { groups:(S.groups||[]).map(g=>({id:g.id,name:g.name,department:g.department||null,home_factory:g.homeFactory??null,source_ref:g.sourceRef||null})),
    members:(S.groupMembers||[]).map(m=>({group_id:m.groupId,employee_id:m.employeeId,review_status:m.reviewStatus||'confirmed',source_ref:m.sourceRef||null})) };
}
