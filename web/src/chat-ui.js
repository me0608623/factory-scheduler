import {chatContext,answerFromFacts} from './chat-context.js';
import {SOLVER} from './solver.js';

export function installScheduleChat({snapshot,view,store,enabled,stamp}){
  const root=document.createElement('aside');root.id='schedule-chat';root.setAttribute('aria-label','排程聊天室');document.body.append(root);
  root.innerHTML='<button class="chat-launch" aria-label="開啟排程 AI 聊天室" aria-expanded="false" aria-controls="schedule-chat-panel">✦ 排程助理</button><section id="schedule-chat-panel" class="chat-panel" hidden aria-label="排程 AI 聊天室"><header><strong>排程 AI 聊天室</strong><button class="btn chat-clear">清除對話</button><button class="btn chat-close" aria-label="關閉聊天室">×</button></header><p class="chat-scope"></p><p class="chat-disclosure">預設為資料查詢，非生成式 AI；不外傳模型、不修改排程。自然語言 AI 需管理員設定與資料授權。</p><label class="chat-mode"><input type="checkbox"> 使用已設定的雲端 AI</label><div class="chat-quick"><button class="btn">目前排程有哪些問題？</button><button class="btn">誰請假？</button><button class="btn">哪些機台故障？</button></div><div class="chat-log" role="log" aria-live="polite" aria-label="排程對話"></div><form><label for="schedule-chat-question">詢問目前日期／廠別的排程</label><textarea id="schedule-chat-question" maxlength="1000" rows="2" placeholder="例如：張三目前有哪些工作？"></textarea><button class="btn primary" type="submit">送出</button></form></section>';
  const launch=root.querySelector('.chat-launch'),panel=root.querySelector('.chat-panel'),log=root.querySelector('.chat-log'),input=root.querySelector('textarea'),mode=root.querySelector('input'),submit=root.querySelector('[type="submit"]');
  let busy=false,generation=0,lastStamp='',messages=[];
  const add=(who,text)=>{const el=document.createElement('div');el.className='chat-message '+who;el.textContent=text;log.append(el);while(log.children.length>30)log.firstElementChild.remove();log.scrollTop=log.scrollHeight;return el;};
  const hide=()=>{panel.hidden=true;launch.setAttribute('aria-expanded','false');launch.focus();};
  const refresh=()=>{const v=view();root.hidden=!enabled();root.querySelector('.chat-scope').textContent=v.date+' · '+(v.factory==='all'?'跨廠':v.factory+' 廠')+' · '+(store().kind==='local'?'本機已保存資料':'登入權限的雲端資料')+'；不含試排預覽';};
  launch.onclick=()=>{refresh();panel.hidden=!panel.hidden;launch.setAttribute('aria-expanded',String(!panel.hidden));if(!panel.hidden)input.focus();};
  root.querySelector('.chat-close').onclick=hide;
  panel.addEventListener('keydown',e=>{if(e.key==='Escape'){e.stopPropagation();hide();}});
  root.querySelector('.chat-clear').onclick=()=>{generation++;log.replaceChildren();messages=[];lastStamp='';busy=false;submit.disabled=false;input.value='';input.focus();};
  async function send(question){
    const q=question.trim();if(!q||busy)return;refresh();if(!enabled())return;
    const v={...view()},base=stamp(),token=++generation;busy=true;submit.disabled=true;
    if(lastStamp&&lastStamp!==base){messages=[];add('notice','排程或查看範圍已更新；本題重新讀取目前資料，不沿用舊資料判斷。');}
    lastStamp=base;add('user',q);input.value='';const pending=add('assistant','正在讀取排程…');
    try{
      let result;
      if(store().kind==='local'&&!mode.checked){const context=chatContext(snapshot(),v);result={...answerFromFacts(q,context),context};}
      else result=await SOLVER.chat({question:q,date:v.date,factory:v.factory,generate:mode.checked,history:messages.slice(-6),...(store().kind==='local'?{snapshot:snapshot()}: {})},store().jwt());
      if(token!==generation)return;
      if(base!==stamp()){pending.textContent='回答期間排程或日期／廠別已改變。這份結果已捨棄，請重新提問。';return;}
      pending.textContent=result.engine+'\n'+result.answer;
      const context=result.context,details=document.createElement('details'),summary=document.createElement('summary');summary.textContent='依據：'+context.date+' · 版本 '+context.version+(context.truncated?'（資料已截短，不能當完整結論）':'');details.append(summary);
      for(const id of result.citations||[]){const f=context.facts.find(f=>f.id===id);if(f){const line=document.createElement('p');line.textContent='['+id+'] '+f.text;details.append(line);}}
      pending.append(details);messages.push({role:'user',content:q},{role:'assistant',content:result.answer.slice(0,2000)});messages=messages.slice(-6);
      if(context.truncated)add('notice','本次最多提供 100 筆依據；請縮小範圍，不能據此宣稱沒有其他問題。');
    }catch(e){if(token===generation)pending.textContent='無法回答：'+e.message+'。沒有修改排程；也未將查詢失敗當成沒有問題。';}
    finally{if(token===generation){busy=false;submit.disabled=false;log.scrollTop=log.scrollHeight;}}
  }
  root.querySelector('form').onsubmit=e=>{e.preventDefault();send(input.value);};
  for(const button of root.querySelectorAll('.chat-quick button'))button.onclick=()=>send(button.textContent);
  refresh();return {refresh,destroy:()=>{generation++;root.remove();}};
}
