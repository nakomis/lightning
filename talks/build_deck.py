"""Compose the Embeddings deck from the six built scenes."""
import re

SCENES_REF = None  # set by the caller so tile classes can be namespaced

DECK_HEAD = '''<!doctype html>
<meta charset="utf-8">
<title>Embeddings</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,600;12..96,800&family=Public+Sans:ital,wght@0,400;0,500;0,700;1,400&family=IBM+Plex+Mono:wght@400;500;600&display=swap">
<style>
%(tokens)s

  * { box-sizing:border-box; }
  html, body { height:100%%; margin:0; }
  body {
    background:var(--ground); color:var(--ink); font-family:var(--f-body);
    overflow:hidden;
  }

  .slide {
    position:absolute; inset:0 0 calc(var(--u)*4.6) 0;
    display:none; flex-direction:column; align-items:center; justify-content:center;
    gap:calc(var(--u)*1.2); padding:calc(var(--u)*4) calc(var(--u)*5) calc(var(--u)*2);
    text-align:center;
  }
  .slide.on { display:flex; }
  .eyebrow { font-family:var(--f-mono); font-size:calc(var(--u)*1.15); letter-spacing:.08em;
             text-transform:uppercase; color:var(--signal); }
  h1 { font-family:var(--f-display); font-size:calc(var(--u)*5.4); margin:0;
       font-weight:800; letter-spacing:-.025em; text-wrap:balance; }
  h2 { font-family:var(--f-display); font-size:calc(var(--u)*3.1); margin:0;
       font-weight:700; letter-spacing:-.02em; text-wrap:balance; }
  .sub { margin:0; color:var(--muted); font-size:calc(var(--u)*1.5); max-width:64ch; }
  .stage { width:100%%; max-width:1040px; flex:1; display:flex; align-items:center; }
  .stage svg { width:100%%; height:auto; max-height:100%%; display:block; }
  .lead { font-size:calc(var(--u)*1.8); max-width:56ch; line-height:1.5; }
  .lead em { color:var(--signal); font-style:normal; font-weight:600; }
  code { font-family:var(--f-mono); font-size:.92em; background:var(--sunk);
         padding:.15em .4em; border-radius:3px; }

  /* ---- navigator ---- */
  .nav {
    position:fixed; left:0; right:0; bottom:0; height:calc(var(--u)*4.6);
    display:flex; align-items:center; gap:calc(var(--u)*.6);
    padding:0 calc(var(--u)*2.4);
    border-top:1px solid var(--line); background:var(--ground);
    font-family:var(--f-mono); font-size:calc(var(--u)*1.15); color:var(--muted);
  }
  .nav button {
    font-family:var(--f-mono); font-size:calc(var(--u)*1.2);
    background:transparent; color:var(--muted);
    border:1px solid var(--line); border-radius:4px;
    padding:calc(var(--u)*.3) calc(var(--u)*.85); cursor:pointer; line-height:1.5;
  }
  .nav button:hover:not(:disabled) { color:var(--ink); border-color:var(--muted); }
  .nav button:disabled { opacity:.35; cursor:default; }
  .nav button:focus-visible { outline:2px solid var(--signal); outline-offset:2px; }
  .count { font-variant-numeric:tabular-nums; min-width:5.5em; text-align:center; }
  .track { flex:1; height:2px; background:var(--line); position:relative; }
  .fill  { position:absolute; inset:0 auto 0 0; background:var(--signal); width:0;
           transition:width .28s ease; }
  .speed { display:flex; align-items:center; gap:calc(var(--u)*.5); }
  .speed input[type=range] { width:120px; accent-color:var(--signal); }
  .speed output { font-variant-numeric:tabular-nums; min-width:3.4em; }
  @media (prefers-reduced-motion: reduce) { .fill { transition:none; } }

  /* ---- scene styles, shared by all six ---- */
%(scene_css)s

  .anim { opacity:0; transform-box:fill-box; transform-origin:center; }
  .run .anim { animation-timing-function:cubic-bezier(.22,.61,.36,1); }
%(keyframes)s

%(timelines)s

  @media (prefers-reduced-motion: reduce) {
    .anim { opacity:1 !important; }
    .run .anim { animation:none !important; }
  }
</style>
'''

