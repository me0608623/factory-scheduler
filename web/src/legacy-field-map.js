// Suggestions only. A source column is NOT proof of a physical machine/capacity.
export function legacyFieldMap(catalog){
  return Object.entries(catalog||{}).flatMap(([factory,c])=>[
    ...(c.stations||[]).map(x=>{
      const label=x.label.replace(/\s+/g,'');let kind='待確認',suggestion='保留原欄，不推定設備或產能';
      if(/（[左右]）/.test(label)){kind='操作位置';suggestion='連回原設備群組；左右是否共用產能待確認';}
      else if(/油壓|切唇機|手動機|自動/.test(label)){kind='設備候選';suggestion='設備名稱候選；機號、工序與技能仍需核定';}
      else if(/^(焊接|壓痕|切角|成型|底捲圓|攻牙|下角|捲彈片|包裝)$/.test(label)){kind='工作內容候選';suggestion='建立工作內容；是否需要設備須另行選定，不能直接認定純人工';}
      else if(/^\d+(\.\d+)?T?$/i.test(label)){kind='規格／代號待確認';suggestion='可能是規格或設備代號；保留重複欄位，不合併';}
      return {...x,factory,kind,suggestion,status:'pending',sourceKey:factory+':'+x.cell};
    }),
    ...(c.people||[]).map(x=>({...x,factory,kind:'人員／組合欄',suggestion:'人員名冊對照，並非設備',status:'pending',sourceKey:factory+':'+x.cell})),
    ...(c.notes||[]).map(x=>({...x,factory,kind:'人力備註',suggestion:'保留原文，不當作固定產能或組員數',status:'pending',sourceKey:factory+':'+x.cell})),
    ...(c.management||[]).map(x=>({...x,factory,kind:'日期／人力管理',suggestion:'日期、跨廠支援或休假欄，不建立假機台',status:'pending',sourceKey:factory+':'+x.cell}))
  ]);
}
