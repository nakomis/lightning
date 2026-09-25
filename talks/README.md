# Talks

Source for the talks hosted on lightning. Each folder is self-contained, and what
gets uploaded to the app is a single HTML file.

| Talk | Upload | Built from |
|---|---|---|
| [Conversation Memory](conversation-memory/) | `slides.html` | Hand-written; speaker notes in `SPEAKER-NOTES.md` |
| [Embeddings](embeddings/) | `embeddings.html` | `build-animations.py` then `build_deck.py`; notes in `EMBEDDINGS-NOTES.md` |

## Rebuilding Embeddings

The scene sources (`naive-search.html`, `vector-distance.html`, `card-analogy.html`, …)
are the source of truth. `animations/` and `embeddings.html` are generated, so
never edit them by hand.

```bash
cd talks/embeddings/tools && pnpm install   # MathJax, for build-time LaTeX → SVG
cd .. && python3 build-animations.py && python3 build_deck.py
```

Both decks still carry their own navigator and speed control. LIGHT-16 moves that
chrome into the app.
