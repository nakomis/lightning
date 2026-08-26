#!/usr/bin/env python3
"""
Split the two composite animations into six standalone scenes, and compose the
"Embeddings" deck from those same six.

vector-distance.html and card-analogy.html stay the single source of truth. This
extracts each act's markup and its slice of the timeline, rebases the delays so
the act starts at t=0, and namespaces the class names so all six can share one
document without colliding.

    python3 lightning/build-animations.py
"""
import pathlib, re

HERE = pathlib.Path(__file__).parent
OUT = HERE / 'animations'
DEFAULT_RATE = 0.33          # the user's preferred pace; the slider overrides it

SCENES = [
    ('naive-search.html',    1, 'letters-or-meaning',      'The problem',
     'Letters, or meaning',
     'Keyword search answers the wrong question — and disagrees with you every time.'),
    ('human-rating.html',    1, 'if-you-asked-a-human',    'Where the numbers come from',
     'If you asked a human',
     'Score it out of ten on named attributes. Now do that 1024 times, with no names.'),
    ('vector-distance.html', 1, 'text-to-vector',          'What gets stored',
     'From text to a vector',
     'Every message becomes one point in a 1024-dimensional space.'),
    ('why-distance.html',    1, 'similarity-is-distance',  'Why any of this matters',
     'Similarity becomes distance',
     'Two points and the origin make a triangle. Similarity is now an angle.'),
    ('vector-distance.html', 2, 'hypotenuse-becomes-leg',  'Why it generalises',
     'The hypotenuse becomes a leg',
     'Stand a new plane on it and the old distance is just another side.'),
    ('vector-distance.html', 3, 'unrolled-1024-times',     'Distance, in the end',
     'Unrolled 1024 times',
     'The recursion collapses into a single sum — and into one SQL operator.'),
    ('card-analogy.html',    1, 'a-card-is-a-point',       'What the vectors encode',
     'A card is a point',
     'Not a picture of a card. A position, where direction carries meaning.'),
    ('card-analogy.html',    2, 'arithmetic-on-positions', 'Doing sums on meaning',
     'Arithmetic on positions',
     'Subtract male, add female, component by component, all 1024 of them.'),
    ('card-analogy.html',    3, 'gender-is-a-direction',   'The payoff',
     'Gender is a direction',
     'The same displacement, wherever you start. Nobody taught it that.'),
]


# ---------------------------------------------------------------- LaTeX -----
TOOLS = HERE / 'tools'


def render_tex(markup):
    """Replace <g data-tex="..."> placeholders with MathJax-rendered SVG paths.

    Done at build time, with fontCache:'none', so the deck carries no font, no
    runtime library and no network dependency — it has to survive being served
    from S3 into a sandboxed iframe.
    """
    jobs = list(re.finditer(
        r'<g class="([^"]*)"\s+data-tex="([^"]*)"\s+data-x="([\d.]+)"\s+'
        r'data-y="([\d.]+)"\s+data-em="([\d.]+)"(?:\s+data-fill="([^"]*)")?\s*></g>',
        markup))
    if not jobs:
        return markup

    import html as _html, json, subprocess
    payload = [{'id': str(i), 'tex': _html.unescape(m.group(2))} for i, m in enumerate(jobs)]
    proc = subprocess.run(['node', str(TOOLS / 'tex2svg.mjs')], input=json.dumps(payload),
                          capture_output=True, text=True, cwd=TOOLS)
    if proc.returncode != 0:
        raise SystemExit(f'tex2svg failed:\n{proc.stderr[-1500:]}')
    rendered = json.loads(proc.stdout)

    out, last = [], 0
    for i, m in enumerate(jobs):
        r = rendered[str(i)]
        cls, x, y, em = m.group(1), float(m.group(3)), float(m.group(4)), float(m.group(5))
        fill = m.group(6) or 'var(--ink)'
        scale = em / 1000.0            # MathJax works in 1000ths of an em
        out.append(markup[last:m.start()])
        # Two nested groups on purpose. The animated class goes on the outer
        # one; the placement transform goes on the inner. A CSS `transform` from
        # a keyframe overrides the SVG transform *attribute* outright, so
        # putting both on one element silently discards the scale and renders
        # the glyphs at 1:1 over the whole slide.
        out.append(
            f'<g class="{cls}">'
            f'<g transform="translate({x} {y}) scale({scale:.5f})" '
            f'fill="{fill}" stroke="none" aria-hidden="true">{r["inner"]}</g></g>')
        last = m.end()
    out.append(markup[last:])
    return ''.join(out)

