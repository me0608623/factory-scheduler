// 視覺升級模組（零新 npm 依賴）
// 背景：react-three-fiber／shader-gradient／liquid-glass-react／liquid-logo 四個專案
// 皆為 React 專屬（npm peerDeps 實查），本專案為 vanilla JS，故以原生等效技術實作：
//   1. 動態漸層＋互動點陣背景：raw WebGL 全螢幕 shader（shader-gradient 的 GLSL 本質）
//   2. 液態 Logo：SVG feTurbulence + feDisplacementMap 形變動畫（liquid-logo 的等效，無需 WebGL）
//   3. 液態玻璃表面：backdrop-filter blur/saturate + 邊緣高光（liquid-glass-react 的核心技巧，
//      其折射即 SVG 位移濾鏡；Safari/FireFox 部分支援的限制與原套件相同）
//   3D 互動：點陣透視格＋滑鼠視差/光暈在 shader 內完成；若日後需要真正的 3D 物件，
//   官方路徑是 three.js 本體（lazy import），見專案文件。
// 全部尊重 prefers-reduced-motion；無 WebGL 時退回 CSS 靜態漸層。

let stylesInjected = false;
export function ensureVisualStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  const st = document.createElement("style");
  st.textContent = `
/* —— 液態玻璃表面（liquid-glass 等效）—— */
.vg-glass{position:relative;background:color-mix(in srgb,var(--surface,#fff) 62%,transparent);
  backdrop-filter:blur(18px) saturate(1.5);-webkit-backdrop-filter:blur(18px) saturate(1.5);
  border:1px solid color-mix(in srgb,var(--line,#D4D9E0) 70%,transparent);
  box-shadow:0 8px 32px rgba(20,30,60,.18),inset 0 1px 0 rgba(255,255,255,.35)}
.vg-glass::before{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;
  background:linear-gradient(120deg,rgba(255,255,255,.28) 0%,transparent 28%,transparent 72%,rgba(255,255,255,.14) 100%)}
/* 無法使用 backdrop-filter 的環境退回不透明 */
@supports not ((backdrop-filter:blur(2px)) or (-webkit-backdrop-filter:blur(2px))){
  .vg-glass{background:var(--surface,#fff)}
}
/* —— 無 WebGL 時的靜態漸層（兼 reduced-motion）—— */
.vg-fallback{position:absolute;inset:0;
  background:radial-gradient(120% 90% at 20% 10%,#315FA7 0%,#233C7A 45%,#141B33 100%)}
/* —— 液態 Logo —— */
.vg-logo text{fill:currentColor}
/* —— 深色模式微調 —— */
:root:not([data-theme="light"]):not([data-app-theme="light"]) .vg-glass{
  background:color-mix(in srgb,#1A2233 62%,transparent);
  box-shadow:0 8px 32px rgba(0,0,0,.4),inset 0 1px 0 rgba(255,255,255,.08)}
`;
  document.head.appendChild(st);
}

// ?motion=full 可覆寫 reduced-motion（QA 驗證動態路徑用；一般使用者仍尊重系統設定）
const motionFull = () => { try { return new URLSearchParams(location.search).get("motion") === "full"; } catch (e) { return false; } };
const reducedMotion = () => !motionFull() && matchMedia("(prefers-reduced-motion: reduce)").matches;

// —— 液態 Logo（SVG 位移形變；reduced-motion 時靜態）——
export function liquidLogoSVG(text, { size = 34 } = {}) {
  const id = "vglogo" + Math.random().toString(36).slice(2, 7);
  const w = Math.max(6, text.length) * size * 0.62 + size;
  const anim = reducedMotion() ? "" :
    `<animate attributeName="baseFrequency" dur="9s" values="0.012 0.02;0.02 0.012;0.012 0.02" repeatCount="indefinite"/>`;
  return `<svg class="vg-logo" width="${Math.round(w)}" height="${Math.round(size * 1.8)}" viewBox="0 0 ${Math.round(w)} ${Math.round(size * 1.8)}" role="img" aria-label="${text}">
  <defs><filter id="${id}" x="-20%" y="-40%" width="140%" height="180%">
    <feTurbulence type="fractalNoise" baseFrequency="0.012 0.02" numOctaves="2" seed="7" result="n">${anim}</feTurbulence>
    <feDisplacementMap in="SourceGraphic" in2="n" scale="10" xChannelSelector="R" yChannelSelector="G"/>
  </filter></defs>
  <text x="${Math.round(w / 2)}" y="${Math.round(size * 1.16)}" text-anchor="middle"
    font-size="${size}" font-weight="900" filter="url(#${id})"
    font-family="\"Microsoft JhengHei UI\",\"PingFang TC\",sans-serif">${text}</text></svg>`;
}

