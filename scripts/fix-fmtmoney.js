const fs = require('fs');
const path = require('path');
const appPath = path.join(__dirname, '..', 'src', 'App.js');
let s = fs.readFileSync(appPath, 'utf8');
s = s.replace(/fmtMoney\(([\s\S]*?)\.toLocaleString\([^)]*\)\)/g, 'fmtMoney($1)');
s = s.replace(
  '<option value="المخزون">Inventory</option>',
  '<option value="Inventory">المخزون</option>'
);
s = s.replace('<option value="أخرى">Other</option>', '<option value="Other">أخرى</option>');
fs.writeFileSync(appPath, s);
console.log('fixed');
