# Embeddings — speaker notes

Eleven slides, nine of them animated, roughly 12–15 minutes at a comfortable pace. Every animated slide
replays with **R**; **←/→** move, **Home/End** jump, **F** is fullscreen. The
speed slider defaults to 0.33× — nudge it up if the room is quick.

Nothing below is written on the slides. That is deliberate. The slides show;
you say.

---

## 1 — Embeddings *(title)*

Hold it for a beat. One line only:

> "This is the one idea underneath semantic search. It is simpler than people
> make it sound, and it is all Pythagoras."

---

## 2 — Letters, or meaning *(animated)*

**The setup:** you search your own notes for `bank`.

Let the three rows land before you talk over them. Then walk the two columns:

- **Row 1 — the river bank.** The letters match perfectly. It is the wrong bank
  entirely. Keyword search says yes; you say no. *A false positive.*
- **Row 2 — `bnak`.** One transposed letter. You meant this message. Keyword
  search cannot see it. *A false negative, and the most infuriating kind —
  you know the message exists.*
- **Row 3 — "building society".** Not one character in common. Same meaning.
  *Also invisible.*

**The line to land:**

> "Three rows, and the two columns never agree once. Keyword search can only
> ever answer the left-hand column. The right-hand one is the question you
> actually asked."

If someone says "that's what stemming and fuzzy matching are for" — agree,
briefly. They patch row 2. They do nothing for rows 1 and 3, because those are
not spelling problems, they are meaning problems.

---

## 3 — If you asked a human *(animated)*

**The framing:** suppose you wanted to turn a phrase into numbers by hand. You
would hire someone and give them a scoring sheet.

Read a couple of the attributes aloud, including the daft one — *usefulness to
a Norwegian fisherman* — because it makes the real point: **the axes are
arbitrary, and you chose them.**

### The J. Evans Pritchard aside *(optional, ~40 seconds)*

Worth telling if the room is enjoying itself. Cut it if you are running long.

> "There is a scene in *Dead Poets Society* where the boys are told to read an
> essay by a Dr J. Evans Pritchard, called *Understanding Poetry*. His method
> is this: score a poem on two axes — how artfully its objective was rendered,
> and how important that objective was. Plot perfection on the horizontal,
> importance on the vertical, and **the area of the rectangle is the poem's
> greatness**. Keating makes them tear the page out."

Then the turn:

> "Here is the thing though. That is an embedding. Two named dimensions, a
> position in that space, and a number derived from the coordinates. Pritchard
> wasn't wrong about the *method* — only about the number of axes, and about
> the axes needing names you could defend."

Accuracy, if challenged:
- Pritchard is **fictional**, invented for the 1989 film. There is no such essay.
- It is **two** axes, multiplied — not a list of ratings.
- Not to be confused with **E. E. Evans-Pritchard**, the real anthropologist.
  Different person, hyphenated.

**The pivot to the slide's right-hand box:**

> "A real embedding does this a thousand and twenty-four times. And not one of
> those axes has a name. Nobody chose them. They are just directions that
> happened to be useful."

If someone objects that this makes embeddings meaningless — good, that is the
right instinct, and slide 11 answers it. The *axes* mean nothing. The
*geometry* means a great deal.

---

## 4 — From text to a vector *(animated)*

The mechanical slide. Keep it brisk.

Six tokens in, 1024 numbers out, and the model — `mxbai-embed-large` — runs
locally via Ollama. Worth saying plainly: **nothing leaves the machine.**

The detail that matters for later: the vector is **L2-normalised**, so every
message lands on the unit hypersphere. Say it once now; slides 5 and 7 cash it in.

---

## 5 — Similarity becomes distance *(animated)*

**This is the bridge slide.** Without it, the next three slides look like a maths
lecture that wandered in. Say why you are about to talk about triangles.

Let the sphere and both clusters land first. Then:

> "Every vector is unit length — that L2-normalising from the last slide — so
> every message in your history sits somewhere on this one surface. The radius
> never varies. The only thing that can vary is the angle."

Walk the two chords:

- **Short chord, 24°.** Two messages about the same thing. Close together.
- **Long chord, 90°.** Perpendicular. **cos θ = 0** — literally nothing in
  common. Worth pausing on: orthogonal is the mathematical form of "unrelated".

**The line that earns the next slide:**

> "So 'how similar are these two messages' has just become 'how far apart are
> these two points'. And that is a question about triangles."

