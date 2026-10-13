// Successful writes do not prove another device received the update.
export function syncStatusView(kind,writeState,realtimeStatus){
  if(writeState==='busy')return {text:'同步中',detail:'',tone:'busy'};
  if(writeState==='error')return {text:'同步失敗，按這裡重試',detail:'',tone:'error'};
  if(kind==='local')return {text:'已存在這台電腦',detail:'',tone:'ok'};
  const live=realtimeStatus==='SUBSCRIBED',connecting=!realtimeStatus||realtimeStatus==='CONNECTING';
  return {text:'雲端已儲存',detail:live?'即時已連線':connecting?'即時連線中':'即時更新中斷',tone:live?'ok':'stale'};
}
