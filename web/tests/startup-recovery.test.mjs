import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createClient as realCreateClient} from '@supabase/supabase-js';
import {modeUrl} from '../src/runtime-config.js';

// Execute the actual entry point with explicit DOM/client boundaries mocked.
const entry=readFileSync(new URL('../src/main.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'');
async function startup({mode='test',configError,bootError=new Error('SYNTHETIC_READ_FAILURE'),constructorError,clientFactory,localError,href='https://factory.example/?mode=test&view=catalog#access_token=PRIVATE',success=false}={}){
  let clients=0,boots=0,reloads=0,focused=null;
  const elements=new Map([['app',{_html:'',set innerHTML(value){this._html=value;for(const [,id] of value.matchAll(/id="([^"]+)"/g))elements.set(id,{id,textContent:'',disabled:false,focus(){focused=id;}});},get innerHTML(){return this._html;}}]]);
  const loc=new URL(href);loc.reload=()=>{reloads++;};
  const context={URLSearchParams,location:loc,document:{getElementById:id=>elements.get(id)},modeUrl,
    RUNTIME:{mode,error:configError,url:'https://test.example',anon:'PUBLIC',authOptions:{}},tx:key=>key,console:{error:()=>{}},
    createClient:()=>{clients++;if(constructorError)throw constructorError;return clientFactory?clientFactory():{};},
    SupabaseStore:class {constructor(){this.kind='supabase';}},LocalStore:class{constructor(){if(localError)throw localError;this.kind='local';}},
    boot:async()=>{boots++;if(!success)throw bootError;}};
  vm.createContext(context);vm.runInContext(entry,context);await new Promise(resolve=>setImmediate(resolve));
  return {elements,context,clients:()=>clients,boots:()=>boots,reloads:()=>reloads,focused:()=>focused};
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