DECK_JS = '''
<script>
%(tiles)s
  const slides = [...document.querySelectorAll('.slide')];
  const N = slides.length;
  const elCount = document.getElementById('count');
  const elFill  = document.getElementById('fill');
  const bFirst = document.getElementById('first'), bPrev = document.getElementById('prev');
  const bNext  = document.getElementById('next'),  bLast = document.getElementById('last');
  const rateEl = document.getElementById('rate'), rateOut = document.getElementById('rateout');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  let i = 0;
  let rate = %(rate)s;
  try { const v = localStorage.getItem('anim-rate'); if (v) rate = +v; } catch (e) {}
  rateEl.value = rate;

  function applyRate (r) {
    rate = r;
    rateOut.textContent = r.toFixed(2) + 'x';
    // Every animation in the document, so a scene that is mid-flight also obeys.
    for (const a of document.getAnimations()) a.playbackRate = r;
    try { localStorage.setItem('anim-rate', String(r)); } catch (e) {}
  }
  rateEl.addEventListener('input', () => applyRate(+rateEl.value));

  function show (n) {
    i = Math.max(0, Math.min(N - 1, n));
    slides.forEach((s, k) => s.classList.toggle('on', k === i));
    elCount.textContent = (i + 1) + ' / ' + N;
    elFill.style.width = (N > 1 ? (i / (N - 1)) * 100 : 100) + '%%';
    bFirst.disabled = bPrev.disabled = (i === 0);
    bLast.disabled  = bNext.disabled = (i === N - 1);

    // Restart this slide's animation from the top, at the current rate.
    const fig = slides[i].querySelector('svg.fig');
    if (fig && !reduced) {
      fig.classList.remove('run');
      void fig.getBoundingClientRect();
      fig.classList.add('run');
      applyRate(rate);
    } else if (fig) {
      fig.classList.add('run');
    }
  }

  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    switch (e.key) {
      case 'ArrowRight': case 'PageDown': case ' ': show(i + 1); e.preventDefault(); break;
      case 'ArrowLeft':  case 'PageUp':          show(i - 1); e.preventDefault(); break;
      case 'Home': show(0); e.preventDefault(); break;
      case 'End':  show(N - 1); e.preventDefault(); break;
      case 'r': case 'R': show(i); break;
      case 'f': case 'F':
        if (document.fullscreenElement) document.exitFullscreen();
        else document.documentElement.requestFullscreen();
        break;
    }
  });
  bFirst.addEventListener('click', () => show(0));
  bPrev .addEventListener('click', () => show(i - 1));
  bNext .addEventListener('click', () => show(i + 1));
  bLast .addEventListener('click', () => show(N - 1));
  document.getElementById('replay').addEventListener('click', () => show(i));
  document.getElementById('theme').addEventListener('click', () => {
    const g = getComputedStyle(document.documentElement).getPropertyValue('--ground').trim().toLowerCase();
    document.documentElement.setAttribute('data-theme', g === '#12141a' ? 'light' : 'dark');
  });

  show(0);
</script>
'''

NAV = '''
<div class="nav">
  <button id="first" title="First slide (Home)" aria-label="First slide">&#8676;</button>
  <button id="prev"  title="Previous (&larr;)"  aria-label="Previous slide">&larr;</button>
  <span class="count" id="count">1 / 1</span>
  <button id="next"  title="Next (&rarr;)"      aria-label="Next slide">&rarr;</button>
  <button id="last"  title="Last slide (End)"   aria-label="Last slide">&#8677;</button>
  <span class="track"><span class="fill" id="fill"></span></span>
  <span class="speed">
    <label for="rate">speed</label>
    <input id="rate" type="range" min="0.10" max="1.50" step="0.01" value="%(rate)s">
    <output id="rateout">%(rate)sx</output>
  </span>
  <button id="replay" title="Replay this scene (R)">&#8635;</button>
  <button id="theme"  title="Light / dark">&#9680;</button>
</div>
'''


def _tokens(head):
    """The :root / dark-mode custom-property blocks and the diagram classes."""
    m = re.search(r'(  :root \{.*?)\n  \* \{', head, re.S)
    return m.group(1) if m else head


def _scene_classes(head):
    """Presentational classes (.box, .l, .eq …) minus page chrome and tokens."""
    body = head.split('* { box-sizing')[-1]
    keep = []
    # NB \s+ not ' ': the source aligns selectors with runs of spaces, and a
    # single-space pattern silently matches nothing at all.
    for rule in re.finditer(r'^  (\.[\w.\-]+(?:\s*,\s*\.[\w.\-]+)*)\s*\{([^}]*)\}', body, re.M):
        sel = rule.group(1)
        # .eyebrow is page chrome and the deck defines its own; the rest are layout.
        if sel.split('.')[1].split(' ')[0] in ('anim', 'run', 'controls', 'speed', 'stage', 'sub', 'eyebrow'):
            continue
        keep.append(f'  {sel} {{{rule.group(2)}}}')
    return '\n'.join(keep)


