import {chatContext,answerFromFacts} from './chat-context.js';
import { tx } from './i18n.js';
import {SOLVER} from './solver.js';
import {floatWindow} from './win.js';

export function installScheduleChat({snapshot,view,store,enabled,stamp}){
  const root=document.createElement('aside');root.id='schedule-chat';root.setAttribute('aria-label','排程聊天室');document.body.append(root);
  root.innerHTML='<button class="chat-launch" aria-label="'+tx('開啟排程 AI 聊天室')+'" aria-expanded="false" aria-controls="schedule-chat-panel">'+tx('✦ 排程助理')+'</button><section id="schedule-chat-panel" class="chat-panel" hidden aria-label="'+tx('排程 AI 聊天室')+'"><header><strong>排程助理</strong><button class="btn chat-tts" aria-pressed="false" title="'+tx('新回答自動唸出來')+'">🔊</button><button class="btn chat-clear">清除</button><button class="btn chat-close" aria-label="'+tx('關閉聊天室')+'">×</button></header><div class="chat-log" role="log" aria-live="polite" aria-label="'+tx('排程對話')+'"></div><form><textarea id="schedule-chat-question" maxlength="1000" rows="2" placeholder="'+tx('問我排程、請假、趕貨…')+'"></textarea><button class="btn primary" type="submit">送出</button></form><div class="chat-quick"><button class="btn">'+tx('目前排程有哪些問題？')+'</button><button class="btn">'+tx('誰請假？')+'</button><button class="btn">'+tx('哪些機台故障？')+'</button><button class="btn">'+tx('輪班人力缺口')+'</button><button class="btn">'+tx('跨廠流轉進度')+'</button><button class="btn">'+tx('特別趕貨欠什麼？')+'</button></div></section>';
  const launch=root.querySelector('.chat-launch'),panel=root.querySelector('.chat-panel'),log=root.querySelector('.chat-log'),input=root.querySelector('textarea'),submit=root.querySelector('[type="submit"]'),ttsBtn=root.querySelector('.chat-tts');
  // 浮動定位（桌面）：藥丸本身與聊天窗標題皆為拖曳把手；點一下仍開關聊天、拖動則移動位置。
  // 位置存 fsched-float-chat；雙擊把手回預設（右下角）；手機維持 CSS 錨定不啟用。
  let chatFloat=null;
  // 面板邊緣錨定與垂直可見性：靠近左緣時面板改從根左緣向右展開；展開空間不足時下移藥丸
  const positionPanel=()=>{
    if(window.matchMedia('(max-width:800px)').matches){
      // 手機：回到 CSS 錨定（清掉桌面浮動的 inline 定位與錨定 class）
      root.classList.remove('panel-left','float-win');
      root.style.left=root.style.top=root.style.right=root.style.bottom='';
      return;
    }
    const r=root.getBoundingClientRect();
    const panelW=Math.min(430,Math.max(320,Math.min(400,innerWidth-24)));
    root.classList.toggle('panel-left',r.x+r.width-panelW<8);
    if(!panel.hidden){
      const ph=Math.min(550,innerHeight*0.8,innerHeight-90);
      const minY=Math.min(innerHeight-r.height-8,ph+66);
      if(r.y<minY){root.style.top=minY+'px';if(chatFloat)chatFloat.state.geom.y=Math.round(minY);}
    }
  };
  {
    const chatHead=panel.querySelector('header');
    // 強制收縮後量自然尺寸，避免安裝當下 block 填滿寬度造成預設位置偏移
    const prevW=launch.style.width;
    launch.style.width='fit-content';
    const w=launch.offsetWidth||150,h=launch.offsetHeight||52;
    launch.style.width=prevW;
    chatFloat=floatWindow(root,{key:'fsched-float-chat',defaults:{x:Math.max(8,innerWidth-w-18),y:Math.max(8,innerHeight-h-18),w,h},handle:launch,moveOnly:true,dragOnButton:true});
    chatHead.addEventListener('pointerdown',ev=>{
      if(ev.target.closest('button')||window.matchMedia('(max-width:800px)').matches)return;
      launch.dispatchEvent(new PointerEvent('pointerdown',{clientX:ev.clientX,clientY:ev.clientY,bubbles:false}));
    });
    addEventListener('resize',()=>positionPanel());
    addEventListener('pointerup',()=>{if(!panel.hidden)setTimeout(positionPanel,0);},{passive:true});
  }
  // 語音播報：用瀏覽器內建語音（zh-TW 優先），不把回答送到任何服務
  let ttsAuto=false;try{ttsAuto=localStorage.getItem('fsched-chat-tts')==='1';}catch{}
  const synthOK=typeof window!=='undefined'&&'speechSynthesis' in window;
  const zhVoice=()=>{const vs=window.speechSynthesis.getVoices();return vs.find(v=>/zh[-_]TW/i.test(v.lang))||vs.find(v=>/^zh/i.test(v.lang))||null;};
  const speak=text=>{if(!synthOK)return;window.speechSynthesis.cancel();const clean=String(text).replace(/\s+/g,' ').slice(0,600);const u=new SpeechSynthesisUtterance(clean);u.lang='zh-TW';const v=zhVoice();if(v)u.voice=v;u.onend=u.onerror=()=>{for(const b of log.querySelectorAll('.chat-speak')){b.textContent='🔊 播報';b.dataset.on='';}};window.speechSynthesis.speak(u);};
  const stopSpeak=()=>{if(synthOK)window.speechSynthesis.cancel();};
  if(!synthOK)ttsBtn.hidden=true;
  ttsBtn.setAttribute('aria-pressed',String(ttsAuto));ttsBtn.classList.toggle('on',ttsAuto);
  ttsBtn.onclick=()=>{ttsAuto=!ttsAuto;try{localStorage.setItem('fsched-chat-tts',ttsAuto?'1':'0');}catch{}ttsBtn.setAttribute('aria-pressed',String(ttsAuto));ttsBtn.classList.toggle('on',ttsAuto);if(!ttsAuto)stopSpeak();else toastMini('開啟播報：新的回答會唸出來');};
  const toastMini=t=>{const p=document.createElement('p');p.className='chat-notice';p.textContent=t;log.append(p);setTimeout(()=>p.remove(),4000);};
  const attachSpeak=(el,text)=>{if(!synthOK)return;const b=document.createElement('button');b.className='btn chat-speak';b.textContent='🔊 播報';b.onclick=()=>{if(b.dataset.on){stopSpeak();b.textContent='🔊 播報';b.dataset.on='';}else{speak(text);b.dataset.on='1';b.textContent='■ 停止';}};el.append(b);};
  const from={value:view().date},to={value:view().date};let lastViewDate='';
  let busy=false,generation=0,lastStamp='',messages=[];
  const add=(who,text)=>{const el=document.createElement('div');el.className='chat-message '+who;el.textContent=text;log.append(el);while(log.children.length>30)log.firstElementChild.remove();log.scrollTop=log.scrollHeight;return el;};
  const hide=()=>{panel.hidden=true;launch.setAttribute('aria-expanded','false');launch.focus();};
  const scopeStamp=()=>stamp()+'|'+from.value+'|'+to.value;
  const refresh=()=>{const v=view();root.hidden=!enabled();if(v.date!==lastViewDate){from.value=to.value=v.date;lastViewDate=v.date;}};
  from.onchange=to.onchange=()=>refresh();  launch.onclick=()=>{refresh();panel.hidden=!panel.hidden;launch.setAttribute('aria-expanded',String(!panel.hidden));positionPanel();if(!panel.hidden)input.focus();};
  root.querySelector('.chat-close').onclick=hide;
  panel.addEventListener('keydown',e=>{if(e.key==='Escape'){e.stopPropagation();hide();}});
  root.querySelector('.chat-clear').onclick=()=>{generation++;log.replaceChildren();messages=[];lastStamp='';busy=false;submit.disabled=false;input.value='';input.focus();};
  async function send(question){
    const q=question.trim();if(!q||busy)return;refresh();if(!enabled())return;
    const v={...view(),date:from.value,end_date:to.value,question:q},base=scopeStamp(),token=++generation;busy=true;submit.disabled=true;
    if(lastStamp&&lastStamp!==base){messages=[];add('notice','排程或查看範圍已更新；本題重新讀取目前資料，不沿用舊資料判斷。');}
    lastStamp=base;add('user',q);input.value='';const pending=add('assistant','正在讀取排程…');
    try{
      let result;
      if(store().kind==='local'){const context=chatContext(snapshot(),v);result={...answerFromFacts(q,context),context};}
      else result=await SOLVER.chat({question:q,date:v.date,end_date:v.end_date,factory:v.factory,generate:false,history:[],...(store().kind==='local'?{snapshot:snapshot()}: {})},store().jwt());
      if(token!==generation)return;
      if(base!==scopeStamp()){pending.textContent='回答期間排程或日期／廠別已改變。這份結果已捨棄，請重新提問。';return;}
      pending.textContent=result.engine+'\n'+result.answer;
      attachSpeak(pending,result.answer);
      if(ttsAuto)speak(result.answer);
      const context=result.context,details=document.createElement('details'),summary=document.createElement('summary');summary.textContent='依據：'+context.date+'～'+(context.endDate||context.date)+' · 版本 '+context.version+(context.truncated?'（資料已截短，不能當完整結論）':'');details.append(summary);
      for(const id of result.citations||[]){const f=context.facts.find(f=>f.id===id);if(f){const line=document.createElement('p');line.textContent='['+id+'] '+f.text;details.append(line);}}
      pending.append(details);messages.push({role:'user',content:q},{role:'assistant',content:result.answer.slice(0,2000)});messages=messages.slice(-6);
      if(context.truncated)add('notice','本次最多提供 100 筆依據；請縮小範圍，不能據此宣稱沒有其他問題。');
      if(result.answerTruncated)add('notice','畫面先列出 12 筆；還有其他符合的資料，請縮小日期或指定員工後查詢。');
    }catch(e){if(token===generation)pending.textContent='無法回答：'+e.message+'。沒有修改排程；也未將查詢失敗當成沒有問題。';}
    finally{if(token===generation){busy=false;submit.disabled=false;log.scrollTop=log.scrollHeight;}}
  }
  root.querySelector('form').onsubmit=e=>{e.preventDefault();send(input.value);};
  // 語音輸入：按住說話，放開自動送出（Chrome/Edge 支援）
  if('webkitSpeechRecognition' in window || 'SpeechRecognition' in window){
    const micBtn=document.createElement('button');
    micBtn.className='btn chat-mic';micBtn.type='button';micBtn.innerHTML='🎤';micBtn.title='按住說話';
    micBtn.setAttribute('aria-label','語音輸入');
    submit.before(micBtn);
    const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
    let rec=null,listening=false;
    micBtn.onclick=()=>{
      if(listening){rec&&rec.stop();return;}
      rec=new SR();
      rec.lang='zh-TW';rec.interimResults=true;rec.continuous=false;
      rec.onstart=()=>{listening=true;micBtn.textContent='🔴';micBtn.classList.add('rec');input.placeholder='說話中…';};
      rec.onresult=e=>{
        let txt='';
        for(const r of e.results)txt+=r[0].transcript;
        input.value=txt;
        if(e.results[e.results.length-1].isFinal){micBtn.click();setTimeout(()=>{if(input.value.trim())send(input.value);},200);}
      };
      rec.onerror=()=>{listening=false;micBtn.textContent='🎤';micBtn.classList.remove('rec');input.placeholder='問我排程、請假、趕貨…';};
      rec.onend=()=>{listening=false;micBtn.textContent='🎤';micBtn.classList.remove('rec');input.placeholder='問我排程、請假、趕貨…';};
      rec.start();
    };
  }
  for(const button of root.querySelectorAll('.chat-quick button'))button.onclick=()=>send(button.textContent);
  refresh();return {refresh,destroy:()=>{generation++;root.remove();}};
}
