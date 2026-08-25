/** GET /me — what the SPA needs before it can render anything. */
import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';
import { readableCollections, resolveCaller } from '../shared/auth';
import { handle, json } from '../shared/http';

export const handler = handle(async (event: APIGatewayProxyEventV2WithJWTAuthorizer) => {
  const caller = await resolveCaller(event);
  return json(200, {
    email: caller.email,
    isAdmin: caller.isAdmin,
    collections: readableCollections(caller).map((name) => ({
      name,
      role: caller.isAdmin ? 'rw' : caller.collections.get(name),
    })),
  });
});
