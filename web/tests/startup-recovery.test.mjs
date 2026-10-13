import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createClient as realCreateClient} from '@supabase/supabase-js';
import {modeUrl} from '../src/runtime-config.js';
import {loadPreferences,applyPreferences,SETTINGS_KEY} from '../src/settings.js';
import {I18N,tx,UI_TEXT} from '../src/i18n.js';

// Execute the actual entry point with explicit DOM/client boundaries mocked.
const entry=readFileSync(new URL('../src/main.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'');
async function startup({mode='test',configError,bootError=new Error('SYNTHETIC_READ_FAILURE'),constructorError,clientFactory,localError,href='https://factory.example/?mode=test&view=catalog#access_token=PRIVATE',success=false,preferenceValue,blockedStorage=false,blockedGetter=false}={}){
  let clients=0,boots=0,reloads=0,focused=null,preferenceReads=0,preferenceLoads=0;
  const root={attrs:{},props:{},lang:'zh-Hant',setAttribute(k,v){this.attrs[k]=v;},removeAttribute(k){delete this.attrs[k];},style:{setProperty(k,v){root.props[k]=v;}}};
  const storage={getItem(k){preferenceReads++;if(blockedStorage)throw new Error('STORAGE_BLOCKED');return k===SETTINGS_KEY?preferenceValue??null:null;},setItem(){assert.fail('startup recovery must never write preferences');}};
  const elements=new Map([['app',{_html:'',set innerHTML(value){this._html=value;for(const [,id] of value.matchAll(/id="([^"]+)"/g))elements.set(id,{id,textContent:'',disabled:false,focus(){focused=id;}});},get innerHTML(){return this._html;}}]]);
  const loc=new URL(href);loc.reload=()=>{reloads++;};
  const context={URLSearchParams,location:loc,document:{getElementById:id=>elements.get(id),documentElement:root},modeUrl,
    loadPreferences:()=>{preferenceLoads++;if(blockedGetter)throw new Error('STORAGE_GETTER_BLOCKED');return loadPreferences(storage);},applyPreferences:p=>applyPreferences(p,root),I18N,
    RUNTIME:{mode,error:configError,url:'https://test.example',anon:'PUBLIC',authOptions:{}},tx,console:{error:()=>{}},
    createClient:()=>{clients++;if(constructorError)throw constructorError;return clientFactory?clientFactory():{};},
    SupabaseStore:class {constructor(){this.kind='supabase';}},LocalStore:class{constructor(){if(localError)throw localError;this.kind='local';}},
    boot:async()=>{boots++;if(!success)throw bootError;}};
  const previousLanguage=I18N.lang;I18N.lang='zh-TW';
  try{
    vm.createContext(context);vm.runInContext(entry,context);await new Promise(resolve=>setImmediate(resolve));
    return {elements,context,root,preferenceLoads:()=>preferenceLoads,preferenceReads:()=>preferenceReads,clients:()=>clients,boots:()=>boots,reloads:()=>reloads,focused:()=>focused};
  }finally{I18N.lang=previousLanguage;}
}

test('test startup failure offers same-environment retry, not just exit to production',async()=>{
  const h=await startup({configError:new Error('TEST_CONFIG_INCOMPLETE')});
  assert.equal(h.clients(),0);assert.equal(h.boots(),0);
  const retry=h.elements.get('startup-retry');assert.ok(retry,'missing retry control');assert.equal(typeof retry.onclick,'function');
  assert.equal(h.focused(),'startup-retry');
  retry.onclick();retry.onclick();assert.equal(h.reloads(),1,'double activation must request one reload');
  assert.equal(h.context.location.search,'?mode=test&view=catalog','retry must not change environment/query');
  assert.equal(h.elements.get('startup-production').href,'/?view=catalog','explicit exit must remove mode and auth hash');
  assert.match(h.elements.get('app').innerHTML,/測試模式 · 不影響正式資料/);
});

test('real asynchronous cloud startup rejection reaches recovery without a demo fallback',async()=>{
  const h=await startup();assert.equal(h.clients(),1);assert.equal(h.boots(),1);
  assert.equal(h.elements.get('startup-error').textContent,'SYNTHETIC_READ_FAILURE');assert.ok(h.elements.get('startup-retry'));
});

test('synchronous client initialization errors also reach recovery',async()=>{
  const h=await startup({constructorError:new Error('SYNTHETIC_CLIENT_FAILURE')});
  assert.equal(h.boots(),0);assert.equal(h.elements.get('startup-error').textContent,'SYNTHETIC_CLIENT_FAILURE');
  // Real SDK URL validation throws before making any network request.
  const sdk=await startup({clientFactory:()=>realCreateClient('invalid-url','PUBLIC')});
  assert.equal(sdk.boots(),0);assert.match(sdk.elements.get('startup-error').textContent,/Invalid supabaseUrl/);assert.ok(sdk.elements.get('startup-retry'));
});

test('local initialization errors have retry, not a misleading production exit',async()=>{
  const h=await startup({mode:'local',localError:new Error('SYNTHETIC_LOCAL_FAILURE'),href:'http://localhost/?local=1'});
  assert.equal(h.clients(),0);assert.equal(h.boots(),0);assert.ok(h.elements.get('startup-retry'));assert.equal(h.elements.get('startup-production'),undefined);
});

test('production boot failure retains its URL and never labels reload as exit to production',async()=>{
  const h=await startup({mode:'production',href:'https://factory.example/?view=shortage'});
  assert.equal(h.elements.get('startup-production'),undefined);h.elements.get('startup-retry').onclick();assert.equal(h.reloads(),1);
  assert.equal(h.context.location.search,'?view=shortage');
});

test('null and markup failures are rendered as text, not a second uncaught error or HTML',async()=>{
  const empty=await startup({bootError:null});assert.equal(empty.elements.get('startup-error').textContent,'啟動失敗');
  const h=await startup({bootError:new Error('<img src=x onerror=PRIVATE>')});
  assert.equal(h.elements.get('startup-error').textContent,'<img src=x onerror=PRIVATE>');assert.doesNotMatch(h.elements.get('app').innerHTML,/<img/);
});

test('successful boot does not create failure controls or trigger a reload',async()=>{
  const h=await startup({success:true});assert.equal(h.boots(),1);assert.equal(h.elements.get('app').innerHTML,'');assert.equal(h.reloads(),0);
});

test('startup failure preserves the real device language, large text and appearance without writes',async()=>{
  for(const language of ['en','vi','th']){
    const h=await startup({preferenceValue:JSON.stringify({language,theme:'light',font:'clear',scale:1.15,accent:'green'}),configError:new Error('測試環境尚未設定完成，已停止連線；不會使用正式資料。')});
    assert.equal(h.root.lang,language);assert.equal(h.root.attrs['data-app-theme'],'light');assert.equal(h.root.attrs['data-font'],'clear');
    assert.equal(h.root.props['--z'],1.15);assert.equal(h.root.attrs['data-accent'],'green');
    assert.ok(h.elements.get('app').innerHTML.includes(UI_TEXT['重新整理後再試'][language]));
    assert.equal(h.elements.get('startup-error').textContent,UI_TEXT['測試環境尚未設定完成，已停止連線；不會使用正式資料。']?.[language]);
    assert.equal(h.clients(),0);assert.equal(h.boots(),0);
  }
});

test('unreadable device storage cannot prevent startup recovery controls',async()=>{
  for(const options of [{blockedGetter:true},{blockedStorage:true},{preferenceValue:'{invalid'}]){
    const h=await startup(options);assert.ok(h.elements.get('startup-retry'));assert.equal(h.elements.get('startup-error').textContent,'SYNTHETIC_READ_FAILURE');
    assert.equal(h.focused(),'startup-retry');assert.equal(h.preferenceLoads(),1);
  }
});

test('normal boot retains ownership of preferences; failure renderer never applies them on success',async()=>{
  const h=await startup({success:true,preferenceValue:JSON.stringify({language:'en',theme:'light',scale:1.3})});
  assert.equal(h.preferenceReads(),0);assert.equal(h.root.lang,'zh-Hant');assert.deepEqual(h.root.attrs,{});
});