ACT_RE = r'/\*[^\n]*ACT %d[^\n]*\*/'
read = lambda n: (HERE / n).read_text()


def css_parts(src):
    style = re.search(r'<style>(.*?)</style>', src, re.S).group(1)
    head = style[:re.search(ACT_RE % 1, style).start()]
    rm = re.search(r'  @media \(prefers-reduced-motion.*?\n  \}\n', style, re.S)
    return head, (rm.group(0) if rm else '')


def act_rules(src, act):
    """One act's timeline, with every delay rebased so the act starts at zero."""
    style = re.search(r'<style>(.*?)</style>', src, re.S).group(1)
    start = re.search(ACT_RE % act, style)
    nxt = re.search(ACT_RE % (act + 1), style)
    stop = nxt.start() if nxt else style.index('  @media (prefers-reduced-motion')
    block = style[start.end():stop]
    block = re.sub(r'\n?\s*\.run \.act%d\s*\{[^}]*\}' % act, '', block)

    delays = [float(d) for d in re.findall(r'animation:\w+ [\d.]+s ([\d.]+)s', block)]
    delays += [float(d) for d in re.findall(r'calc\(([\d.]+)s \+', block)]
    if not delays:
        return block.strip('\n')
    base = min(delays)
    block = re.sub(r'animation:(\w+) ([\d.]+)s ([\d.]+)s',
                   lambda m: f'animation:{m.group(1)} {m.group(2)}s {round(float(m.group(3)) - base, 2)}s',
                   block)
    block = re.sub(r'calc\(([\d.]+)s \+',
                   lambda m: f'calc({round(float(m.group(1)) - base, 2)}s +', block)
    return block.strip('\n')


def act_markup(src, act):
    i = src.index(f'<g class="act{act}">')
    depth, j = 0, i
    while True:
        m = re.compile(r'</?g\b').search(src, j)
        depth += 1 if m.group(0) == '<g' else -1
        j = m.end()
        if depth == 0:
            return src[i:src.index('>', j) + 1]


viewbox = lambda s: re.search(r'<svg id="fig" viewBox="([^"]+)"', s).group(1)
aria = lambda s: re.search(r'aria-label="([^"]*)"', s, re.S).group(1)


def tiles_script(src):
    m = re.search(r'  \(function buildTiles.*?\}\)\(\);\n', src, re.S)
    return m.group(0) if m else ''


def namespace(text, act, n):
    return (text.replace(f'a{act}-', f's{n}-')
                .replace(f'class="act{act}"', f'class="scene" data-scene="{n}"')
                .replace(f'.act{act}', '.scene'))


def duration(rules, markup=''):
    """Longest (delay + duration). Staggered rules need the real --i range from
    the markup — assuming a fixed count made a three-row stagger look like 18s."""
    max_i = max([int(v) for v in re.findall(r'--i:(\d+)', markup)] or [0])
    ends = [float(a) + float(b) for a, b in re.findall(r'animation:\w+ ([\d.]+)s ([\d.]+)s', rules)]
    ends += [float(a) + float(b) + float(c) * max_i for a, b, c in
             re.findall(r'animation:\w+ ([\d.]+)s calc\(([\d.]+)s \+ var\(--i\)\*([\d.]+)s', rules)]
    return round(max(ends) + 0.3, 1) if ends else 6.0


SPEED_CSS = '''
  .controls { display:flex; gap:calc(var(--u)*.8); align-items:center; flex-wrap:wrap;
              justify-content:center; font-family:var(--f-mono);
              font-size:calc(var(--u)*1.15); color:var(--muted); }
  .speed { display:flex; align-items:center; gap:calc(var(--u)*.5); }
  .speed input[type=range] { width:150px; accent-color:var(--signal); }
  .speed output { font-variant-numeric:tabular-nums; min-width:3.4em; }
'''

SPEED_JS = '''
  // Rate control via the Web Animations API rather than rewriting durations:
  // playbackRate scales CSS animations already in flight, so the slider is live.
  const rateEl = document.getElementById('rate');
  const rateOut = document.getElementById('rateout');
  let rate = %(rate)s;
  try { const v = localStorage.getItem('anim-rate'); if (v) rate = +v; } catch (e) {}
  rateEl.value = rate;

  function applyRate (r) {
    rate = r;
    rateOut.textContent = r.toFixed(2) + '×';
    for (const a of fig.getAnimations({ subtree: true })) a.playbackRate = r;
    try { localStorage.setItem('anim-rate', String(r)); } catch (e) {}
  }
  rateEl.addEventListener('input', () => applyRate(+rateEl.value));
'''

