/**
 * GET /d/{token} and /d/{token}/{file} — the unauthenticated download path.
 *
 * The shareable URL is permanent; what it redirects to is not. Resolving the
 * token here and issuing a short-lived presigned GET means the link in someone's
 * Slack never rots, the bucket is never public, and revoking is one write.
 *
 * A revoked or unknown token returns 404, never 403 — a 403 would confirm the
 * token was once real, which is exactly the thing a guesser wants to know.
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3 = new S3Client({});
const TALKS_TABLE = process.env.TALKS_TABLE_NAME!;
const SHARE_TABLE = process.env.SHARE_TABLE_NAME!;
const CONTENT_BUCKET = process.env.CONTENT_BUCKET_NAME!;

// The person who follows a dead link is usually someone who was sent it and has
// no account, so they get a page that says what happened in words rather than a
// bare "Not found". It is the same page for every failure — revoked, never
// issued, malformed, or an error here — so it still tells a guesser nothing.
// Static, no scripts, nothing loaded from elsewhere.
const NOT_FOUND_PAGE = `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Link not available — Lightning</title>
<style>
  :root { color-scheme: light dark; --ink: #16181d; --muted: #63687a; --ground: #f7f8fb; }
  @media (prefers-color-scheme: dark) { :root { --ink: #eceef4; --muted: #969cad; --ground: #121419; } }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 16px;
         box-sizing: border-box; background: var(--ground); color: var(--ink);
         font: 16px/1.5 ui-sans-serif, system-ui, sans-serif; }
  main { max-width: 32rem; text-align: center; }
  h1 { font-size: 1.25rem; margin: 0 0 0.5rem; }
  p { margin: 0; color: var(--muted); }
</style>
</head>
<body>
<main>
<h1>This link isn’t available</h1>
<p>It may have been revoked by the person who shared it, or copied incorrectly.
If you still need the talk, ask them for a new link.</p>
</main>
</body>
</html>
`;

export const NOT_FOUND: APIGatewayProxyStructuredResultV2 = {
  statusCode: 404,
  headers: {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
    'X-Robots-Tag': 'noindex, nofollow',
    'Referrer-Policy': 'no-referrer',
  },
  body: NOT_FOUND_PAGE,
};

export const handler = async (
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> => {
  try {
    const token = event.pathParameters?.token;
    if (!token || !/^[A-Za-z0-9]{16,64}$/.test(token)) return NOT_FOUND;

    const { Item: share } = await ddb.send(
      new GetCommand({ TableName: SHARE_TABLE, Key: { token } }),
    );
    if (!share || share.revoked === true) return NOT_FOUND;

    const { Item: talk } = await ddb.send(
      new GetCommand({ TableName: TALKS_TABLE, Key: { talkId: share.talkId } }),
    );
    if (!talk) return NOT_FOUND;

    // Only the two published artefacts are reachable by token. Assets are not,
    // because a deck references them by relative path and would otherwise let a
    // token walk the whole prefix.
    const requested = event.pathParameters?.file ?? 'deck';
    const files = (talk.files ?? {}) as Record<string, string>;
    const key = requested === 'notes' ? files.notes : files.deck;
    if (!key) return NOT_FOUND;

    const url = await getSignedUrl(
      s3,
      new GetObjectCommand({ Bucket: CONTENT_BUCKET, Key: key }),
      { expiresIn: 300 },
    );

    return {
      statusCode: 302,
      headers: {
        Location: url,
        'Cache-Control': 'no-store',
        'X-Robots-Tag': 'noindex, nofollow',
        'Referrer-Policy': 'no-referrer',
      },
      body: '',
    };
  } catch (err) {
    console.error('resolve-share failed', err);
    return NOT_FOUND;
  }
};
