import hljsLight from 'highlight.js/styles/github.min.css';
import hljsDark from 'highlight.js/styles/github-dark.min.css';

export const HLJS_CSS = `
@media (prefers-color-scheme: light) {
${hljsLight}
}
@media (prefers-color-scheme: dark) {
${hljsDark}
}
`;
