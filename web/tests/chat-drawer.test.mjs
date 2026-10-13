import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../src/chat-ui.js',import.meta.url),'utf8');
function fixture(visible,drawer){
  const calls=[],launch={getClientRects:()=>visible?[{}]:[],focus:()=>calls.push('launcher')};
  const ctx={document:{querySelector:selector=>{assert.equal(selector,'.ops-drawer');return drawer?{focus:()=>calls.push('drawer')}:null;}}};
  vm.createContext(ctx);const at=source.indexOf('function focusAfterChatClose(');
  vm.runInContext(source.slice(at,source.indexOf('export function installScheduleChat',at)),ctx);
  return {calls,run:()=>ctx.focusAfterChatClose(launch)};
}
test('closing chat restores focus to a visible launcher, including desktop with drawer',()=>{
  for(const drawer of [true,false]){const f=fixture(true,drawer);f.run();assert.deepEqual(f.calls,['launcher']);}
});
test('closing chat whose mobile launcher is hidden returns focus to the sheet, never hidden launcher',()=>{
  const f=fixture(false,true);f.run();assert.deepEqual(f.calls,['drawer']);
  const removed=fixture(false,false);assert.doesNotThrow(removed.run);assert.deepEqual(removed.calls,[]);
});
test('CSS contract: only closed mobile chat yields to drawers; compact drawer controls retain 44px floors',()=>{
  // Structural guard only. Real CSS hit testing is verified in the browser,
  // including calendar 24/25 and restoring/opening the chat after sheet close.
  const css=readFileSync(new URL('../src/styles.css',import.meta.url),'utf8');
  const start=css.lastIndexOf('@media',css.indexOf('body:has(.ops-drawer) #schedule-chat:has('));
  const section=css.slice(start,css.indexOf('@media (max-width:360px)',start));
  assert.match(section,/@media[^{}]*max-width:680px/);
  assert.match(section,/body:has\(\.ops-drawer\) #schedule-chat:has\(\.chat-launch\[aria-expanded="false"\]\)\{display:none\}/);
  assert.match(section,/\.ops-drawer-h \[data-act="drawer-zoom"\],\.ops-drawer \[data-act="person-month"\],\.ops-drawer \.people-pills button\{min-width:44px;min-height:44px\}/);
});
