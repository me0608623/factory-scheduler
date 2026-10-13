// View-only recovery for a horizontally scrolled machine × time board.
// Empty leading machine columns must not make existing work look like an empty day.
export function scheduleIsOffscreen(scroller){
  if(!scroller||scroller.clientWidth<=0)return false;
  const viewport=scroller.getBoundingClientRect();
  // The sticky time column covers the first 64px of the schedule.
  const left=viewport.left+Math.min(64,scroller.clientWidth);
  const blocks=Array.from(scroller.querySelectorAll('.blk'));
  return blocks.length>0&&!blocks.some(block=>{
    const rect=block.getBoundingClientRect();
    return rect.width>0&&rect.right>left&&rect.left<viewport.right;
  });
}

export function refreshScheduleLocator(board){
  const hint=board?.querySelector('.board-locate');
  if(hint)hint.hidden=!scheduleIsOffscreen(board.querySelector('.scroller'));
}

let cleanup;
export function initScheduleLocator(board){
  cleanup?.();cleanup=null;
  const scroller=board?.querySelector('.scroller');
  if(!scroller||!board.querySelector('.board-locate'))return;
  const refresh=()=>refreshScheduleLocator(board);
  scroller.addEventListener('scroll',refresh,{passive:true});
  const observer=typeof ResizeObserver==='undefined'?null:new ResizeObserver(refresh);
  observer?.observe(scroller);
  cleanup=()=>{scroller.removeEventListener('scroll',refresh);observer?.disconnect();};
  refresh();
}

export function locateSchedule(board){
  const target=board?.querySelector('.scroller .blk');
  if(!target)return false;
  target.scrollIntoView({block:'center',inline:'center',behavior:'auto'});
  // Move keyboard focus off the recovery button before it becomes hidden.
  target.focus({preventScroll:true});
  refreshScheduleLocator(board);
  return true;
}
