/* ---------- 三表共用填寫窗（加一列/編輯） ---------- */
const TABLE_FORM_FIELDS={
  tf:[
    ["notified","通知日期","date"],["code","加工編號","text",true],["seq","加工序","number"],
    ["totalQty","全部可給數","number"],["expectedSend","可給二廠時間","text",false,true],
    ["urgentQty","急用","number"],["due","要求回一廠時間","date"],
    ["floor1","現在貨在1樓","number"],["floor3","現在貨在3樓","number"],
    ["returned","已回一廠","check"],["note","備註","text"]
  ],
  rush:[
    ["f1.shipDate","出貨日期","date"],["f1.vendor","廠商","text"],["f1.desc","品號","text"],
    ["f1.shortQty","欠貨數量","number"],["f1.note","備註","text"],
    ["f2.startDate","開工","date"],["f2.dueDate","預計完成","date"],
    ["f2.itemProcess","品號／製程","text"],["f2.desc","描述","text"],
    ["f2.qty","數量","number"],["f2.note","備註","text"]
  ],
  wl:[
    ["date","日期","date"],["code","加工編號","text"],["goodQty","合格數","number"],
    ["badQty","不良","number"],["startH","開工時","hour"],["startM","開工分","minute"],
    ["endH","完工時","hour"],["endM","完工分","minute"],
    ["reworkMin","修模時間","number"],["worker","加工者","text"],["note","備註","text"]
  ]
};
const TABLE_TITLES={tf:"給二廠／回一廠",rush:"欠缺品項",wl:"工作紀錄"};
function tableFormModal(m){
  const table=m.table,fields=TABLE_FORM_FIELDS[table]||[];
  const isNew=!m.id;
  const D=m.draft||{};
  const inp=(f)=>{
    const [key,label,type,required,freeText]=f;
    const id="tf-f-"+key.replace(/\./g,"-");
    const val=getPath(D,key)??"";
    if(type==="check")return '<label class="permission-row"><input type="checkbox" id="'+id+'" data-fk="'+key+'"'+(val?" checked":"")+'><span><b>'+label+'</b></span></label>';
    if(type==="hour"||type==="minute"){
      const max=type==="hour"?23:59;
      return '<div class="field"><label for="'+id+'">'+label+'</label><select class="inp" id="'+id+'" data-fk="'+key+'">'+numSelOptions(val,max,1)+'</select></div>';
    }
    const attr=type==="date"?'type="date"':type==="number"?'type="number" min="0" step="1"':'maxlength="200" autocomplete="off"';
    const ph=freeText?' (日期或 08\\16 文字)':'';
    return '<div class="field"><label for="'+id+'">'+label+(required?" *":"")+'</label><input class="inp" id="'+id+'" data-fk="'+key+'" type="'+(type==="date"?"date":type==="number"?"number":"text")+'" '+attr+' value="'+esc(val)+'" placeholder="'+ph+'"></div>';
  };
  const body='<div class="hint">'+(isNew?"填完按儲存才會新增。":"修改完按儲存。")+(table==="tf"?"　加工編號必填。":"")+'</div>'+
    fields.map(inp).join("");
  const foot='<button class="btn" data-act="close">取消</button>'+
    (!isNew&&m.canDelete?'<button class="btn danger" data-act="tbl-del" data-table="'+table+'" data-id="'+esc(m.id||"")+'">'+(m.confirmDel?"再按一次刪除":"刪除")+'</button>':'')+
    '<div class="spacer"></div><button class="btn primary" data-act="tbl-save" data-table="'+table+'"'+(m.saving?" disabled":"")+'>'+(m.saving?"儲存中…":"儲存")+'</button>';
  return {title:(isNew?"新增":"編輯")+" — "+TABLE_TITLES[table],body,foot};
}
MODALS['tbl-form']=tableFormModal;
function openTableForm(table,id){
  const list=table==="rush"?(S.rushOrders||[]):table==="tf"?transferOrders(S):(S.workLog||[]);
  const row=id?list.find(r=>r.id===id):null;
  const draft=row?structuredClone(row):null;
  const perm=table==="rush"?"rush.manage":table==="tf"?"transfers.manage":"worklog.manage";
  const canEdit=canPermission(perm);
  if(!canEdit){toast("只有老闆／組長可以"+(id?"修改":"新增"));return;}
  openModal({t:"tbl-form",table,id:id||null,draft,saving:false,canDelete:!!id});
}
function saveTableForm(button){
  const m=UI.modal;if(m?.t!=="tbl-form"||m.saving)return;
  const table=m.table;
  // 收集表單值
  const D=m.draft||{};
  for(const el of document.querySelectorAll("[data-fk]")){
    const key=el.dataset.fk;
    if(el.type==="checkbox")setPath(D,key,el.checked);
    else if(el.tagName==="SELECT"||el.type==="number"){
      const v=el.value.trim();
      setPath(D,key,v===""?null:Math.round(+v));
    }else setPath(D,key,el.value.trim()||null);
  }
  // 驗證
  const list=table==="rush"?(S.rushOrders||[]):table==="tf"?transferOrders(S):(S.workLog||[]);
  const perm=table==="rush"?"rush.manage":table==="tf"?"transfers.manage":"worklog.manage";
  m.saving=true;renderModal();
  try{
    if(table==="tf"){
      if(!D.code||!String(D.code).trim())throw new Error("加工編號必填");
      if(m.id){
        const idx=list.findIndex(r=>r.id===m.id);
        if(idx>=0)list[idx]=D;
      }else{
        if(!D.id)D.id=uid();
        D.itemCode=D.itemCode||D.code;D.fromFactory=D.fromFactory||1;D.toFactory=D.toFactory||2;D.returnFactory=D.returnFactory||1;
        D.urgentQty=D.urgentQty||0;D.returned=!!D.returned;D.workIds=D.workIds||[];D.status=D.status||"active";
        D.batches=D.batches||[];D.events=D.events||[];
        list.unshift(D);
      }
      validateTransfers(S,{before:S});
    }else if(table==="rush"){
      if(!D.id)D.id=uid();
      if(!D.f1)D.f1={};if(!D.f2)D.f2={};
      if(m.id){
        const idx=list.findIndex(r=>r.id===m.id);
        if(idx>=0)list[idx]=D;
      }else list.unshift(D);
      validateRush(S.rushOrders);
    }else{
      if(!D.id)D.id=uid();
      if(m.id){
        const idx=list.findIndex(r=>r.id===m.id);
        if(idx>=0)list[idx]=D;
      }else list.unshift(D);
      validateWorkLog(S.workLog);
    }
    const title=m.id?"更新"+TABLE_TITLES[table]+"一列":"新增"+TABLE_TITLES[table]+"一列";
    closeModal();
    commit({kind:"edit",title,lines:[]},perm);
    // 高亮新列
    UI.flashNewRow=D.id;
    toast("已儲存");
  }catch(e){
    m.saving=false;
    // 回滾
    if(!m.id&&list[0]===D)list.shift();
    else if(m.id){const idx=list.findIndex(r=>r.id===m.id);if(idx>=0&&m.draft)list[idx]=m.draft;}
    renderModal();
    toast(e.message+"；沒存到");
  }
}
