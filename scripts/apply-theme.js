const fs = require('fs');
const path = require('path');

const appPath = path.join(__dirname, '..', 'src', 'App.js');
let s = fs.readFileSync(appPath, 'utf8');

if (!s.includes('theme }')) {
  s = s.replace(
    "import { APP_NAME, APP_TAGLINE, APP_LOGO, FONT_UI, FONT_HEADING } from './branding';",
    "import { APP_NAME, APP_TAGLINE, APP_LOGO, FONT_UI, FONT_HEADING, theme } from './branding';"
  );
}

const classReplacements = [
  ['bg-[#15361e]', 'bg-primary'],
  ['bg-[#e79161]', 'bg-accent'],
  ['bg-[#fff8df]', 'bg-parchment-warm'],
  ['text-[#15361e]', 'text-primary'],
  ['text-[#e79161]', 'text-accent'],
  ['border-[#15361e]', 'border-primary'],
  ['ring-[#15361e]', 'ring-primary'],
  ['focus:ring-[#15361e]', 'focus:ring-accent'],
  ['hover:border-[#e79161]', 'hover:border-accent'],
  ['hover:text-[#e79161]', 'hover:text-accent'],
  ['group-hover:text-[#e79161]', 'group-hover:text-accent'],
  ['hover:bg-[#e79161]', 'hover:bg-accent'],
  ['border-[#e79161]', 'border-accent'],
  ['text-[#666]', 'text-layali-muted'],
  ['bg-[#f3f4f6]', 'bg-layali-surface-muted'],
  ['bg-[#10b981]', 'bg-layali-success'],
  ['border-[#15361e] border-opacity-5', 'border-primary/10'],
];

for (const [a, b] of classReplacements) {
  s = s.split(a).join(b);
}
const styleReplacements = [
  ["backgroundColor: '#15361e'", 'backgroundColor: theme.primary'],
  ["backgroundColor: '#e79161'", 'backgroundColor: theme.accent'],
  ["borderColor: '#15361e'", 'borderColor: theme.primary'],
  ["color: '#15361e'", 'color: theme.text'],
  ["color: '#666'", 'color: theme.textMuted'],
  ["color: '#999'", "color: 'var(--color-text-muted)'"],
  ["borderColor: '#15361e'", 'borderColor: theme.primary'],
  ["style={{ backgroundColor: '#fff8df' }}", "style={{ backgroundColor: theme.bgWarm }}"],
  ["style={{ backgroundColor: '#f5f0e8' }}", "style={{ backgroundColor: theme.bgWarm }}"],
];

for (const [a, b] of styleReplacements) {
  s = s.split(a).join(b);
}

// Sidebar + main shell
s = s.replace(
  /bg-\[#15361e\]/g,
  'bg-sidebar'
);
s = s.replace(
  /fixed top-0 right-0 h-full text-white flex flex-col border-l border-gray-800/g,
  'fixed top-0 right-0 h-full text-white flex flex-col border-l border-sidebar-border bg-sidebar'
);

// Main app background
s = s.replace(
  "bg-gray-100 text-[#15361e]",
  'bg-parchment-app text-primary'
);

// Demo strip
s = s.replace(
  "style={{ backgroundColor: theme.accent, fontFamily: FONT_UI }}",
  "className=\"bg-accent text-[var(--color-text-inverse)]\" style={{ fontFamily: FONT_UI }}"
);


fs.writeFileSync(appPath, s);
console.log('Theme applied to App.js');
