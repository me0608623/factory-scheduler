// Staff presence planning is independent of production jobs. These are drafts,
// not attendance, payroll, a legal approval, or an instruction to start a machine.
export const REGIMES={fixed:{name:'固定班',days:7,daily:480,weekly:2400,total:2400,rest:2},two:{name:'二週變形',days:14,daily:600,weekly:2880,total:4800,rest:4},four:{name:'四週變形',days:28,daily:600,weekly:null,total:9600,rest:8},eight:{name:'八週變形',days:56,daily:480,weekly:2880,total:19200,rest:16}};
export const DAY_TYPES={work:'工作日',regular:'例假',rest:'休息日',holiday:'國定假日／停工',leave:'請假'};
export const addDate=(d,n)=>new Date(Date.parse(d+'T00:00:00Z')+n*864e5).toISOString().slice(0,10);
const validDate=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d))&&new Date(d+'T00:00:00Z').toISOString().slice(0,10)===d;
const text=(v,max=80)=>typeof v==='string'&&v.trim().length>0&&v.length<=max;
const integer=(v,a,b)=>Number.isInteger(v)&&v>=a&&v<=b;
export const datesOf=p=>Array.from({length:REGIMES[p.regime].days},(_,i)=>addDate(p.start,i));
export const shiftMinutes=s=>s.segments.reduce((n,[a,b])=>n+b-a,0);
export const cellOf=(p,emp,date)=>p.cells.find(c=>c.emp===emp&&c.date===date);
export const rosterKey=S=>JSON.stringify(S.staffRosters||[]);
export function newRoster(S,{id,start,factory=1}){
  const ids=S.employees.filter(e=>(e.factory||1)===factory).map(e=>e.id);
  const p={id,name:start+' '+factory+' 廠班表',factory,start,anchor:start,regime:'fixed',eligibilityRef:'',consentRef:'',rotationConsentRef:'',status:'draft',shifts:[{id:'day',name:'日班',segments:[[480,720],[780,1020]]}],positions:[],demands:[],employees:ids.map(emp=>({emp,shiftIds:['day'],weekdays:[1,2,3,4,5]})),cells:[]};
  resetCells(p,S);return p;
}
export function resetCells(p,S){
  p.cells=p.employees.flatMap(e=>datesOf(p).map(date=>({emp:e.emp,date,type:S.employees.find(x=>x.id===e.emp)?.leaves?.includes(date)?'leave':new Date(date+'T00:00:00Z').getUTCDay()===0?'regular':new Date(date+'T00:00:00Z').getUTCDay()===6?'rest':'work',shiftId:null,positionId:null,pin:false})));
}
export function fillRoster(p,S,{emp,from,to,type,shiftId,positionId}){
  if(!validDate(from)||!validDate(to)||from>to||!datesOf(p).includes(from)||!datesOf(p).includes(to)||!DAY_TYPES[type])throw new Error('填充範圍須在本週期內');
  const copy=structuredClone(p);let changed=0,skipped=0;
  for(const c of copy.cells){if(emp!=='all'&&c.emp!==emp||c.date<from||c.date>to)continue;
    if(c.pin||type==='work'&&(c.type!=='work'||S.employees.find(e=>e.id===c.emp)?.leaves?.includes(c.date))){skipped++;continue;}
    c.type=type;c.shiftId=type==='work'?shiftId||null:null;c.positionId=type==='work'?positionId||null:null;changed++;
  }
  if(!changed)throw new Error('沒有可填充班格；固定格、請假與既有休假會保留');
  return {candidate:copy,changed,skipped};
}
export function copyNextRoster(p,S,id){
  const copy=structuredClone(p),days=REGIMES[p.regime].days;copy.id=id;copy.start=addDate(p.start,days);copy.name=copy.start+' '+p.factory+' 廠班表';
  copy.cells=copy.cells.map(c=>{const date=addDate(c.date,days),leave=S.employees.find(e=>e.id===c.emp)?.leaves?.includes(date);return {...c,date,pin:false,...(leave?{type:'leave',shiftId:null,positionId:null}:{})};});
  copy.demands=copy.demands.map(d=>({...d,date:addDate(d.date,days)}));return copy;
}
export function validateRosters(S){
  const periods=S.staffRosters||[];if(!Array.isArray(periods)||periods.length>24)throw new Error('最多保存 24 份輪班草稿');
  const ids=new Set();
  for(const p of periods){
    if(!p||!text(p.id)||ids.has(p.id)||!text(p.name)||![1,2].includes(p.factory)||!validDate(p.start)||!validDate(p.anchor)||!REGIMES[p.regime]||p.status!=='draft'||!['eligibilityRef','consentRef','rotationConsentRef'].every(k=>typeof p[k]==='string'&&p[k].length<=500))throw new Error('輪班草稿格式不正確');ids.add(p.id);
    const cycle=REGIMES[p.regime].days;if((Date.parse(p.start)-Date.parse(p.anchor))/864e5%cycle!==0)throw new Error('班表起日須對齊連續週期基準日，不可任意重設週期');
    if(!['shifts','positions','demands','employees','cells'].every(k=>Array.isArray(p[k]))||p.shifts.length<1||p.shifts.length>8||p.positions.length>40||p.employees.length>100||p.demands.length>4480||p.cells.length>5600)throw new Error('班表規模超過上限');
    for(const k of ['shifts','positions'])if(p[k].some(v=>!text(v.id)||!text(v.name))||new Set(p[k].map(v=>v.id)).size!==p[k].length)throw new Error('班別／崗位名稱或代號無效');
    for(const s of p.shifts){if(!Array.isArray(s.segments)||s.segments.length<1||s.segments.length>8)throw new Error('班別須包含工作時段');let end=-1;for(const w of s.segments){if(!Array.isArray(w)||w.length!==2||!integer(w[0],0,2879)||!integer(w[1],1,2880)||w[0]>=w[1]||w[0]<end)throw new Error('班別時段不得重疊，最晚至次日 24:00');end=w[1];}if(s.segments[0][0]>=1440||end-s.segments[0][0]>1440)throw new Error('班別須從當日開始且跨度不得超過 24 小時');}
    const es=new Set();for(const e of p.employees){if(!S.employees.some(x=>x.id===e.emp)||es.has(e.emp)||!Array.isArray(e.shiftIds)||e.shiftIds.some(id=>!p.shifts.some(s=>s.id===id))||new Set(e.shiftIds).size!==e.shiftIds.length||!Array.isArray(e.weekdays)||e.weekdays.some(n=>!integer(n,0,6))||new Set(e.weekdays).size!==e.weekdays.length)throw new Error('員工可用時段設定無效');es.add(e.emp);}
    for(const pos of p.positions)if(!Array.isArray(pos.employeeIds)||pos.employeeIds.some(id=>!es.has(id))||new Set(pos.employeeIds).size!==pos.employeeIds.length||!(pos.rate===null||Number.isFinite(pos.rate)&&pos.rate>0&&pos.rate<=1000000))throw new Error('崗位資格／每人每小時產能無效');
    const ds=datesOf(p),keys=new Set();for(const c of p.cells){const key=c.emp+'|'+c.date;if(!es.has(c.emp)||!ds.includes(c.date)||keys.has(key)||!DAY_TYPES[c.type]||typeof c.pin!=='boolean'||!(c.shiftId===null||p.shifts.some(s=>s.id===c.shiftId))||!(c.positionId===null||p.positions.some(s=>s.id===c.positionId))||c.type!=='work'&&(c.shiftId!==null||c.positionId!==null))throw new Error('每日班格格式無效');keys.add(key);}
    if(keys.size!==es.size*ds.length)throw new Error('班表須涵蓋完整週期，不可省略例假／未排日期');
    const needs=new Set();for(const d of p.demands){const key=d.date+'|'+d.shiftId+'|'+d.positionId;if(!ds.includes(d.date)||!p.shifts.some(s=>s.id===d.shiftId)||!p.positions.some(s=>s.id===d.positionId)||!integer(d.people,0,100)||!integer(d.target,0,1000000000)||needs.has(key))throw new Error('需求日期、班別、崗位或數量無效');needs.add(key);}
    for(const other of periods)if(other!==p&&p.employees.some(e=>other.employees?.some(x=>x.emp===e.emp))&&p.start<=addDate(other.start,REGIMES[other.regime]?.days-1||0)&&other.start<=addDate(p.start,cycle-1))throw new Error('同員工不可同時存在重疊週期班表（含跨廠），請編輯原草稿');
  }
}
export function auditRoster(p,S){
  const errors=[],warnings=['這是預排檢核，不是完整合法認證。尚未納入完整歷史出勤、加班月累計、國定假日調移、工資、特殊身分與法定例外；不啟用 8 小時換班或例假出勤例外。'],rule=REGIMES[p.regime],ds=datesOf(p),totals=[];
  const err=(c,message)=>errors.push({emp:c?.emp||null,date:c?.date||null,message});
  if(p.regime!=='fixed'&&(!p.eligibilityRef.trim()||!p.consentRef.trim()))err(null,'變形工時缺少指定行業適用依據及工會／勞資會議同意紀錄；不可自動試排');
  for(const profile of p.employees){const e=S.employees.find(e=>e.id===profile.emp),cs=ds.map(d=>cellOf(p,e.id,d)),runs=[],minutes=[];let consecutive=0,extra=0;
    for(const c of cs){const s=p.shifts.find(s=>s.id===c.shiftId),pos=p.positions.find(x=>x.id===c.positionId);let n=0;
      if(c.type==='work'&&s){n=shiftMinutes(s);const t=Date.parse(c.date+'T00:00:00Z')/60000;runs.push({c,s,start:t+s.segments[0][0],end:t+s.segments.at(-1)[1]});
        if(e.reviewStatus&&e.reviewStatus!=='confirmed')err(c,'員工身分尚待核定');
        if(n>rule.daily)err(c,'正常工時超過 '+rule.daily/60+' 小時上限（目前不自動安排加班）');
        if(!profile.shiftIds.includes(s.id)||!profile.weekdays.includes(new Date(c.date+'T00:00:00Z').getUTCDay())||e.leaves?.includes(c.date))err(c,'班別不在員工可用時段或已請假');
        if(!pos||!pos.employeeIds.includes(e.id))err(c,'崗位未指定或員工資格未確認');
        let continuous=0;for(let i=0;i<s.segments.length;i++){const [a,b]=s.segments[i];if(i===0||a-s.segments[i-1][1]>=30)continuous=0;continuous+=b-a;if(continuous>240)err(c,'連續工作超過 4 小時；請設定至少 30 分鐘休息（未啟用調配例外）');}
        for(const [a,b] of s.segments){for(let k=0;k<=1;k++){const date=addDate(c.date,k),part=Math.max(0,Math.min(b,(k+1)*1440)-Math.max(a,k*1440));if(part&&e.leaves?.includes(date))err(c,'跨夜工作落在請假日期 '+date);}}
      }
      minutes.push(n);extra+=Math.max(0,n-480);consecutive=c.type==='work'?consecutive+1:0;
      if(c.type==='work'&&!s)warnings.push(e.name+' '+c.date+' 尚未排班');
      if(p.regime!=='four'&&consecutive>6)err(c,'連續工作超過 6 日（未啟用七日週期例外）');
    }
    for(let i=0;i<runs.length;i++){const a=runs[i],b=runs[i-1];if(b&&a.start-b.end<660)err(a.c,'班間休息不足 11 小時（系統採所有班間均適用的保守政策）');
      if(b&&a.s.id!==b.s.id&&!p.rotationConsentRef.trim()&&Math.floor(ds.indexOf(a.c.date)/7)===Math.floor(ds.indexOf(b.c.date)/7))err(a.c,'同週更換班次缺少勞工同意紀錄');
      for(const c of cs.filter(c=>['regular','rest','holiday','leave'].includes(c.type))){const start=Date.parse(c.date+'T00:00:00Z')/60000;if(a.start<start+1440&&a.end>start)err(a.c,'跨夜班侵入 '+c.date+' '+DAY_TYPES[c.type]+' 的完整休息日');}
    }
    const total=minutes.reduce((a,b)=>a+b,0);totals.push({emp:e.id,minutes:total,days:runs.length});if(total>rule.total)err({emp:e.id},'週期正常工時超過 '+rule.total/60+' 小時');if(p.regime==='two'&&extra>960)err({emp:e.id},'二週調配增加工時超過二日的 16 小時');
    if(cs.filter(c=>['regular','rest'].includes(c.type)).length<rule.rest)err({emp:e.id},'週期例假＋休息日少於 '+rule.rest+' 日（請假不抵充）');
    for(let i=0;i<cs.length;i+=p.regime==='four'?14:7){const part=cs.slice(i,i+(p.regime==='four'?14:7)),regs=part.filter(c=>c.type==='regular').length;if(regs<(p.regime==='four'?2:1))err({emp:e.id,date:part[0].date},'此'+(p.regime==='four'?'二週':'七日')+'週期例假不足');if(p.regime==='fixed'&&!part.some(c=>c.type==='rest'))err({emp:e.id,date:part[0].date},'七日週期缺休息日');}
    if(rule.weekly)for(let i=0;i<minutes.length;i+=7)if(minutes.slice(i,i+7).reduce((a,b)=>a+b,0)>rule.weekly)err({emp:e.id,date:ds[i]},'每週工時超過 '+rule.weekly/60+' 小時');
  }
  // Adjacent stored cycles are checked too. Missing cycles remain explicitly unknown.
  for(const profile of p.employees){const adjacent=(S.staffRosters||[]).find(q=>q.id!==p.id&&addDate(q.start,REGIMES[q.regime].days)===p.start&&q.employees.some(e=>e.emp===profile.emp));const first=p.cells.filter(c=>c.emp===profile.emp&&c.shiftId).sort((a,b)=>a.date.localeCompare(b.date))[0];
    if(!adjacent){warnings.push((S.employees.find(e=>e.id===profile.emp)?.name||profile.emp)+'：前一週期未知，無法確認跨界連續出勤／換班');continue;}
    const previous=adjacent.cells.filter(c=>c.emp===profile.emp).sort((a,b)=>a.date.localeCompare(b.date));const tail=previous.filter(c=>c.shiftId).at(-1);
    if(first&&tail){const a=p.shifts.find(s=>s.id===first.shiftId),b=adjacent.shifts.find(s=>s.id===tail.shiftId);if((Date.parse(first.date)-Date.parse(tail.date))/60000+a.segments[0][0]-b.segments.at(-1)[1]<660)err(first,'跨週期班間休息不足 11 小時');}
    if(p.regime!=='four'){let run=0;for(const c of [...previous.slice(-6),...p.cells.filter(c=>c.emp===profile.emp).sort((a,b)=>a.date.localeCompare(b.date)).slice(0,6)]){run=c.type==='work'?run+1:0;if(run>6)err(c,'跨週期連續出勤超過 6 日');}}
  }
  const shortages=p.demands.map(d=>{const pos=p.positions.find(x=>x.id===d.positionId),shift=p.shifts.find(x=>x.id===d.shiftId),count=p.cells.filter(c=>c.date===d.date&&c.shiftId===d.shiftId&&c.positionId===d.positionId).length,capacity=pos.rate===null?null:count*shiftMinutes(shift)/60*pos.rate;return {...d,count,capacity,missingPeople:Math.max(0,d.people-count),missingQty:capacity===null?null:Math.max(0,d.target-capacity)};});
  for(const d of shortages)if(d.target>0&&d.capacity===null)warnings.push(d.date+' '+p.positions.find(x=>x.id===d.positionId).name+'：產能待確認，無法核對產量目標');
  // Existing work remains untouched, but contradictions are visible.
  for(const b of [...(S.blocks||[]),...(S.workAssignments||[])]){if(!ds.includes(b.date)||!p.employees.some(e=>e.emp===b.emp))continue;const c=cellOf(p,b.emp,b.date),s=p.shifts.find(s=>s.id===c?.shiftId);if(!s||!s.segments.some(([a,e])=>b.s>=a&&b.e<=e))warnings.push(b.date+' '+(S.employees.find(e=>e.id===b.emp)?.name||'?')+'：既有產線工作不在此輪班時段；輪班草稿尚未改動產線排程');}
  return {errors,warnings:[...new Set(warnings)],totals,shortages};
}
