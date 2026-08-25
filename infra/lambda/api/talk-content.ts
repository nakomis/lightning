/**
 * GET /talks/{talkId}/content?kind=deck|notes — a presigned GET for someone who
 * is signed in.
 *
 * `resolve-share` covers the same ground for people with a token and no account.
 * This is the authenticated equivalent, and it exists because the owner of a
 * talk should not have to mint a public share link in order to look at their own
 * deck.
 *
 * Returns the URL rather than a 302 so the SPA can put it in an iframe `src`
 * without the browser following a redirect it cannot see the result of.
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';
import { HttpError, requireCollection, resolveCaller } from '../shared/auth';
import { handle, json } from '../shared/http';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3 = new S3Client({});
const TALKS_TABLE = process.env.TALKS_TABLE_NAME!;
const CONTENT_BUCKET = process.env.CONTENT_BUCKET_NAME!;

export const handler = handle(async (event: APIGatewayProxyEventV2WithJWTAuthorizer) => {
  const caller = await resolveCaller(event);
  const talkId = event.pathParameters?.talkId;
  if (!talkId) throw new HttpError(400, 'talkId is required');

  const kind = event.queryStringParameters?.kind ?? 'deck';
  if (kind !== 'deck' && kind !== 'notes') {
    throw new HttpError(400, 'kind must be deck or notes');
  }

  const { Item } = await ddb.send(new GetCommand({ TableName: TALKS_TABLE, Key: { talkId } }));
  if (!Item) throw new HttpError(404, 'No such talk');
  requireCollection(caller, String(Item.collection), 'ro');

  const files = (Item.files ?? {}) as Record<string, string>;
  const key = files[kind];
  if (!key) throw new HttpError(404, `This talk has no ${kind}`);

  const url = await getSignedUrl(s3, new GetObjectCommand({ Bucket: CONTENT_BUCKET, Key: key }), {
    expiresIn: 900,
  });

  return json(200, { url, kind, expiresIn: 900 }, { 'Cache-Control': 'no-store' });
});
