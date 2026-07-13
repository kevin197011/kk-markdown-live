const esbuild = require('esbuild');

const watch = process.argv.includes('--watch');

const ctx = esbuild.context({
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'out/extension.js',
  external: ['vscode'],
  platform: 'node',
  format: 'cjs',
  target: 'node18',
  sourcemap: true,
  minify: false,
  loader: { '.css': 'text' },
});

if (watch) {
  ctx.then((c) => c.watch()).then(() => {
    console.log('watching...');
  });
} else {
  ctx.then(async (c) => {
    await c.rebuild();
    c.dispose();
    console.log('built out/extension.js');
  });
}