// —— 動態漸層＋互動點陣背景（raw WebGL；shader-gradient 的等效）——
const VERT = `attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}`;
const FRAG = `precision mediump float;uniform vec2 u_res;uniform float u_t;uniform vec2 u_m;
float hash(vec2 v){return fract(sin(dot(v,vec2(127.1,311.7)))*43758.5453);}
void main(){
  vec2 uv=gl_FragCoord.xy/u_res; vec2 st=uv; st.x*=u_res.x/u_res.y;
  // 三色動態漸層（呼應品牌藍／靛）
  float t=u_t*.06;
  vec3 c1=vec3(.192,.373,.655),c2=vec3(.306,.369,.816),c3=vec3(.078,.106,.200);
  float m1=.5+.5*sin(st.x*1.4+t+uv.y*2.1), m2=.5+.5*sin(st.y*1.7-t*1.3+uv.x*1.2);
  vec3 col=mix(c3,mix(c1,c2,m1),smoothstep(.15,.95,m2*.7+uv.y*.3));
  // 透視點陣格（3D 深度感）
  vec2 gp=vec2(st.x*22.,(uv.y*14.));
  float persp=1.-uv.y*.55; gp.y+=u_t*.35*persp;
  vec2 cell=fract(gp)-.5; float dot_=smoothstep(.13*persp+.02,0.,length(cell));
  float fade=smoothstep(1.,.35,uv.y);
  col+=vec3(.55,.72,1.)*dot_*fade*.20;
  // 滑鼠光暈
  vec2 mp=u_m; mp.x*=u_res.x/u_res.y;
  float glow=exp(-3.5*length(st-mp));
  col+=vec3(.35,.5,.9)*glow*.28;
  // 輕噪點抑制色帶
  col+=(hash(gl_FragCoord.xy+u_t)-.5)/255.;
  gl_FragColor=vec4(col,1.);
}`;

export function mountBackdrop(container, { interactive = true, className = "" } = {}) {
  ensureVisualStyles();
  const reduced = reducedMotion();
  container.classList.add("vg-backdrop");
  if (className) container.classList.add(...className.split(/\s+/).filter(Boolean));
  if (!container.style.position) container.style.position = "relative";
  container.style.overflow = "hidden";
  // 背景層以第一層插入，不清空既有內容（內容設 z-index 即可疊在上層）
  const fallback = document.createElement("div");
  fallback.className = "vg-fallback";
  container.insertBefore(fallback, container.firstChild);

  let gl = null;
  try { const cv = document.createElement("canvas"); gl = cv.getContext("webgl", { antialias: false }); } catch (e) { gl = null; }
  if (!gl || reduced) return { stop() { container.remove?.(); }, mode: reduced ? "reduced-motion" : "css" };

  const cv = gl.canvas;
  cv.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block";
  container.insertBefore(cv, container.firstChild);
  fallback.remove(); // 有 WebGL 時移除靜態漸層
  const ctx = gl;
  const sh = (type, src) => { const s = ctx.createShader(type); ctx.shaderSource(s, src); ctx.compileShader(s); return ctx.getShaderParameter(s, ctx.COMPILE_STATUS) ? s : null; };
  const vs = sh(ctx.VERTEX_SHADER, VERT), fs = sh(ctx.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) { cv.remove(); container.insertBefore(fallback, container.firstChild); return { stop() {}, mode: "css" }; }
  const prog = ctx.createProgram();
  ctx.attachShader(prog, vs); ctx.attachShader(prog, fs); ctx.linkProgram(prog); ctx.useProgram(prog);
  const buf = ctx.createBuffer();
  ctx.bindBuffer(ctx.ARRAY_BUFFER, buf);
  ctx.bufferData(ctx.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), ctx.STATIC_DRAW);
  const loc = ctx.getAttribLocation(prog, "p");
  ctx.enableVertexAttribArray(loc);
  ctx.vertexAttribPointer(loc, 2, ctx.FLOAT, false, 0, 0);
  const uRes = ctx.getUniformLocation(prog, "u_res"), uT = ctx.getUniformLocation(prog, "u_t"), uM = ctx.getUniformLocation(prog, "u_m");
  let raf = 0, mx = 0.5, my = 0.4, tx = 0.5, ty = 0.4;
  const resize = () => {
    const dpr = Math.min(devicePixelRatio || 1, 1.5);
    const w = Math.max(1, Math.round(container.clientWidth * dpr)), h = Math.max(1, Math.round(container.clientHeight * dpr));
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; ctx.viewport(0, 0, w, h); }
  };
  const onMove = (e) => {
    const r = container.getBoundingClientRect();
    tx = (e.clientX - r.left) / Math.max(1, r.width);
    ty = 1 - (e.clientY - r.top) / Math.max(1, r.height);
  };
  if (interactive) window.addEventListener("pointermove", onMove, { passive: true });
  const t0 = performance.now();
  const frame = () => {
    resize();
    mx += (tx - mx) * 0.06; my += (ty - my) * 0.06;
    ctx.uniform2f(uRes, cv.width, cv.height);
    ctx.uniform1f(uT, (performance.now() - t0) / 1000);
    ctx.uniform2f(uM, mx, my);
    ctx.drawArrays(ctx.TRIANGLES, 0, 3);
    raf = requestAnimationFrame(frame);
  };
  frame();
  return {
    mode: "webgl",
    stop() { cancelAnimationFrame(raf); window.removeEventListener("pointermove", onMove); cv.remove(); },
  };
}