SLIDES = [
    ('title', 'Embeddings', 'A short tour of the one idea that makes semantic search work.', None),
    ('scene', None, None, 1),
    ('scene', None, None, 2),
    ('scene', None, None, 3),
    ('scene', None, None, 4),
    ('scene', None, None, 5),
    ('lead', 'So far: distance', 'Two messages are similar when their points are close. '
     'That is the whole of recall — and it is Pythagoras, 1024 terms deep.', None),
    ('scene', None, None, 6),
    ('scene', None, None, 7),
    ('scene', None, None, 8),
    ('lead', 'What this buys you', 'Meaning becomes geometry. Similarity becomes distance. '
     'Search becomes <code>ORDER BY</code>. Nothing in the model was ever told what a '
     'queen is, or what a cat is — only where things sit relative to each other.', None),
]


def build_deck(scenes, here, rate, scenes_ref=()):
    global SCENES_REF
    SCENES_REF = scenes_ref
    by_n = {s['n']: s for s in scenes}
    head = scenes[0]['head']

    scene_css = _scene_classes(head)
    # both sources share the same class vocabulary; merge and de-duplicate
    seen, merged = set(), []
    for s in scenes:
        for line in _scene_classes(s['head']).split('\n'):
            if line and line not in seen:
                seen.add(line); merged.append(line)
    scene_css = '\n'.join(merged)

    timelines = []
    for s in scenes:
        timelines.append(f'  /* --- scene {s["n"]}: {s["title"]} --- */\n{s["rules"]}')

    # Every @keyframes any scene names, de-duplicated by name.
    frames = {}
    for s_ in scenes:
        # Balance the nesting explicitly: `[^}]*` swallows the inner `{`, so a
        # naive pattern stops one brace early and truncates every block.
        for m in re.finditer(r'  @keyframes (\w+)\s*\{(?:[^{}]|\{[^{}]*\})*\}',
                             (here / s_['src']).read_text()):
            frames.setdefault(m.group(1), m.group(0))
    used = set(re.findall(r'animation:(\w+)', '\n'.join(timelines)))
    missing = used - set(frames)
    if missing:
        raise SystemExit(f'keyframes referenced but not found: {sorted(missing)}')

    out = [DECK_HEAD % dict(tokens=_tokens(head), scene_css=scene_css,
                            keyframes='\n'.join(frames[k] for k in sorted(frames)),
                            timelines='\n\n'.join(timelines))]

    for kind, title, body, n in SLIDES:
        if kind == 'title':
            out.append(f'<section class="slide">\n  <div class="eyebrow">Nakomis</div>\n'
                       f'  <h1>{title}</h1>\n  <p class="sub">{body}</p>\n</section>\n')
        elif kind == 'lead':
            out.append(f'<section class="slide">\n  <div class="eyebrow">{title}</div>\n'
                       f'  <p class="lead">{body}</p>\n</section>\n')
        else:
            s = by_n[n]
            out.append(
                f'<section class="slide">\n'
                f'  <div class="eyebrow">{s["eyebrow"]}</div>\n'
                f'  <h2>{s["title"]}</h2>\n'
                f'  <p class="sub">{s["blurb"]}</p>\n'
                f'  <div class="stage">\n'
                f'  <svg class="fig" viewBox="{s["viewbox"]}" role="img" aria-label="{s["aria"]}">\n'
                f'{s["markup"]}\n  </svg>\n  </div>\n</section>\n')

    out.append(NAV % dict(rate=rate))
    tiles = ''
    for s in scenes:
        if s['tiles']:
            src = (here / s['src']).read_text()
            m = re.search(r'  \(function buildTiles.*?\}\)\(\);\n', src, re.S)
            if m:
                # Same namespacing the markup got, or the JS-set class will not
                # match the rule and every tile stays at opacity 0.
                act = next(a for f, a, *_ in SCENES_REF if f == s['src'] and a == 3)
                tiles = m.group(0).replace(f'a{act}-', f's{s["n"]}-')
    out.append(DECK_JS % dict(tiles=tiles, rate=rate))

    p = here / 'embeddings.html'
    p.write_text(''.join(out))
    print(f'\nDeck: {p.relative_to(here.parent)}  ({p.stat().st_size // 1024} KB, '
          f'{len(SLIDES)} slides)')
    return p
