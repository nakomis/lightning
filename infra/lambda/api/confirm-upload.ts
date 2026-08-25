/**
 * POST /talks/{talkId}/files — record a file that has finished uploading.
 *
 * The browser PUTs straight to S3 with a presigned URL, so the API never sees
 * the upload happen. Without this step a talk's `files` map stays empty, and
 * `resolve-share` — which reads `files.deck` — can never resolve a share link.
 *
 * Recorded after the PUT rather than when the URL is issued: a presigned URL
 * that is never used, or an upload that fails halfway, would otherwise leave the
 * talk pointing at a key that holds nothing.
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';
import { HttpError, requireCollection, resolveCaller } from '../shared/auth';
import { body, handle, json, requireString } from '../shared/http';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TALKS_TABLE = process.env.TALKS_TABLE_NAME!;

/** Only these two are addressable by a share link, so only these are recorded. */
const KINDS = new Set(['deck', 'notes']);

export const handler = handle(async (event: APIGatewayProxyEventV2WithJWTAuthorizer) => {
  const caller = await resolveCaller(event);
  const talkId = event.pathParameters?.talkId;
  if (!talkId) throw new HttpError(400, 'talkId is required');

  const input = body<{ kind?: unknown; key?: unknown }>(event.body, event.isBase64Encoded);
  const kind = requireString(input.kind, 'kind', 16);
  if (!KINDS.has(kind)) {
    throw new HttpError(400, `kind must be one of ${[...KINDS].join(', ')}`);
  }
  const key = requireString(input.key, 'key', 512);

  const { Item } = await ddb.send(new GetCommand({ TableName: TALKS_TABLE, Key: { talkId } }));
  if (!Item) throw new HttpError(404, 'No such talk');
  requireCollection(caller, String(Item.collection), 'rw');

  // The caller supplies the key, so it has to be checked rather than trusted.
  // Without this, someone with write access to their own talk could point it at
  // a key under another talk's prefix and read a deck they have no rights to,
  // because the share resolver signs whatever key the talk names.
  if (!isKeyWithinTalk(key, talkId)) {
    throw new HttpError(400, 'key does not belong to this talk');
  }

  await ddb.send(
    new UpdateCommand({
      TableName: TALKS_TABLE,
      Key: { talkId },
      UpdateExpression: 'SET #files.#kind = :key, updatedAt = :now',
      ConditionExpression: 'attribute_exists(talkId)',
      ExpressionAttributeNames: { '#files': 'files', '#kind': kind },
      ExpressionAttributeValues: { ':key': key, ':now': new Date().toISOString() },
    }),
  );

  return json(200, { talkId, kind, key });
});

/**
 * A key belongs to the talk when it sits under `talks/<talkId>/` — compared
 * segment by segment, so a talk id that is a prefix of another cannot match.
 */
export function isKeyWithinTalk(key: string, talkId: string): boolean {
  const segments = key.split('/');
  return segments.length > 2 && segments[0] === 'talks' && segments[1] === talkId;
}
