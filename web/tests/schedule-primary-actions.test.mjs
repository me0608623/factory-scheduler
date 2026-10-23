import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {SaxesParser} from 'saxes';

const source=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
function renderDay({readOnly=false,pending=false,preview=false,blocks=[]}={}){
  const env={UI:{date:'2026-10-26',factory:1},S:{blocks,setupPending:pending},SZ:{day:1},readOnly,PV:{mode:'cmp'},
    DAY0:480,DAY1:1200,LUNCH_S:720,REG_END:1020,hourPx:()=>60,
    dayInfo:()=>({open:true,win:[[480,1020]]}),shownMachines:()=>[{id:'M1',label:'Press',proc:'Cut',faults:[]}],shownEmployees:()=>[],
    issuesOf:()=>[],blkHTML:()=>'',emp:()=>({name:'Lin'}),order:()=>({code:'ORDER42'}),stepName:()=> 'Cut',
    todayStr:()=> '2026-10-23',tx:x=>x,RUNTIME:{mode:'production'},esc:String,factoryName:String,
    mdw:String,hm:String,szoomBarHTML:()=>'',canCalendar:()=>!readOnly};
  vm.createContext(env);
  vm.runInContext(source.slice(source.indexOf('function dayHTML('),source.indexOf('function blkHTML(')),env);
  const buttons=[];
  const parser=new SaxesParser({xmlns:false});
  parser.on('opentag',tag=>{if(tag.name==='button')buttons.push(tag.attributes);});
  parser.write(env.dayHTML({pv:preview}).replace(/ hidden(?=[ >])/g,' hidden="hidden"')).close();
  return {buttons,html:env.dayHTML({pv:preview})};
}

test('the day board exposes manual and automatic scheduling without opening More',()=>{
  assert.deepEqual(renderDay().buttons.filter(button=>['manual-add','auto'].includes(button['data-act'])).map(button=>button['data-act']),['manual-add','auto']);
});

test('day board primary scheduling actions respect read-only, setup and preview gates',()=>{
  for(const options of [{readOnly:true},{pending:true},{preview:true}]){
    assert.deepEqual(renderDay(options).buttons.filter(button=>['manual-add','auto'].includes(button['data-act'])),[],JSON.stringify(options));
  }
});

test('mobile work entry opens the earliest real block with actual labels and times',()=>{
  const blocks=[{id:'later',m:'M1',date:'2026-10-26',s:1100,e:1140,emp:'E1',oid:'O1'},
    {id:'earliest',m:'M1',date:'2026-10-26',s:960,e:1000,emp:'E1',oid:'O1'},
    {id:'other-factory',m:'M2',date:'2026-10-26',s:480,e:540}];
  const {buttons,html}=renderDay({blocks});
  assert.deepEqual(buttons.filter(b=>b['data-act']==='blk-open').map(b=>b['data-v']),['earliest']);
  for(const text of ['ORDER42','M1','Press','Lin','960','1000','Cut'])assert.ok(html.includes(text),text);
  assert.deepEqual(blocks.map(b=>b.id),['later','earliest','other-factory']);
});

test('mobile work entry is absent for empty, other-date, other-factory and preview boards',()=>{
  for(const options of [{},{blocks:[{id:'x',m:'M2',date:'2026-10-26',s:960,e:1000}]},
    {blocks:[{id:'x',m:'M1',date:'2026-10-27',s:960,e:1000}]},
    {preview:true,blocks:[{id:'x',m:'M1',date:'2026-10-26',s:960,e:1000}]}]){
    assert.deepEqual(renderDay(options).buttons.filter(b=>b['data-act']==='blk-open'),[]);
  }
});

function topActions({view='week',layout='resource',readOnly=false,pending=false,preview=false}={}){
  const env={UI:{date:'2026-10-26',view,layout,factory:1},S:{setupPending:pending},readOnly,PV:preview?{}:null,
    STORE:null,IC:{user:''},NAV_IC:{today:''},dayInfo:()=>({type:'work'}),weekStart:String,md:String,mdw:String,
    addDays:String,isoWeek:()=>44,dayLabel:()=>'',testModeLabelHTML:()=>'',environmentHTML:()=>'',syncChipHTML:()=>'',tx:x=>x,esc:String};
  vm.createContext(env);
  vm.runInContext(source.slice(source.indexOf('function topHTML('),source.indexOf('function appNavHTML(')),env);
  const buttons=[];
  for(const tag of env.topHTML().match(/<button\b[^>]*>/g)||[]){
    const parser=new SaxesParser({xmlns:false});parser.on('opentag',node=>buttons.push(node.attributes));
    parser.write(tag.slice(0,-1)+'/>').close();
  }
  return buttons.filter(b=>['manual-add','auto'].includes(b['data-act'])).map(b=>b['data-act']);
}

test('week and work layouts retain both primary actions with the same permission and preview gates',()=>{
  for(const layout of [{view:'week'},{view:'day',layout:'work'}]){
    assert.deepEqual(topActions(layout),['manual-add','auto']);
    for(const gate of [{readOnly:true},{pending:true},{preview:true}])assert.deepEqual(topActions({...layout,...gate}),[]);
  }
  assert.deepEqual(topActions({view:'day'}),[],'resource day owns its actions on the board');
});
