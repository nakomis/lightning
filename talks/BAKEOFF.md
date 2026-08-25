# Bake-off: SVG vs Veo 3.1

Same brief, two methods: *symbolically show text becoming a vector, Pythagoras
extending 2D → 3D → 1024D, and distance between vectors in 1024-dimensional
space.* As technical as possible.

## The entrants

| | Programmatic | Veo 3.1 Fast |
|---|---|---|
| File | `vector-distance.html` (18 KB) | `assets/veo31-vector-distance-15s.mp4` (31 MB) |
| Cost | Claude tokens | **$1.60** (2 × 8s, 1080p, no audio) |
| Time | ~40 min, several real bugs | ~90 seconds |
| Maths | Correct | **Wrong** |
| Looks | Diagram | Cinema |

## Where the video wins

It is genuinely beautiful, and it did better than expected. The tokenisation
shot renders **"the cat sat on the mat"** as six correctly-spelled boxed tokens
— sharp, legible, exactly the brief. The closing shot, a vast receding field of
tiles with the original three lost somewhere in the middle, communicates the
*scale* of 1024 dimensions better than any diagram can. That shot is worth
keeping.

## Where the video loses

`assets/veo31-pythagoras-frame.png` is the whole argument:

- The equation reads **`a₂ + b₂ = c₂`** — subscripts, not superscripts. As
  written it is not Pythagoras' theorem, it is nonsense.
- **The triangle is not right-angled.** It is roughly isosceles. The theorem
  does not apply to the figure being used to illustrate it.
- The squares are not on the sides. They are floating rectangles of unrelated
  size, so the areas cannot be compared — which is the entire proof.
- Four empty squares sit at the corners for no reason.
- The vector column degrades from `-0.13` into illegible mush, and renders
  `-0.13` as `-9.13`.

None of this is fixable by prompting. It is what diffusion does with notation.

## What the SVG does that the video cannot

- `d² = Δ₁² + Δ₂²` with a real 3-4-5 triangle: 14400 + 8100 = 22500 = 150².
  The numbers are correct and can be checked on screen.
- Names the actual model — `mxbai-embed-large`, which is *why* the number is
  1024 rather than an arbitrary large integer.
- Draws all 1024 tiles, because claiming 1024 while drawing forty would be the
  same category of lie the video tells.
- Ends on the payoff the brief implies but does not state: for L2-normalised
  vectors, `d² = 2(1 − cos θ)` — so ranking by Euclidean distance and ranking by
  cosine similarity are the same operation. That is what
  `ORDER BY embedding <=> query_vec` is doing, and it is the point of the slide.

## Verdict

Use the SVG for the explanation. If you want the video, use the last three
seconds of it — the receding tile field — as a silent backdrop while you say
"and now do that in one thousand and twenty four dimensions", then cut to the
diagram for the maths.

Do not put the Pythagoras frame in front of developers.
