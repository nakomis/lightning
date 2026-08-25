# lightning

`lightning.nakomis.com` — a web app for hosting and presenting lightning talks.
Taiga project **Lightning**, prefix **LTNG**.

## Stack

| Layer | Choice |
|---|---|
| Frontend | React 19 + Vite + Tailwind 4, Biome, Vitest |
| API | API Gateway HTTP API + Lambda (TypeScript) |
| Data | DynamoDB |
| Storage | S3 behind CloudFront with OAC |
| Auth | Existing shared nakomis Cognito pool, dedicated app client |
| Infra | CDK, split sandbox/prod on `NPM_ENVIRONMENT` |

Follow `~/repos/nakomis/nakostat` for CI/CD, Cognito and frontend patterns alike —
it completed its Vite + pnpm + Tailwind migration, so the old "copy its infra but
not its toolchain" caveat no longer applies.

## Package manager: pnpm, not npm

Not a preference — a correctness constraint. Dependencies resolve at home through
a Nexus proxy. `package-lock.json` records a `resolved` tarball URL per package,
so a lockfile generated here hard-codes the Nexus host and CI, which cannot reach
it, fails on install. `pnpm-lock.yaml` records only name, version and a sha512
integrity hash, so the same lockfile resolves from npmjs on a runner and from
Nexus on the laptop, producing an identical tree.

Pin the version per package with `"packageManager": "pnpm@<version>"`. There
should be no `package-lock.json` anywhere in this repo.

In CI, `pnpm/action-setup@v4` must come **before** `actions/setup-node@v4` — the
latter's cache keys off the pnpm store.

> Do not copy nakostat's `infra` CI jobs verbatim. As of 2026-08-25 they still say
> `cache: npm` / `cache-dependency-path: infra/package-lock.json` / `npm ci`, but
> that lockfile does not exist there. Only its `web` job was migrated, so `web` is
> the job to copy.

## AWS

- Sandbox: `AWS_PROFILE=nakom.is-sandbox`, account `975050268859`
- Production: `AWS_PROFILE=nakom.is-admin`, account `637423226886`
- Region: `eu-west-2`

### Cognito

The user pool is **shared with nine other apps** — do not reconfigure it, and
namespace anything added to it.

| | Sandbox | Prod |
|---|---|---|
| Pool | `eu-west-2_SSghhLpgX` | `eu-west-2_G5c5cC2iM` |
| SSM | `/nakomis-infra/sandbox/cognito/user-pool-id` | `/nakomis-infra/prod/cognito/user-pool-id` |

This app owns a dedicated app client (`lightning-spa-<env>`) so its callback URLs
and token lifetimes don't disturb the others.

## Access model

Two layers, kept separate on purpose:

1. **Gate** — the single Cognito group `lightning`. Answers only "may this person
   use the app at all". Enforced in the Lambda authorizer; no group means 403.
2. **Permissions** — DynamoDB, keyed on the **verified email claim**, not the
   Cognito `sub`. `PK USER#<email>`, `SK COLLECTION#<name>`, `role` in `ro|rw`;
   `SK ROOT` with `role=admin` confers administration.

Email rather than `sub` so CDK can seed the first admin without a deploy-time
lookup, and so a grant reads as *"give someone@example.com RW on TDS"*.

Collections at launch: **Personal**, **TDS**. Adding one is a row, not a deploy.

## Security constraints

- **Decks are untrusted HTML.** Render them in `sandbox="allow-scripts"` *without*
  `allow-same-origin`, served from a path distinct from the app, so a deck cannot
  reach the app's origin, tokens or storage.
- **Share links must reveal nothing.** 22 chars of base62 from a CSPRNG, served
  `X-Robots-Tag: noindex` and `Referrer-Policy: no-referrer`. A revoked token
  returns 404, never 403.
- **The S3 bucket is never public.** Share links resolve through a Lambda that
  302s to a short-lived presigned URL — the shareable link is permanent, the
  redirect target is not.

## Testing

```bash
pnpm test        # vitest (web) / jest (infra), with coverage
```

70% coverage minimum.

## Architecture diagrams

Source: `docs/architecture/lightning.drawio` — SVG auto-regenerated on commit by
`.githooks/pre-commit`.

To activate the hook after cloning:
```bash
git config core.hooksPath .githooks
```
