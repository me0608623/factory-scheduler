// Navigation only. Never capture or restore schedule data, versions or grants.
export function capturePreviewContext(ui){
  return {date:ui.date,factory:ui.factory,view:ui.view,focus:ui.focus?{...ui.focus}:null};
}
export function restorePreviewContext(ui,context){
  if(!context)return false;
  ui.date=context.date;ui.factory=context.factory;ui.view=context.view;
  ui.focus=context.focus?{...context.focus}:null;
  return true;
}
