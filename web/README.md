# Lightning — web

The SPA: a talk list, a deck viewer, and the upload/share controls.

## Running it locally

```bash
pnpm install
bash scripts/set-config.sh localhost   # needs AWS_PROFILE=nakom.is-sandbox
pnpm dev
```

`set-config.sh localhost` borrows the sandbox Cognito client and API, but points
the redirect URIs at `http://localhost:5173` — the client is registered with both
origins, and Cognito matches callback URLs exactly.

## Configuration

`src/config/config.json` is gitignored and written from SSM by
`scripts/set-config.sh`. `config.json.template` beside it is what is tracked; CI
seeds a placeholder copy so `pnpm test` and `pnpm build` work without AWS access.

## The lockfile

`pnpm-lock.yaml` records integrity hashes rather than registry URLs, so the tree
a developer resolves through the home Nexus proxy is the same one CI resolves
from npmjs. An npm lockfile pins absolute URLs and does not survive that trip.

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | Vite dev server on :5173 |
| `pnpm build` | Typecheck, then build to `dist/` |
| `pnpm test` | Vitest with coverage (70% line threshold) |
| `pnpm lint` | Biome check |
| `pnpm format` | Biome format, writing changes |
