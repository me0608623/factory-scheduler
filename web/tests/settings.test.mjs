import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_PREFERENCES,loadPreferences,normalizePreferences,notificationEnabled,patchPreference,savePreferences,SETTINGS_KEY} from '../src/settings.js';
import {LocalStore} from '../src/store/local.js';

const memory=seed=>{const m=new Map(Object.entries(seed||{}));return {getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v),value:k=>m.get(k)};};

test('設定會拒絕未知值，通知缺值採安全預設',()=>{
  const p=normalizePreferences({theme:'pink',scale:99,language:'xx',notifications:{schedule:false,sound:true}});
  assert.equal(p.theme,DEFAULT_PREFERENCES.theme);assert.equal(p.scale,1);assert.equal(p.language,'zh-TW');
  assert.equal(p.notifications.schedule,false);assert.equal(p.notifications.leave,true);assert.equal(p.notifications.sound,true);
});

test('舊版明暗與縮放會帶入整合設定',()=>{
  const s=memory({'fsched-theme':'dark','fsched-zoom':'1.25'}),p=loadPreferences(s);
  assert.equal(p.theme,'dark');assert.equal(p.scale,1.3);
  const saved=savePreferences(p,s);assert.deepEqual(JSON.parse(s.value(SETTINGS_KEY)),saved);
});

test('單項更新不覆蓋其他裝置偏好',()=>{
  const base=normalizePreferences({accent:'green',notifications:{memo:false}}),next=patchPreference(base,'notifications.sound',true);
  assert.equal(next.accent,'green');assert.equal(next.notifications.memo,false);assert.equal(next.notifications.sound,true);
  assert.equal(base.notifications.sound,false);
});

test('請假、備忘與其他排程通知可分別關閉',()=>{
  const p=normalizePreferences({notifications:{schedule:false,leave:true,memo:false}});
  assert.equal(notificationEnabled(p,'schedule_state'),false);assert.equal(notificationEnabled(p,'leave_requests'),true);assert.equal(notificationEnabled(p,'schedule_memos'),false);
});

test('本機個人名稱會保存並在重新開啟後載入',async()=>{
  const previous=globalThis.localStorage,s=memory();globalThis.localStorage=s;
  try{
    const first=new LocalStore();await first.init();await first.updateProfile({displayName:' 現場測試員 '});
    const reopened=new LocalStore();await reopened.init();assert.equal(reopened.userName,'現場測試員');
    await assert.rejects(reopened.updateProfile({displayName:'  '}),/1–60/);
  }finally{globalThis.localStorage=previous;}
});
