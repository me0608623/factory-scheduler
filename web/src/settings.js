export const SETTINGS_KEY='fsched-preferences-v1';

export const DEFAULT_PREFERENCES=Object.freeze({
  theme:'auto',accent:'blue',scale:1,font:'standard',density:'comfortable',motion:'system',language:'zh-TW',
  notifications:Object.freeze({schedule:true,leave:true,memo:true,sound:false,desktop:false})
});

const allowed={
  theme:new Set(['auto','light','dark']),accent:new Set(['blue','green','purple','orange']),
  scale:new Set([.6,.7,.75,.8,.85,.9,1,1.1,1.15,1.25,1.3,1.4]),font:new Set(['standard','clear']),
  density:new Set(['comfortable','compact']),motion:new Set(['system','reduce']),language:new Set(['zh-TW','en'])
};

export function normalizePreferences(raw={}){
  const n=raw?.notifications||{},d=DEFAULT_PREFERENCES;
  return {
    theme:allowed.theme.has(raw.theme)?raw.theme:d.theme,
    accent:allowed.accent.has(raw.accent)?raw.accent:d.accent,
    scale:allowed.scale.has(Number(raw.scale))?Number(raw.scale):d.scale,
    font:allowed.font.has(raw.font)?raw.font:d.font,
    density:allowed.density.has(raw.density)?raw.density:d.density,
    motion:allowed.motion.has(raw.motion)?raw.motion:d.motion,
    language:allowed.language.has(raw.language)?raw.language:d.language,
    notifications:{schedule:n.schedule!==false,leave:n.leave!==false,memo:n.memo!==false,sound:!!n.sound,desktop:!!n.desktop}
  };
}

export function loadPreferences(storage=globalThis.localStorage){
  let raw={};
  try{raw=JSON.parse(storage.getItem(SETTINGS_KEY)||'{}')||{};}catch{}
  // Preserve settings used by versions before the consolidated settings page.
  try{
    if(raw.theme==null){const t=storage.getItem('fsched-theme');if(t)raw.theme=t;}
    if(raw.scale==null){const z=Number(storage.getItem('fsched-zoom'));if(z)raw.scale=z<=.9?.85:z>=1.25?1.3:z>=1.1?1.15:1;}
  }catch{}
  return normalizePreferences(raw);
}

export function savePreferences(prefs,storage=globalThis.localStorage){
  const clean=normalizePreferences(prefs);storage.setItem(SETTINGS_KEY,JSON.stringify(clean));return clean;
}

export function patchPreference(prefs,path,value){
  const next=structuredClone(normalizePreferences(prefs)),parts=path.split('.');
  let target=next;for(const part of parts.slice(0,-1))target=target[part];target[parts.at(-1)]=value;
  return normalizePreferences(next);
}

export function notificationEnabled(prefs,source){
  const p=normalizePreferences(prefs).notifications;
  if(source==='leave_requests'||source==='leaves')return p.leave;
  if(source==='schedule_memos')return p.memo;
  return p.schedule;
}

export function applyPreferences(prefs,root=document.documentElement){
  const p=normalizePreferences(prefs);
  if(p.theme==='auto')root.removeAttribute('data-app-theme');else root.setAttribute('data-app-theme',p.theme);
  root.setAttribute('data-accent',p.accent);root.setAttribute('data-font',p.font);
  root.setAttribute('data-density',p.density);root.setAttribute('data-motion',p.motion);root.lang=p.language;
  root.style.setProperty('--z',p.scale);return p;
}
