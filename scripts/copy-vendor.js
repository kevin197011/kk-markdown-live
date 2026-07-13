const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const media = path.join(root, 'media');
fs.mkdirSync(media, { recursive: true });

const mermaidSrc = path.join(root, 'node_modules', 'mermaid', 'dist', 'mermaid.min.js');
if (!fs.existsSync(mermaidSrc)) {
  console.error('missing mermaid.min.js — run npm install first');
  process.exit(1);
}
fs.copyFileSync(mermaidSrc, path.join(media, 'mermaid.min.js'));
console.log('copied media/mermaid.min.js');
