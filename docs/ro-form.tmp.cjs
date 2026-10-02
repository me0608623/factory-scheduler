const fs = require('fs');
let s = fs.readFileSync('web/src/app.js', 'utf8');

// 1. openTableForm: allow read-only view
const old1 = 'if(!canPermission(perm)){toast("只有老闆／組長可以"+(id?"修改":"新增"));return;}';
const new1 = 'const ro=!canPermission(perm);';
if (s.includes(old1)) { s = s.replace(old1, new1); console.log('1. ro flag added'); }

// 2. tableFormModal: pass ro to modal state
s = s.replace(
  "openModal({t:\"tbl-form\",table,id:id||null,draft:row?structuredClone(row):null,saving:false});",
  "openModal({t:\"tbl-form\",table,id:id||null,draft:row?structuredClone(row):null,saving:false,ro});"
);
console.log('2. ro passed to modal');

// 3. tableFormModal foot: read-only shows 關閉 instead of 儲存/刪除
// Find the foot line in tableFormModal
const footMarker = "const foot='<button class=\"btn\" data-act=\"close\">取消</button>'";
if (s.includes(footMarker)) {
  s = s.replace(
    footMarker,
    "const foot=m.ro?'<button class=\"btn\" data-act=\"close\">關閉</button>':'<button class=\"btn\" data-act=\"close\">取消</button>'"
  );
  console.log('3. foot ro mode');
}

// 4. In tableFormModal body, disable inputs when ro
// The input rendering is: value="'+esc(val)+'"></div>'
// Change to: value="'+esc(val)+'"'+(m.ro?' disabled':'')+'></div>'
s = s.replace(
  /value="\+esc\(val\)\+"><\/div>/g,
  "value=\"'+esc(val)+'\"'+(m.ro?' disabled':'')+'></div>"
);
console.log('4. inputs disabled in ro mode');

// 5. Disable checkbox in ro
s = s.replace(
  /data-fk="\+key\+'"'\+\(val\?" checked":""\)\+'><span>/g,
  "data-fk=\"'+key+'\"'+(val?\" checked\":\"\")+(m.ro?' disabled':'')+'><span>'
);
console.log('5. checkbox disabled');

fs.writeFileSync('web/src/app.js', s);
console.log('read-only form complete');
