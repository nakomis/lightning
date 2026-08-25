/** GET /talks/{talkId} */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';
import { HttpError, requireCollection, resolveCaller } from '../shared/auth';
import { handle, json } from '../shared/http';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TALKS_TABLE = process.env.TALKS_TABLE_NAME!;

export const handler = handle(async (event: APIGatewayProxyEventV2WithJWTAuthorizer) => {
  const caller = await resolveCaller(event);
  const talkId = event.pathParameters?.talkId;
  if (!talkId) throw new HttpError(400, 'talkId is required');

  const { Item } = await ddb.send(
    new GetCommand({ TableName: TALKS_TABLE, Key: { talkId } }),
  );
  // 404 before the permission check would confirm the id exists to anyone who
  // guessed it; checking first means both cases look identical.
  if (!Item) throw new HttpError(404, 'No such talk');

  requireCollection(caller, String(Item.collection), 'ro');
  return json(200, { talk: Item });
});
