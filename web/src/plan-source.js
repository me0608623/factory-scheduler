import { fromSnapshot } from './convert.js';
import { scenarioKey } from './scenarios.js';
import { assertCloudSnapshot } from './store/snapshot-contract.js';

const unavailable='排程服務未提供有效的計算基準，無法安全預覽。請先更新排程服務與網頁至相容版本，再重新計算；目前班表未變更。';
const changed='排程資料已更新，這份方案不可套用。請關閉目前視窗或取消預覽，更新班表後重新計算。';
const error=(message,stale=false)=>Object.assign(new Error(message),{planSource:true,stale});

// A schedule version does not cover every catalog/metadata edit. Compare the
// exact source returned by /plans/db using the same conversion as Store.load.
export function assertPlanSource(plan,base,current=base){
  const raw=plan?.source_snapshot;
  try{
    assertCloudSnapshot(raw);
    if(raw.calendar.windows!==undefined&&(!Array.isArray(raw.calendar.windows)||raw.calendar.windows.some(w=>
      !w||!Number.isInteger(w.start)||!Number.isInteger(w.end)||w.start<0||w.end>1440||w.start>=w.end||typeof w.overtime!=='boolean')))throw new Error();
    if(raw.ot_ends!==undefined&&(!raw.ot_ends||Array.isArray(raw.ot_ends)||typeof raw.ot_ends!=='object'||
      Object.values(raw.ot_ends).some(v=>!Number.isInteger(v)||v<=0||v>1440)))throw new Error();
  }catch{throw error(unavailable);}
  let sourceKey,baseKey,currentKey;
  try{sourceKey=scenarioKey(fromSnapshot(raw));baseKey=scenarioKey(base);currentKey=scenarioKey(current);}
  catch{throw error(unavailable);}
  if(sourceKey!==baseKey||baseKey!==currentKey)throw error(changed,true);
}
