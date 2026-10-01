const fs = require('fs');
let s = fs.readFileSync('web/src/app.js', 'utf8');
const rep = (a, b) => { if (!s.includes(a)) throw new Error('MISS: ' + JSON.stringify(a.slice(0, 50))); s = s.replace(a, b); };

// 1. 側欄圖例：「詢問中」→「未確定」
rep(
  `'<span><i class="yellow"></i>詢問中</span>'`,
  `'<span><i class="yellow"></i>未確定</span>'`
);

// 2. 筆刷按鈕加「未確定」（黃色）
rep(
  `'<button class="tg brush-work'+(UI.leaveBrush==="work"?" on":"")+'" data-act="cal-brush" data-v="work" aria-pressed="'+(UI.leaveBrush==="work")+'">上班</button>'`,
  `'<button class="tg brush-work'+(UI.leaveBrush==="work"?" on":"")+'" data-act="cal-brush" data-v="work" aria-pressed="'+(UI.leaveBrush==="work")+'">上班</button><button class="tg brush-uncertain'+(UI.leaveBrush==="uncertain"?" on":"")+'" data-act="cal-brush" data-v="uncertain" aria-pressed="'+(UI.leaveBrush==="uncertain")+'">未確定</button>'`
);

// 3. cal-brush dispatch 加 uncertain
rep(
  `case "cal-brush":{if(!canIncidents())break;const v=a.dataset.v;UI.leaveBrush=UI.leaveBrush===v?null:v;render();if(UI.leaveBrush)toast("已選「"+(UI.leaveBrush==="leave"?"休假":"上班")+"」：可以直接連續點日曆上這個月要"+(UI.leaveBrush==="leave"?"休假":"上班")+"的日期，點完即存。再按一次按鈕結束。");break;}`,
  `case "cal-brush":{if(!canIncidents())break;const v=a.dataset.v;UI.leaveBrush=UI.leaveBrush===v?null:v;UI.brushStart=null;render();if(UI.leaveBrush){const names={leave:"休假",work:"上班",uncertain:"未確定"};toast("已選「"+names[UI.leaveBrush]+"」：連點日期套用，或點第一天再點最後一天框選範圍。再按一次按鈕結束。");}break;}`
);

