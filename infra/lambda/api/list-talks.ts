/** GET /talks — every talk in every collection the caller may read. */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';
import { readableCollections, resolveCaller } from '../shared/auth';
import { handle, json } from '../shared/http';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TALKS_TABLE = process.env.TALKS_TABLE_NAME!;

export const handler = handle(async (event: APIGatewayProxyEventV2WithJWTAuthorizer) => {
  const caller = await resolveCaller(event);

  // An admin sees everything, which needs the full collection list rather than
  // just the ones they happen to hold a row for.
  const collections = caller.isAdmin
    ? await allCollections()
    : readableCollections(caller);

  const results = await Promise.all(
    collections.map((collection) =>
      ddb.send(
        new QueryCommand({
          TableName: TALKS_TABLE,
          IndexName: 'byCollection',
          // `collection` is a DynamoDB reserved keyword, so it cannot appear
          // literally in an expression — it has to come through a name
          // placeholder or the request is rejected outright.
          KeyConditionExpression: '#c = :c',
          ExpressionAttributeNames: { '#c': 'collection' },
          ExpressionAttributeValues: { ':c': collection },
          ScanIndexForward: false, // newest first
        }),
      ),
    ),
  );

  const talks = results.flatMap((r) => r.Items ?? []);
  return json(200, { talks, collections });
});

/**
 * Collections are implied by the talks and the access rows rather than stored
 * in their own table, so an admin's view is derived. Cheap at this scale, and
 * one fewer table to keep consistent.
 */
async function allCollections(): Promise<string[]> {
  const { ScanCommand } = await import('@aws-sdk/lib-dynamodb');
  const { Items = [] } = await ddb.send(
    new ScanCommand({
      TableName: TALKS_TABLE,
      // Reserved keyword again — see the query above.
      ProjectionExpression: '#c',
      ExpressionAttributeNames: { '#c': 'collection' },
    }),
  );
  const names = new Set<string>(
    (process.env.INITIAL_COLLECTIONS ?? '').split(',').filter(Boolean),
  );
  for (const item of Items) if (item.collection) names.add(String(item.collection));
  return [...names].sort();
}
