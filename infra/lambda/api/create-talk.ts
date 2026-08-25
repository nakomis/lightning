/** POST /talks — create a talk in a collection the caller holds RW on. */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';
import { HttpError, requireCollection, resolveCaller } from '../shared/auth';
import { body, handle, json, requireString } from '../shared/http';
import { newTalkId } from '../shared/ids';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TALKS_TABLE = process.env.TALKS_TABLE_NAME!;

interface CreateBody {
  title?: unknown;
  collection?: unknown;
  date?: unknown;
}

export const handler = handle(async (event: APIGatewayProxyEventV2WithJWTAuthorizer) => {
  const caller = await resolveCaller(event);
  const input = body<CreateBody>(event.body, event.isBase64Encoded);

  const title = requireString(input.title, 'title');
  const collection = requireString(input.collection, 'collection', 64);
  const date = requireString(input.date, 'date', 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new HttpError(400, 'date must be YYYY-MM-DD');
  }

  requireCollection(caller, collection, 'rw');

  const talk = {
    talkId: newTalkId(),
    title,
    collection,
    date,
    createdBy: caller.email,
    createdAt: new Date().toISOString(),
    files: {},
  };

  await ddb.send(
    new PutCommand({
      TableName: TALKS_TABLE,
      Item: talk,
      ConditionExpression: 'attribute_not_exists(talkId)',
    }),
  );

  return json(201, { talk });
});