// 4. person-day dispatch：支援 uncertain 筆刷
rep(
  `if(UI.leaveBrush){
        const eid=a.dataset.id,dd=a.dataset.d;
        // 範圍框選：第一次點＝起點（亮待選），第二次點＝終點（一次套用整段）
        if(!UI.brushStart){
          UI.brushStart={eid,d:dd};
          render();
          toast("起點 "+md(dd)+"；再點最後一天框選範圍，或繼續單點");
          break;
        }
        const start=UI.brushStart.d,end=dd;
        UI.brushStart=null;
        const [lo,hi]=start<=end?[start,end]:[end,start];
        let cnt=0;
        const E=emp(eid);
        for(let x=lo;x<=hi&&cnt<62;x=addDays(x,1)){
          const cur=E.leaves.includes(x);
          const want=UI.leaveBrush==="leave";
          if(want!==cur){
            if(want&&!S.blocks.some(b=>b.emp===eid&&b.date===x&&futureOf(b))){
              if(!E.leaves.includes(x))E.leaves.push(x);cnt++;
            }else if(!want&&cur){
              E.leaves=E.leaves.filter(y=>y!==x);cnt++;
            }
          }
        }
        if(cnt){
          pushUndo();
          commit({kind:"leave",title:E.name+" 範圍設定 "+md(lo)+"～"+md(hi)+"（"+cnt+" 天）",lines:[]},"incidents.manage");
          toast("已套用 "+md(lo)+" 到 "+md(hi)+"（"+cnt+" 天變更）");
        }else{
          render();
          toast("範圍內沒有需要變更的日期");
        }
        break;
      }`,
  `if(UI.leaveBrush){
        const eid=a.dataset.id,dd=a.dataset.d;
        const isUnc=UI.leaveBrush==="uncertain";
        // 未確定＝建/刪 pending leave request（黃色）
        const toggleUncertain=async(d)=>{
          const reqs=(S.leaveRequests||[]).filter(x=>x.employeeId===eid&&x.date===d);
          const pend=reqs.find(x=>x.status==="pending");
          if(pend){
            if(STORE.kind==="local"){pend.status="rejected";pend.resolvedAt=new Date().toISOString();await STORE.sync(S);}
            else await STORE.resolveLeaveRequest(pend.id,"rejected");
            return -1;
          }
          if(!reqs.length){
            const req={id:uid(),employeeId:eid,date:d,note:"未確定",status:"pending"};
            if(STORE.kind==="local"){(S.leaveRequests||=[]).push(req);await STORE.sync(S);}
            else await STORE.createLeaveRequest(req);
            return 1;
          }
          return 0;
        };
        // 範圍框選
        if(!UI.brushStart){
          UI.brushStart={eid,d:dd};
          render();
          toast("起點 "+md(dd)+"；再點最後一天框選範圍，或繼續單點");
          break;
        }
        const start=UI.brushStart.d,end=dd;
        UI.brushStart=null;
        const [lo,hi]=start<=end?[start,end]:[end,start];
        if(isUncertain){
          (async()=>{
            let cnt=0;
            for(let x=lo;x<=hi&&cnt<62;x=addDays(x,1)){const r=await toggleUncertain(x);if(r!==0)cnt++;}
            await reloadFromStore();UI.drawer="people";
            toast("已套用未確定 "+md(lo)+"～"+md(hi)+"（"+cnt+" 天）");
          })();
          break;
        }
        let cnt=0;
        const E=emp(eid);
        for(let x=lo;x<=hi&&cnt<62;x=addDays(x,1)){
          const cur=E.leaves.includes(x);
          const want=UI.leaveBrush==="leave";
          if(want!==cur){
            if(want&&!S.blocks.some(b=>b.emp===eid&&b.date===x&&futureOf(b))){
              if(!E.leaves.includes(x))E.leaves.push(x);cnt++;
            }else if(!want&&cur){
              E.leaves=E.leaves.filter(y=>y!==x);cnt++;
            }
          }
        }
        if(cnt){
          pushUndo();
          commit({kind:"leave",title:E.name+" 範圍設定 "+md(lo)+"～"+md(hi)+"（"+cnt+" 天）",lines:[]},"incidents.manage");
          toast("已套用 "+md(lo)+" 到 "+md(hi)+"（"+cnt+" 天變更）");
        }else{
          render();
          toast("範圍內沒有需要變更的日期");
        }
        break;
      }`
);

// 5. 單點也要支援 uncertain
rep(
  `if(UI.leaveBrush){applyPersonDay(a.dataset.id,a.dataset.d,UI.leaveBrush==="leave");break;}
      openModal({t:'person-day',id,d:a.dataset.d});break;}`,
  `if(UI.leaveBrush==="uncertain"){
        // 單點未確定：切換 pending request
        const eid=a.dataset.id,dd=a.dataset.d;
        (async()=>{
          try{
            const reqs=(S.leaveRequests||[]).filter(x=>x.employeeId===eid&&x.date===dd);
            const pend=reqs.find(x=>x.status==="pending");
            if(pend){
              if(STORE.kind==="local"){pend.status="rejected";pend.resolvedAt=new Date().toISOString();await STORE.sync(S);toast("已取消未確定 "+md(dd));}
              else{await STORE.resolveLeaveRequest(pend.id,"rejected");toast("已取消未確定 "+md(dd));}
            }else{
              const req={id:uid(),employeeId:eid,date:dd,note:"未確定",status:"pending"};
              if(STORE.kind==="local"){(S.leaveRequests||=[]).push(req);await STORE.sync(S);}
              else await STORE.createLeaveRequest(req);
              toast("已設為未確定 "+md(dd));
            }
            await reloadFromStore();UI.drawer="people";
          }catch(e){toast("沒存到："+e.message);}
        })();
        break;
      }
      if(UI.leaveBrush){applyPersonDay(a.dataset.id,a.dataset.d,UI.leaveBrush==="leave");break;}
      openModal({t:'person-day',id,d:a.dataset.d});break;}`
);

fs.writeFileSync('web/src/app.js', s);
console.log('uncertain brush applied');
