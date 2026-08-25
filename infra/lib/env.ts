/**
 * Everything that differs between sandbox and prod, in one place.
 *
 * Hosted zone IDs are hard-coded rather than looked up. A `HostedZone.fromLookup`
 * needs credentials at synth time, which CI does not have on a pull request — and
 * these IDs have not changed since the zones were created.
 */
export type DeployEnv = 'sandbox' | 'prod';

export const ACCOUNTS: Record<DeployEnv, string> = {
  sandbox: '975050268859',
  prod: '637423226886',
};

export const HOSTED_ZONES: Record<DeployEnv, { hostedZoneId: string; zoneName: string }> = {
  sandbox: { hostedZoneId: 'Z03586633NXU18LFL0JTL', zoneName: 'sandbox.nakomis.com' },
  prod: { hostedZoneId: 'Z019437529YGFB53BDUGR', zoneName: 'nakomis.com' },
};

export const appDomain = (deployEnv: DeployEnv): string =>
  `lightning.${HOSTED_ZONES[deployEnv].zoneName}`;

export const appOrigin = (deployEnv: DeployEnv): string => `https://${appDomain(deployEnv)}`;

/**
 * The SPA reaches the API through its own CloudFront distribution rather than
 * the execute-api hostname, so the two are same-origin and no preflight is in
 * the path of every call. CloudFront strips this prefix before the request
 * reaches API Gateway, which therefore still sees `/talks`, not `/api/talks`.
 */
export const API_PATH_PREFIX = '/api';

/** The Vite dev server, allowed through CORS so the SPA can be run locally. */
export const DEV_ORIGIN = 'http://localhost:5173';

/**
 * The single Cognito group that gates the app. Membership answers only "may this
 * person use lightning at all" — what they can then see comes from the access
 * table. The pool is shared with nine other apps, so the name is namespaced.
 */
export const GATE_GROUP = 'lightning';

/**
 * Seeded as the first admin so there is someone who can grant everyone else
 * access. Keyed on email rather than Cognito sub precisely so this can be a
 * constant rather than a deploy-time lookup.
 */
export const BOOTSTRAP_ADMIN_EMAIL = 'martin@nakomis.com';

/** Collections that exist at launch. Adding another is a table row, not a deploy. */
export const INITIAL_COLLECTIONS = ['Personal', 'TDS'];

/**
 * GitHub's OIDC subject now carries immutable numeric IDs:
 *
 *   repo:OWNER@OWNER_ID/REPO@REPO_ID:CONTEXT
 *
 * rather than the older `repo:OWNER/REPO:CONTEXT`. The IDs survive a rename,
 * which is the point — a trust policy pinned to names alone can be inherited by
 * whoever claims the name after you give it up.
 *
 * Both forms are accepted below, because the legacy subject is still emitted in
 * some contexts and there is no benefit to failing closed on it while the names
 * are pinned in either case.
 */
export const GITHUB_OWNER = 'nakomis';
export const GITHUB_OWNER_ID = '1488244';
export const GITHUB_REPO = 'lightning';
export const GITHUB_REPO_ID = '1346228874';

export const oidcSubjectPatterns = (): string[] => [
  `repo:${GITHUB_OWNER}@${GITHUB_OWNER_ID}/${GITHUB_REPO}@${GITHUB_REPO_ID}:*`,
  `repo:${GITHUB_OWNER}/${GITHUB_REPO}:*`,
];