STANDALONE = '''<!doctype html>
<meta charset="utf-8">
<title>{title}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,600;12..96,800&family=Public+Sans:wght@400;500;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap">
<style>
{css_head}
{speed_css}
{rules}
{reduced}
</style>

<header>
  <div class="eyebrow">{eyebrow}</div>
  <h1>{title}</h1>
  <p class="sub">{blurb}</p>
</header>

<div class="stage">
<svg id="fig" viewBox="{viewbox}" role="img" aria-label="{aria}">
{markup}
</svg>
</div>

<div class="controls">
  <button id="replay">↻ replay</button>
  <button id="theme">◐ theme</button>
  <span class="speed">
    <label for="rate">speed</label>
    <input id="rate" type="range" min="0.10" max="1.50" step="0.01" value="{rate}">
    <output id="rateout">{rate}×</output>
  </span>
  <span id="clock">0.0s</span>
</div>
{footer}
<script>
{tiles}
  const fig = document.getElementById('fig');
  const clock = document.getElementById('clock');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const DUR = {dur};
  let raf = 0, t0 = 0;
{speed_js}
  function tick (now) {{
    const t = ((now - t0) / 1000) * rate;      // scene time, not wall time
    clock.textContent = Math.min(t, DUR).toFixed(1) + 's / ' + DUR + 's';
    if (t < DUR + 0.3) raf = requestAnimationFrame(tick);
  }}
  function play () {{
    cancelAnimationFrame(raf);
    fig.classList.remove('run');
    void fig.getBoundingClientRect();
    fig.classList.add('run');
    applyRate(rate);
    if (!reduced) {{ t0 = performance.now(); raf = requestAnimationFrame(tick); }}
    else {{ clock.textContent = 'static'; }}
  }}
  document.getElementById('replay').addEventListener('click', play);
  document.getElementById('theme').addEventListener('click', () => {{
    const g = getComputedStyle(document.documentElement).getPropertyValue('--ground').trim().toLowerCase();
    document.documentElement.setAttribute('data-theme', g === '#12141a' ? 'light' : 'dark');
  }});
  play();
</script>
'''

FOOTER = ('<footer>\n  Card art: <a href="https://commons.wikimedia.org/wiki/Category:SVG_English_pattern_playing_cards">'
          'English pattern playing cards</a>\n  by Dmitry Fomin · CC0 public domain\n</footer>\n')

SUB_CSS = '  .sub { margin:calc(var(--u)*.8) 0 0; color:var(--muted); font-size:calc(var(--u)*1.35); max-width:60ch; }\n'


def build_scenes():
    OUT.mkdir(exist_ok=True)
    out = []
    for n, (fname, act, slug, eyebrow, title, blurb) in enumerate(SCENES, 1):
        src = read(fname)
        head, reduced = css_parts(src)
        rules = namespace(act_rules(src, act), act, n)
        markup = render_tex(namespace(act_markup(src, act), act, n))
        reduced = reduced.replace('.run .act1, .run .act2 { opacity:0 !important; }', '')
        # The tile grid's --i is set in JS (0..31), not in the markup.
        dur = duration(rules, markup + ('--i:31' if 'id="tiles"' in markup else ''))
        html = STANDALONE.format(
            title=title, eyebrow=eyebrow, blurb=blurb,
            css_head=head.rstrip() + '\n' + SUB_CSS, speed_css=SPEED_CSS,
            rules=rules, reduced=reduced.rstrip(),
            viewbox=viewbox(src), aria=aria(src), markup=markup,
            tiles=namespace(tiles_script(src), act, n) if 'id="tiles"' in markup else '',
            dur=dur, rate=DEFAULT_RATE,
            speed_js=SPEED_JS % {'rate': DEFAULT_RATE},
            footer=FOOTER if fname == 'card-analogy.html' else '')
        p = OUT / f'{n:02d}-{slug}.html'
        p.write_text(html)
        out.append(dict(n=n, slug=slug, path=p, head=head, rules=rules, markup=markup,
                        viewbox=viewbox(src), title=title, eyebrow=eyebrow,
                        blurb=blurb, dur=dur, src=fname,
                        tiles='id="tiles"' in markup, aria=aria(src)))
        print(f'  {p.relative_to(HERE.parent)}  ({p.stat().st_size // 1024} KB, {dur}s)')
    return out


if __name__ == '__main__':
    print(f"Building {len(SCENES)} scenes:")
    scenes = build_scenes()
    from build_deck import build_deck   # noqa: E402
    build_deck(scenes, HERE, DEFAULT_RATE, SCENES)
