import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const start=source.indexOf('function sizeBlockDetailModal(');
const end=source.indexOf('function renderModal(',start);
assert.ok(start>=0&&end>start,'the production modal sizing entry point is available');
const sizingSource=source.slice(start,end);
const rect=(top,bottom)=>({top,bottom,height:bottom-top,left:40,right:300,width:260});

function fixture({zoom=1,top=350,bottom=420,scroll=400,scope='body',hidden=false,
  missing='',clipBottom=300}={}){
  const initialScroll=scroll,disclosures=[{open:true},{open:true}];
  const document={activeElement:null,body:{scrollTop:19,scrollLeft:5},
    documentElement:{scrollTop:23,scrollLeft:3}};
  const target={isConnected:true,value:'16:30',hidden,
    getClientRects(){return hidden?[]:[this.getBoundingClientRect()];},
    getBoundingClientRect(){return hidden?rect(0,0):rect(top-(scroll-initialScroll)*zoom,bottom-(scroll-initialScroll)*zoom);},
    focus(){document.activeElement=this;}};
  const body={clientHeight:(clipBottom-100)/zoom,scrollHeight:1400,scrollLeft:9,
    children:[target,...disclosures],
    querySelectorAll:selector=>selector==='details'?disclosures:selector==='select'?[target]:[],
    contains:node=>node===body||node===target&&scope==='body',
    getBoundingClientRect:()=>rect(100,clipBottom),
    getClientRects:()=>[rect(100,clipBottom)],
    get scrollTop(){return scroll;},set scrollTop(value){scroll=Math.max(0,Math.min(body.scrollHeight-body.clientHeight,value));}};
  const header={focus(){document.activeElement=this;}},footer={focus(){document.activeElement=this;}};
  const modal={innerHTML:'retained modal controls',
    style:{setProperty(name,value){this[name]=value;}},
    querySelector:selector=>selector==='.modal-b'&&missing!=='body'?body:null,
    contains:node=>[body,target,header,footer].includes(node)};
  const overlay={clientWidth:640,scrollTop:11,scrollLeft:7,
    querySelector:selector=>selector==='.block-detail'&&missing!=='modal'?modal:null};
  document.querySelector=selector=>selector==='#ov'&&missing!=='overlay'?overlay:null;
  document.activeElement=scope==='header'?header:scope==='footer'?footer:
    scope==='outside'?document.body:scope==='container'?body:scope==='none'?null:target;
  const env={document,UI:{zoom,modal:{t:'blk'}},innerHeight:360,
    visualViewport:{height:360},getComputedStyle:()=>({paddingTop:'16px',paddingBottom:'16px',paddingLeft:'16px',paddingRight:'16px'})};
  vm.createContext(env);vm.runInContext(sizingSource,env);
  const state=()=>({active:document.activeElement,value:target.value,open:disclosures.map(d=>d.open),
    html:modal.innerHTML,bodyLeft:body.scrollLeft,overlayTop:overlay.scrollTop,overlayLeft:overlay.scrollLeft,
    pageTop:document.body.scrollTop,pageLeft:document.body.scrollLeft,
    rootTop:document.documentElement.scrollTop,rootLeft:document.documentElement.scrollLeft});
  const retained=state();
  return {body,target,resize:()=>env.sizeBlockDetailModal(),
    sized(){assert.ok(parseFloat(modal.style['--block-detail-height'])>0);assert.ok(parseFloat(modal.style.width)>0);},
    unchanged:()=>assert.deepEqual(state(),retained,'focus, tentative value, disclosures and unrelated scroll are retained'),
    visible(){const box=target.getBoundingClientRect(),clip=body.getBoundingClientRect();
      assert.ok(box.top>=clip.top-1&&box.bottom<=clip.bottom+1,
        `focused control ${box.top}..${box.bottom} is inside modal body ${clip.top}..${clip.bottom}`);}};
}

for(const zoom of [1,1.25]){
  for(const [edge,top,bottom] of [['below',350,420],['above',70,120]]){
    test(`resize reveals retained focus clipped ${edge} the body at zoom ${zoom}`,()=>{
      const f=fixture({zoom,top,bottom});f.resize();f.visible();f.unchanged();
      const box=f.target.getBoundingClientRect();
      assert.ok(box.top-5*zoom>=99&&box.bottom+5*zoom<=301,
        'the focused control and its outline remain inside the modal body');
      const settled=f.body.scrollTop;
      for(let i=0;i<5;i++){f.resize();f.visible();f.unchanged();assert.equal(f.body.scrollTop,settled);}
    });
  }
}

test('visible body focus and focus outside the scrolling body leave its scroll alone',()=>{
  for(const zoom of [1,1.25]){
    for(const scope of ['body','header','footer','outside','container']){
      const f=fixture({zoom,scope,top:150,bottom:200});const before=f.body.scrollTop;
      f.resize();assert.equal(f.body.scrollTop,before,`${scope} at zoom ${zoom}`);f.unchanged();f.sized();
    }
  }
});

test('absent modal, absent body, hidden target and initial rendering are safe',()=>{
  for(const options of [{missing:'overlay'},{missing:'modal'},{missing:'body'},
    {hidden:true},{scope:'none'},{clipBottom:100}]){
    const f=fixture(options),before=f.body.scrollTop;
    assert.doesNotThrow(f.resize);assert.equal(f.body.scrollTop,before);f.unchanged();
    if(!['overlay','modal'].includes(options.missing))f.sized();
  }
});

test('oversized focus exposes the nearest useful portion and repeated sizing never oscillates',()=>{
  for(const zoom of [1,1.25]){
    for(const [top,bottom,edge] of [[80,400,'spans'],[350,650,'below'],[-250,50,'above']]){
      const f=fixture({zoom,top,bottom}),before=f.body.scrollTop;f.resize();f.unchanged();
      const box=f.target.getBoundingClientRect();
      assert.ok(box.top<=101&&box.bottom>=299,'oversized focus covers the available body area');
      if(edge==='spans')assert.equal(f.body.scrollTop,before,'an oversized control already spanning the body stays put');
      if(edge==='below')assert.ok(Math.abs(box.top-100)<=1,'the nearest leading edge becomes visible');
      if(edge==='above')assert.ok(Math.abs(box.bottom-300)<=1,'the nearest trailing edge becomes visible');
      const settled=f.body.scrollTop;
      for(let i=0;i<5;i++){f.resize();f.unchanged();assert.equal(f.body.scrollTop,settled,'stable geometry does not oscillate');}
    }
  }
});
