const fs = require('fs');
let s = fs.readFileSync('web/src/app.js', 'utf8');
const rep = (a, b) => { if (!s.includes(a)) throw new Error('MISS: ' + JSON.stringify(a.slice(0, 50))); s = s.replace(a, b); };

// ===== 1. 插入填寫窗系統 =====
const fn = fs.readFileSync('docs/form-modal.tmp.js', 'utf8');
rep('function reviewPageHTML(){', fn + '\nfunction reviewPageHTML(){');

// ===== 2. 加一列改開填寫窗（取代插空白列） =====
// rush-addrow
rep(
  `case "rush-addrow":{
      if(!canPermission("rush.manage"))break;
      const row={id:uid(),f1:{shipDate:todayStr(),vendor:"",desc:"",shortQty:null,note:""},f2:{startDate:"",dueDate:"",itemProcess:"",desc:"",qty:null,note:""}};
      S.rushOrders.push(row);
      try{validateRush(S.rushOrders);}catch(e){S.rushOrders.pop();toast(e.message);break;}
      commit({kind:"edit",title:"欠缺品項加一列",lines:[]},"rush.manage");
      UI.editCell={table:"rush",id:row.id,key:"f1.vendor"};render();
      setTimeout(()=>{const el=$(".cellinp");el?.focus();},60);
      break;}`,
  `case "rush-addrow":{openTableForm("rush");break;}`
);

// tf-addrow
rep(
  `case "tf-addrow":{
      if(!canPermission("transfers.manage"))break;
      let n=transferOrders(S).length+1,code="XF-"+String(n).padStart(3,"0");
      while(transferOrders(S).some(x=>x.code===code)){n++;code="XF-"+String(n).padStart(3,"0");}
      const row={id:uid(),code,itemCode:"（待填品號）",fromFactory:1,toFactory:2,returnFactory:1,totalQty:null,urgentQty:0,notified:todayStr(),expectedSend:null,due:null,urgentDue:null,seq:null,floor1:null,floor3:null,returned:false,workIds:[],status:"active",note:"",batches:[],events:[]};
      S.transferOrders.push(row);
      try{validateTransfers(S,{before:S});}catch(e){S.transferOrders.pop();toast(e.message);break;}
      commit({kind:"edit",title:"加工表加一列 "+code,lines:[]},"transfers.manage");
      UI.editCell={table:"tf",id:row.id,key:"itemCode"};render();
      setTimeout(()=>{const el=$(".cellinp");el?.focus();},60);
      break;}`,
  `case "tf-addrow":{openTableForm("tf");break;}`
);

// wl-addrow
rep(
  `case "wl-addrow":{
      if(!canPermission("worklog.manage"))break;
      const row={id:uid(),date:todayStr(),code:"",goodQty:null,badQty:null,startH:null,startM:null,endH:null,endM:null,reworkMin:null,worker:"",note:""};
      S.workLog.push(row);
      try{validateWorkLog(S.workLog);}catch(e){S.workLog.pop();toast(e.message);break;}
      commit({kind:"edit",title:"工作紀錄加一列",lines:[]},"worklog.manage");
      UI.editCell={table:"wl",id:row.id,key:"code"};render();
      setTimeout(()=>{const el=$(".cellinp");el?.focus();},60);
      break;}`,
  `case "wl-addrow":{openTableForm("wl");break;}`
);

// ===== 3. tbl-save / tbl-del dispatch =====
rep(
  `    case "wl-clearfilter":{UI.workLogDate="";render();break;}`,
  `    case "wl-clearfilter":{UI.workLogDate="";render();break;}
    case "tbl-save":{saveTableForm(a);break;}
    case "tbl-del":{
      const m=UI.modal;if(m?.t!=="tbl-form")break;
      if(!m.confirmDel){m.confirmDel=true;renderModal();break;}
      const table=m.table;
      const list=table==="rush"?(S.rushOrders||[]):table==="tf"?transferOrders(S):(S.workLog||[]);
      const idx=list.findIndex(r=>r.id===m.id);
      if(table==="tf"&&idx>=0){
        const o=list[idx];
        if(o.batches?.length||o.events?.length){toast("這筆已有批次或流轉紀錄，改為取消");o.status="cancelled";}
        else list.splice(idx,1);
      }else if(idx>=0)list.splice(idx,1);
      closeModal();
      const perm=table==="rush"?"rush.manage":table==="tf"?"transfers.manage":"worklog.manage";
      commit({kind:"edit",title:"刪除"+TABLE_TITLES[table]+"一列",lines:[]},perm);
      toast("已刪除");break;}`
);

// ===== 4. 行點擊 → 開編輯窗（取代格子編輯） =====
// 移除 cell-edit 按鈕渲染 → 行級 onclick
// 在 transferFlowPageHTML、shortagePageHTML、workLogPageHTML 的行加 data-act="row-edit"
rep(
  `return '<button class="cellbtn" data-act="cell-edit" data-cell="'+table+'" data-id="'+esc(id)+'" data-key="'+esc(key)+'" data-type="'+type+'">'+shown+'</button>';`,
  `return '<span class="cellval">'+shown+'</span>';`
);
// 行點擊
rep(
  `    case "cell-edit":{UI.editCell={table:a.dataset.cell,id:a.dataset.id,key:a.dataset.key};render();break;}`,
  `    case "row-edit":{openTableForm(a.dataset.table,a.dataset.id);break;}`
);

// ===== 5. 窄螢幕標題列 CSS =====
// pageShell 簡化 + 響應式
rep(
  `function pageShell(title,subtitle,bodyHtml,ro,addAct,extraHead){
  return '<div class="fullpage">'+
    '<div class="page-top">'+
    '<div class="page-top-row"><button class="btn pageback" data-act="page" data-v="board">← 回今天班表</button>'+
    '<div class="page-title"><h1>'+esc(title)+'</h1><span class="savestate '+SYNC.state+'">'+pageSaveState()+'</span>'+(extraHead||"")+'</div>'+
    (ro?"":(addAct?'<button class="btn addrow-head" data-act="'+addAct+'">＋加一列</button>':""))+'</div>'+
    (subtitle?'<p class="page-sub">'+esc(subtitle)+'</p>':"")+
    '<span class="perm">'+(ro?"只可查看":"老闆／組長：點格子即可修改")+'</span></div>'+
    bodyHtml+
    '</div>';
}`,
  `function pageShell(title,subtitle,bodyHtml,ro,addAct,extraHead){
  return '<div class="fullpage">'+
    '<div class="page-top">'+
    '<div class="page-top-row"><button class="btn pageback" data-act="page" data-v="board">← 回今天班表</button>'+
    '<div class="page-title"><h1>'+esc(title)+'</h1><span class="savestate '+SYNC.state+'">'+pageSaveState()+'</span></div>'+
    (ro?"":(addAct?'<button class="btn addrow-head" data-act="'+addAct+'">＋加一列</button>':""))+'</div>'+
    (subtitle?'<p class="page-sub">'+esc(subtitle)+'</p>':"")+'</div>'+
    bodyHtml+
    (ro?"":(addAct?'<button class="btn addrow-mobile" data-act="'+addAct+'">＋加一列</button>':""))+
    '</div>';
}`
);

fs.writeFileSync('web/src/app.js', s);
console.log('UI refactor applied');
