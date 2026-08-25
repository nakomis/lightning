/**
 * POST /talks/{talkId}/upload-url — a presigned PUT so the browser uploads
 * straight to S3.
 *
 * Nothing large should pass through Lambda: a deck with embedded fonts runs to
 * megabytes and the payload limit is 6 MB, so this would be a ceiling as well as
 * a cost. The signature is scoped to one key and one content type, so the URL
 * cannot be reused to write elsewhere in the bucket.
 */
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';
import { HttpError, requireCollection, resolveCaller } from '../shared/auth';
import { body, handle, json, requireString } from '../shared/http';

const s3 = new S3Client({});
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TALKS_TABLE = process.env.TALKS_TABLE_NAME!;
const CONTENT_BUCKET = process.env.CONTENT_BUCKET_NAME!;

/** What a file may be, and where it lands. Anything else is rejected. */
const KINDS: Record<string, { prefix: string; contentType?: string }> = {
  deck: { prefix: 'deck', contentType: 'text/html' },
  notes: { prefix: '', contentType: 'text/markdown' },
  asset: { prefix: 'assets' },
};

export const handler = handle(async (event: APIGatewayProxyEventV2WithJWTAuthorizer) => {
  const caller = await resolveCaller(event);
  const talkId = event.pathParameters?.talkId;
  if (!talkId) throw new HttpError(400, 'talkId is required');

  const input = body<{ kind?: unknown; filename?: unknown; contentType?: unknown }>(
    event.body,
    event.isBase64Encoded,
  );

  const kind = requireString(input.kind, 'kind', 16);
  const spec = KINDS[kind];
  if (!spec) throw new HttpError(400, `kind must be one of ${Object.keys(KINDS).join(', ')}`);

  const filename = sanitiseFilename(requireString(input.filename, 'filename'));

  const { Item } = await ddb.send(new GetCommand({ TableName: TALKS_TABLE, Key: { talkId } }));
  if (!Item) throw new HttpError(404, 'No such talk');
  requireCollection(caller, String(Item.collection), 'rw');

  const key = ['talks', talkId, spec.prefix, filename].filter(Boolean).join('/');
  const contentType =
    spec.contentType ??
    (typeof input.contentType === 'string' ? input.contentType : 'application/octet-stream');

  const url = await getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: CONTENT_BUCKET, Key: key, ContentType: contentType }),
    { expiresIn: 900 },
  );

  return json(200, { url, key, contentType });
});

/**
 * The filename reaches S3 as part of a key, so a `../` here would write outside
 * the talk's own prefix. Strip every path separator rather than trying to
 * detect traversal, and keep only characters that are unambiguous in a key.
 */
export function sanitiseFilename(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? '';
  const cleaned = base.replace(/[^A-Za-z0-9._-]/g, '-').replace(/^\.+/, '');
  if (!cleaned) throw new HttpError(400, 'filename is not usable');
  return cleaned.slice(0, 120);
}
