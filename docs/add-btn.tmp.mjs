import fs from 'node:fs';
const s = fs.readFileSync('web/src/app.js', 'utf8');
// Direct string replacement with actual characters
const marker = '>上班</button>';
const addOn = `>上班</button><button class="tg brush-uncertain"+(UI.leaveBrush==="uncertain"?" on":"")+" data-act=\\"cal-brush\\" data-v=\\"uncertain\\" aria-pressed=\\""+(UI.leaveBrush==="uncertain")+"\\">未確定</button>`;
// Actually this is inside a JS string concat context. The existing code uses ' single quotes.
// Let me look at the exact pattern more carefully.
// The existing code: >上班</button>'+'</div>
// I need: >上班</button>'+'<button ... >未確定</button>'+'</div>
const actual = s.includes(marker);
console.log('marker found:', actual, 'count:', s.split(marker).length - 1);
if (actual) {
  // Find the exact context around it
  const idx = s.indexOf(marker);
  console.log('context:', JSON.stringify(s.slice(idx - 20, idx + marker.length + 30)));
}
