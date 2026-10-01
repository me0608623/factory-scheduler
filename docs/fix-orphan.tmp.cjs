const fs = require('fs');
const lines = fs.readFileSync('web/src/app.js', 'utf8').split('\n');

// Find and remove orphaned lines after the new one-line cases
// rush-addrow orphan: lines after `case "rush-addrow":{openTableForm("rush");break;}`
// until the next `case` statement
function cleanOrphan(startMarker, lines) {
  const idx = lines.findIndex(l => l.includes(startMarker));
  if (idx === -1) return lines;
  let end = idx + 1;
  while (end < lines.length && !lines[end].trim().startsWith('case ') && !lines[end].trim().startsWith('}')) {
    end++;
  }
  // Remove lines between idx+1 and end-1
  if (end > idx + 1) {
    lines.splice(idx + 1, end - idx - 1);
    console.log(`Cleaned ${end - idx - 1} orphaned lines after ${startMarker}`);
  }
  return lines;
}

lines = cleanOrphan('case "rush-addrow":{openTableForm', lines);
lines = cleanOrphan('case "tf-addrow":{openTableForm', lines);
lines = cleanOrphan('case "wl-addrow":{openTableForm', lines);

fs.writeFileSync('web/src/app.js', lines.join('\n'));
console.log('orphaned code cleaned');
