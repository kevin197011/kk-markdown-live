import hljsLight from 'highlight.js/styles/github.min.css';
import hljsDark from 'highlight.js/styles/github-dark.min.css';

function scopeHljs(css: string, selector: string): string {
  return css.replace(/\.hljs\b/g, `${selector} .hljs`);
}

export const HLJS_CSS = `
${scopeHljs(hljsLight, 'html[data-theme="light"]')}
${scopeHljs(hljsDark, 'html[data-theme="dark"]')}
@media (prefers-color-scheme: light) {
${scopeHljs(hljsLight, 'html[data-theme="auto"]')}
}
@media (prefers-color-scheme: dark) {
${scopeHljs(hljsDark, 'html[data-theme="auto"]')}
}
`;
