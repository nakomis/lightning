/**
 * LaTeX -> SVG paths, at build time.
 *
 * fontCache:'none' emits explicit <path> data for every glyph rather than
 * referencing a font, so the result survives being dropped inside another SVG,
 * uploaded to S3, and rendered in a sandboxed iframe with no network at all.
 *
 * stdin:  [{id, tex}, ...]
 * stdout: {id: {inner, viewBox, vw, vh}}
 */
import { mathjax } from 'mathjax-full/js/mathjax.js';
import { TeX } from 'mathjax-full/js/input/tex.js';
import { SVG } from 'mathjax-full/js/output/svg.js';
import { liteAdaptor } from 'mathjax-full/js/adaptors/liteAdaptor.js';
import { RegisterHTMLHandler } from 'mathjax-full/js/handlers/html.js';
import { AllPackages } from 'mathjax-full/js/input/tex/AllPackages.js';

const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);
const doc = mathjax.document('', {
  InputJax: new TeX({ packages: AllPackages }),
  OutputJax: new SVG({ fontCache: 'none' }),
});

const raw = await new Promise((res) => {
  let s = '';
  process.stdin.on('data', (d) => (s += d));
  process.stdin.on('end', () => res(s));
});

const out = {};
for (const { id, tex } of JSON.parse(raw)) {
  const svg = adaptor.innerHTML(doc.convert(tex, { display: true }));
  const m = svg.match(/viewBox="([^"]+)"/);
  const [, , vw, vh] = m[1].split(/\s+/).map(Number);
  out[id] = {
    inner: svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, ''),
    viewBox: m[1], vw, vh,
  };
}
process.stdout.write(JSON.stringify(out));
