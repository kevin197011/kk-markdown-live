import hljs from 'highlight.js/lib/core';
import bash from 'highlight.js/lib/languages/bash';
import css from 'highlight.js/lib/languages/css';
import go from 'highlight.js/lib/languages/go';
import java from 'highlight.js/lib/languages/java';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import markdown from 'highlight.js/lib/languages/markdown';
import python from 'highlight.js/lib/languages/python';
import rust from 'highlight.js/lib/languages/rust';
import shell from 'highlight.js/lib/languages/shell';
import sql from 'highlight.js/lib/languages/sql';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import yaml from 'highlight.js/lib/languages/yaml';

const LANGUAGES = [
  ['bash', bash],
  ['sh', shell],
  ['shell', shell],
  ['css', css],
  ['go', go],
  ['java', java],
  ['javascript', javascript],
  ['js', javascript],
  ['json', json],
  ['markdown', markdown],
  ['md', markdown],
  ['python', python],
  ['py', python],
  ['rust', rust],
  ['rs', rust],
  ['sql', sql],
  ['typescript', typescript],
  ['ts', typescript],
  ['html', xml],
  ['xml', xml],
  ['yaml', yaml],
  ['yml', yaml],
];

for (const [name, fn] of LANGUAGES as Array<[string, typeof bash]>) {
  if (!hljs.getLanguage(name)) {
    hljs.registerLanguage(name, fn);
  }
}

export function highlightCode(code: string, lang: string | undefined): { html: string; language: string } {
  const normalized = (lang || '').trim().toLowerCase();
  if (normalized && hljs.getLanguage(normalized)) {
    const result = hljs.highlight(code, { language: normalized });
    return { html: result.value, language: normalized };
  }
  const auto = hljs.highlightAuto(code);
  return { html: auto.value, language: auto.language || 'plaintext' };
}