The circle is drawn flat on purpose, so **the angles on screen are the real
angles** — 24° and 90° would survive a protractor. Two vectors span a plane, and
the triangle O–P–Q lies entirely inside it; that is true whether the space has
three dimensions or 1024, which is why the picture is honest rather than a
cartoon.

The law of cosines in that plane gives it away: two sides of length 1 with θ
between them means d² = 1 + 1 − 2cos θ = **2(1 − cos θ)**. That is the identity
slide 7 lands, so this triangle *derives* it rather than illustrating it. Worth
saying if the room is mathematical.

If asked why `<=>` and not a hand-written formula: it is pgvector's
cosine-distance operator, and it is the literal query this project runs —
`ORDER BY m.embedding <=> $1::vector`. The sibling operators are `<->` for L2 and
`<#>` for negative inner product.

## 6 — The hypotenuse becomes a leg *(animated)*

This is the slide that earns the whole talk. Do not rush it.

- Triangle in the floor plane. Legs 120 and 90, hypotenuse 150. Everyone knows
  this one.
- **Watch the label.** The line does not move. It stops being called a
  hypotenuse and starts being called a leg.
- Stand a new plane on it, perpendicular to the first, add a third side of 200,
  and the new hypotenuse is 250.

> "d₃² = (√(x² + y²))² + z², which is just x² + y² + z². The square root and
> the square cancel. And now you can see why you are allowed to keep going —
> there is nothing special about three."

Both steps are exact: 3-4-5 scaled twice. If anyone checks, 14400 + 8100 +
40000 = 62500 = 250². Let them check.

---

## 7 — Unrolled 1024 times *(animated)*

The recursion, written down: `dₖ² = dₖ₋₁² + xₖ²`. Unroll it and the nesting
collapses into one sum.

The grid is **1024 tiles, actually drawn** — 32 × 32. Point at the three
highlighted ones in the corner: *"those are the three we just did by hand."*

Then the payoff, and slow down here:

> "Because every vector is unit length, d² = 2(1 − cos θ). Distance and angle
> are the same measurement wearing different clothes. Rank by one and you have
> ranked by the other — which is why the whole of semantic search is
> `ORDER BY m.embedding <=> $1::vector`."

---

## 8 — A card is a point *(animated)*

Light relief, and a change of register. The King of Hearts goes in, 1024
numbers come out.

> "Not a picture of a card. A position."

---

## 9 — Arithmetic on positions *(animated)*

Do the sum out loud for one column so they see it is not hand-waving:
`0.44 − (−0.21) + 0.07 = 0.72`. Component by component, all 1024 of them.

> "v-star is not any card. It is just a point. So — which card is nearest to it?"

Pause there. Let someone in the room say it.

---

## 10 — Gender is a direction *(animated)*

The Queen. But the reveal is not the point — **the parallelogram is.**

> "Male to female, and King to Queen, are the same arrow. Same length, same
> direction. Gender is not a fact stored about each card. It is a *direction* in
> the space, and the same move works wherever you start. Nothing in training was
> ever told what a queen is."

### The caveat *(say it before someone else does)*

> "This is idealised. The famous king − man + woman result excludes the input
> words from the search — without that, the top hit is usually just *king*
> again. Real embeddings are messier than the folklore. The intuition is sound;
> the tidiness is a teaching aid."

Saying this yourself costs nothing and buys a lot of credibility with a room
that already half-suspects it.

---

## 11 — What this buys you *(text)*

Bring it home:

- Meaning becomes geometry.
- Similarity becomes distance.
- Search becomes `ORDER BY`.

And the callback to slide 3:

> "Remember the axes have no names? That is still true. But the *directions*
> mean something — you just watched one. That is the whole trick: nobody
> labelled anything, and the structure is there anyway."

---

## Questions you will probably get

**"Why 1024?"** — it is what `mxbai-embed-large` outputs. Other models differ;
768 and 1536 are common. Nothing in the maths cares.

**"Isn't cosine similarity different from Euclidean distance?"** — for
normalised vectors they are monotonically related, exactly as slides 5 and 7 show. For
unnormalised vectors they genuinely differ, and then it matters which you pick.

**"Does this replace keyword search?"** — no, and do not claim it does. Slide 2
row 1 is a keyword *false positive*; keyword search is still better when you
know the exact string. Hybrid — both, fused — beats either. That is what the
real system does.

**"How big are the vectors?"** — 1024 floats is about 4 KB per message before
compression. Text is cheap; the vectors are not. Budget accordingly.
