"""Read-only, dated ledger and draft projections; no inferred production rules."""
from datetime import date as Date, timedelta


def hm(n):
    return ('次日 ' if n>=1440 else '')+f'{n%1440//60:02d}:{n%60:02d}'


def ledger_facts(raw,day,factory,add):
    scoped=lambda f:factory=='all' or factory==f
    employees={e['id']:e for e in raw.get('employees',[])}
    previous=(Date.fromisoformat(day)-timedelta(days=1)).isoformat()
    types={'regular':'例假','rest':'休息日','holiday':'假日','leave':'請假','work':'工作日'}
    for p in raw.get('staff_rosters',[]):
        if not scoped(p.get('factory')) or p.get('status')!='draft':continue
        shifts={s['id']:s for s in p.get('shifts',[])};positions={x['id']:x for x in p.get('positions',[])}
        for c in p.get('cells',[]):
            s=shifts.get(c.get('shiftId'));e=employees.get(c.get('emp'))
            if not e or c['date']!=day and not (c['date']==previous and s and any(b>1440 for a,b in s['segments'])):continue
            shift=s['name']+' '+ '、'.join(hm(a)+'–'+hm(b) for a,b in s['segments']) if s else '未指定班別'
            position=positions.get(c.get('positionId'),{}).get('name','未指定崗位')
            add('roster',f"輪班草稿 {p['name']} · {e['name']} · {c['date']} {types.get(c['type'],'待確認')} · {shift} · {position}；不是正式產線排班或出勤紀錄",p['id'])
        for d in p.get('demands',[]):
            s=shifts.get(d['shiftId']);pos=positions.get(d['positionId'])
            if d['date']!=day or not s or not pos:continue
            count=sum(c['date']==day and c['type']=='work' and c.get('shiftId')==s['id'] and c.get('positionId')==pos['id'] for c in p.get('cells',[]))
            capacity=None if pos.get('rate') is None else count*sum(b-a for a,b in s['segments'])/60*pos['rate']
            missing=max(0,d['people']-count)
            production='產能未設定，不能判斷產量缺口' if capacity is None else f'名義產能 {round(capacity,2)} 件（未扣除資格／請假等衝突），不是實際產出'
            text=f"輪班草稿 {p['name']} · {s['name']}／{pos['name']}：需求 {d['people']} 人，草稿填入 {count} 人，尚缺 {missing} 人；目標 {d['target']} 件，{production}"
            add('roster',text,p['id'])
            if missing or capacity is not None and capacity<d['target']:add('alert',text,p['id'])
    for o in raw.get('transfer_orders',[]):
        if not any(scoped(o.get(k)) for k in ('fromFactory','toFactory','returnFactory')) or o.get('notified') and o['notified']>day:continue
        totals={k:0 for k in ('send','receive','complete','return','accept','scrap','rejected')}
        events=sorted([e for e in o.get('events',[]) if e.get('at','')<=day+'T23:59'],key=lambda e:e['at'])
        done_at=urgent_at=None;accepted=0
        for e in events:
            action=e['action']
            if action in totals:totals[action]+=e.get('qty',0)
            if action=='complete':totals['scrap']+=e.get('badQty',0)
            if action=='accept':
                totals['rejected']+=e.get('badQty',0);accepted+=e.get('qty',0)
                if not done_at and o.get('totalQty') is not None and accepted>=o['totalQty']:done_at=e['at'][:10]
                if not urgent_at and o.get('urgentQty',0)>0 and accepted>=o['urgentQty']:urgent_at=e['at'][:10]
        n=totals;code=o.get('code','跨廠加工')
        add('transfer',f"加工單 {code} · {o.get('itemCode','待確認')} · {o.get('fromFactory','?')} 廠→{o.get('toFactory','?')} 廠→{o.get('returnFactory','?')} 廠；截至 {day} 已存流水：交出 {n['send']}、加工廠點收 {n['receive']}、加工良品 {n['complete']}、送回 {n['return']}、回廠合格點收 {n['accept']} 件；加工不良 {n['scrap']}、回廠不良 {n['rejected']} 件；目前單據設定 {o.get('status','待確認')}；回廠期限 {o.get('due') or '待確認'}。不推估運送／點收耗時",o['id'])
        warnings=[]
        total=o.get('totalQty');due=o.get('due')
        if total is None:warnings.append('總數量待確認')
        if not o.get('workIds'):warnings.append('加工內容待確認')
        if not due:warnings.append('回廠期限待確認')
        if total is not None and n['receive']<total:warnings.append(f"尚有 {total-n['receive']} 件未點收到加工廠")
        if due and due<day and (total is None or n['accept']<total):warnings.append('回廠逾期')
        missing=max(0,o.get('urgentQty',0)-n['accept'])
        if missing:warnings.append(f'急用尚缺 {missing} 件'+('，已逾期' if o.get('urgentDue') and o['urgentDue']<day else ''))
        if done_at and due and done_at>due:warnings.append('已結案，但實際回廠逾期')
        if urgent_at and o.get('urgentDue') and urgent_at>o['urgentDue']:warnings.append('急用已回廠，但超過急用期限')
        if n['scrap'] or n['rejected']:warnings.append('不良／點收差異需處理')
        for w in warnings:add('deadline' if '逾期' in w else 'material',code+'：'+w+'（按截至所選日的已存流水）',o['id'])
