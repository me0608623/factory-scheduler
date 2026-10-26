import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const init=source.slice(source.indexOf('function initFloatWins(){'),source.indexOf('function environmentHTML(){'));
function fixture(){
  const listeners=new Map(),globalListeners=new Map(),classes=new Set(),storage=new Map();
  const add=(map,type,fn)=>{if(!map.has(type))map.set(type,new Set());map.get(type).add(fn);};
  let width=470;
  const aside={getBoundingClientRect:()=>({width,left:1440-width,right:1440})};
  const wrap={querySelector:selector=>selector==='.ops-drawer'?aside:null,
    style:{setProperty(name,value){assert.equal(name,'--pane-w');width=parseFloat(value);}}};
  const splitter={dataset:{},closest:selector=>selector==='.wrap'?wrap:null,
    classList:{add:name=>classes.add(name),remove:name=>classes.delete(name)},
    setPointerCapture(){},addEventListener:(type,fn)=>add(listeners,type,fn)};
  const document={activeElement:splitter};
  const env={UI:{paneW:470},innerWidth:1440,_winResizeBound:false,document,
    $:selector=>selector==='.pane-splitter'?splitter:null,
    addEventListener:(type,fn)=>add(globalListeners,type,fn),
    removeEventListener:(type,fn)=>globalListeners.get(type)?.delete(fn),
    localStorage:{setItem:(key,value)=>storage.set(key,value)},
    render(){throw new Error('Resizing must preserve the current drawer DOM');}};
  vm.createContext(env);vm.runInContext(init,env);env.initFloatWins();
  const fire=(map,type,props={})=>{
    let prevented=false;
    const event={pointerId:1,...props,preventDefault(){prevented=true;}};
    for(const fn of [...(map.get(type)||[])])fn(event);
    return prevented;
  };
  return {env,splitter,document,storage,classes,wrap,aside,
    get width(){return width;},get left(){return aside.getBoundingClientRect().left;},
    local:(type,props)=>fire(listeners,type,props),global:(type,props)=>fire(globalListeners,type,props)};
}

for(const [delta,end] of [[60,'pointerup'],[-60,'pointercancel']]){
  test('pointer drag follows horizontal movement and ends on '+end,()=>{
    const f=fixture(),left=f.left;
    assert.equal(f.local('pointerdown',{clientX:left}),true);
    assert.equal(f.classes.has('dragging'),true);
    f.global('pointermove',{clientX:left+delta});
    assert.equal(f.left,left+delta);
    assert.equal(f.width,470-delta);
    assert.equal(f.storage.has('fsched-pane-w'),false,'persist when the gesture ends');
    f.global(end);
    assert.equal(f.classes.has('dragging'),false);
    assert.equal(f.storage.get('fsched-pane-w'),String(470-delta));
    f.global('pointermove',{clientX:0});
    assert.equal(f.width,470-delta,'completed gestures no longer resize');
    assert.equal(f.document.activeElement,f.splitter);
  });
}

test('arrow keys move the divider in their named direction and retain focus',()=>{
  const f=fixture(),left=f.left;
  assert.equal(f.local('keydown',{key:'ArrowRight'}),true);
  assert.equal(f.left,left+40);
  assert.equal(f.storage.get('fsched-pane-w'),'430');
  assert.equal(f.local('keydown',{key:'ArrowLeft'}),true);
  assert.equal(f.left,left);
  assert.equal(f.storage.get('fsched-pane-w'),'470');
  assert.equal(f.document.activeElement,f.splitter);
});

for(const input of ['pointer','keyboard']){
  test(input+' resizing respects the existing drawer width limits',()=>{
    const f=fixture();
    if(input==='pointer'){
      f.local('pointerdown',{clientX:f.left});
      f.global('pointermove',{clientX:5000});assert.equal(f.width,280);
      f.global('pointermove',{clientX:-5000});assert.equal(f.width,900);
      f.global('pointerup');
    }else{
      for(let n=0;n<30;n++)f.local('keydown',{key:'ArrowRight'});
      assert.equal(f.width,280);
      for(let n=0;n<30;n++)f.local('keydown',{key:'ArrowLeft'});
      assert.equal(f.width,900);
    }
    assert.equal(f.storage.get('fsched-pane-w'),'900');
  });
}

test('repeated initialization keeps one keyboard resize and unrelated keys untouched',()=>{
  const f=fixture();f.env.initFloatWins();f.env.initFloatWins();
  assert.equal(f.local('keydown',{key:'Tab'}),false);
  assert.equal(f.width,470);
  assert.equal(f.storage.size,0);
  f.local('keydown',{key:'ArrowRight'});
  assert.equal(f.width,430,'one key press produces one resize');
  assert.equal(f.document.activeElement,f.splitter);
});
