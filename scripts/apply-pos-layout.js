const fs = require('fs');
const path = require('path');

const appPath = path.join(__dirname, '..', 'src', 'App.js');
const snippet = fs.readFileSync(path.join(__dirname, 'pos-layout-snippet.jsx'), 'utf8').trimEnd() + '\n';
let s = fs.readFileSync(appPath, 'utf8');

const startMark = '          <div className="max-w-[1600px] mx-auto h-full">\n';
const endMark = '\n          {/* Mobile Cart Toggle Bar */}';
const start = s.indexOf(startMark);
const end = s.indexOf(endMark, start);
if (start < 0 || end < 0) throw new Error('POS layout markers not found');

const afterStart = start + startMark.length;
// Keep max-w wrapper, replace its inner content until mobile bar
const next = s.slice(0, afterStart) + snippet + s.slice(end);
fs.writeFileSync(appPath, next);
console.log('POS layout replaced, bytes', next.length);
