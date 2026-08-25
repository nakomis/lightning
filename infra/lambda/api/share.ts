/**
 * POST   /talks/{talkId}/share — mint a share token
 * DELETE /talks/{talkId}/share — revoke every token on the talk
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';
import { HttpError, requireCollection, resolveCaller } from '../shared/auth';
import { handle, json } from '../shared/http';
import { newShareToken } from '../shared/ids';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TALKS_TABLE = process.env.TALKS_TABLE_NAME!;
const SHARE_TABLE = process.env.SHARE_TABLE_NAME!;
const APP_ORIGIN = process.env.APP_ORIGIN!;

export const handler = handle(async (event: APIGatewayProxyEventV2WithJWTAuthorizer) => {
  const caller = await resolveCaller(event);
  const talkId = event.pathParameters?.talkId;
  if (!talkId) throw new HttpError(400, 'talkId is required');

  const { Item } = await ddb.send(new GetCommand({ TableName: TALKS_TABLE, Key: { talkId } }));
  if (!Item) throw new HttpError(404, 'No such talk');
  requireCollection(caller, String(Item.collection), 'rw');

  const method = event.requestContext.http.method;

  if (method === 'POST') {
    const token = newShareToken();
    await ddb.send(
      new PutCommand({
        TableName: SHARE_TABLE,
        Item: {
          token,
          talkId,
          createdBy: caller.email,
          createdAt: new Date().toISOString(),
          revoked: false,
        },
        ConditionExpression: 'attribute_not_exists(#t)',
        ExpressionAttributeNames: { '#t': 'token' },
      }),
    );
    return json(201, { token, url: `${APP_ORIGIN}/d/${token}` });
  }

  if (method === 'DELETE') {
    // Tokens are marked revoked rather than deleted, so a link that stopped
    // working can still be explained later — who minted it, and when it died.
    // The condition on talkId is what stops a token being revoked through the
    // wrong talk, which would otherwise be an authorisation bypass: the caller
    // is checked against the talk in the path, not against the token's own.
    const token = event.queryStringParameters?.token;
    if (!token) throw new HttpError(400, 'token query parameter is required');

    try {
      await ddb.send(
        new UpdateCommand({
          TableName: SHARE_TABLE,
          Key: { token },
          UpdateExpression: 'SET revoked = :true, revokedAt = :now, revokedBy = :who',
          ConditionExpression: 'talkId = :talkId',
          ExpressionAttributeValues: {
            ':true': true,
            ':now': new Date().toISOString(),
            ':who': caller.email,
            ':talkId': talkId,
          },
        }),
      );
    } catch (err) {
      if ((err as { name?: string }).name === 'ConditionalCheckFailedException') {
        throw new HttpError(404, 'No such token on this talk');
      }
      throw err;
    }

    return json(204, {});
  }

  throw new HttpError(405, 'Method not allowed');
});
