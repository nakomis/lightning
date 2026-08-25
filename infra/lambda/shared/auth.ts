/**
 * Who is calling, and what may they touch.
 *
 * Two layers, deliberately separate:
 *
 *   1. The JWT itself is validated by API Gateway's JWT authoriser before any of
 *      this runs — signature, issuer, audience and expiry. Nothing here re-checks
 *      that, because nothing here could do it better.
 *   2. Membership of the single `lightning` Cognito group is the gate: it answers
 *      only "may this person use the app at all". Everything finer — which
 *      collections, and read or write — comes from the access table.
 *
 * The group gate could have been an authoriser of its own, but that is a second
 * Lambda invocation on every request to answer a question the token already
 * carries. The access lookup cannot be avoided, so it is the one read we make.
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const ACCESS_TABLE = process.env.ACCESS_TABLE_NAME!;
const GATE_GROUP = process.env.GATE_GROUP ?? 'lightning';

export type Role = 'ro' | 'rw';

export interface Caller {
  email: string;
  /** Collection name → the role held on it. */
  collections: Map<string, Role>;
  isAdmin: boolean;
}

/** Thrown to short-circuit a handler; `toResponse` turns it into an HTTP reply. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * API Gateway hands `cognito:groups` through as an array when there are several
 * and as a bare string when there is one, and as a bracketed string in some
 * payload versions. Normalise all three rather than trusting any one of them.
 */
export function parseGroups(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw !== 'string') return [];
  const trimmed = raw.trim();
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    return trimmed
      .slice(1, -1)
      .split(/[,\s]+/)
      .filter(Boolean);
  }
  return trimmed ? trimmed.split(/[,\s]+/).filter(Boolean) : [];
}

/**
 * Resolve the caller, or throw. Rejects anyone outside the gate group with 403
 * rather than 401: the token is perfectly valid, they simply have no business
 * here, and saying so honestly is more useful than implying they should log in
 * again.
 */
export async function resolveCaller(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<Caller> {
  const claims = event.requestContext.authorizer?.jwt?.claims ?? {};

  const email = typeof claims.email === 'string' ? claims.email.toLowerCase() : '';
  if (!email) {
    throw new HttpError(403, 'Token carries no email claim');
  }
  // An unverified address could be anyone's. The access table is keyed on email,
  // so accepting one unverified would let a person claim another's grants.
  if (String(claims.email_verified) !== 'true') {
    throw new HttpError(403, 'Email address is not verified');
  }

  if (!parseGroups(claims['cognito:groups']).includes(GATE_GROUP)) {
    throw new HttpError(403, 'Not a member of the lightning group');
  }

  const { Items = [] } = await ddb.send(
    new QueryCommand({
      TableName: ACCESS_TABLE,
      KeyConditionExpression: 'pk = :pk',
      ExpressionAttributeValues: { ':pk': `USER#${email}` },
    }),
  );

  const collections = new Map<string, Role>();
  let isAdmin = false;

  for (const item of Items) {
    const sk = String(item.sk ?? '');
    if (sk === 'ROOT') {
      isAdmin = item.role === 'admin';
      continue;
    }
    if (sk.startsWith('COLLECTION#')) {
      const role = item.role;
      if (role === 'ro' || role === 'rw') {
        collections.set(sk.slice('COLLECTION#'.length), role);
      }
    }
  }

  return { email, collections, isAdmin };
}

/** Every collection the caller may see at all. */
export function readableCollections(caller: Caller): string[] {
  return [...caller.collections.keys()].sort();
}

/**
 * Assert a role on one collection. An admin passes implicitly — otherwise the
 * person who administers access could lock themselves out of the talks.
 *
 * A caller with no role at all gets 404, not 403: telling them the collection
 * exists but is barred is itself a disclosure.
 */
export function requireCollection(caller: Caller, collection: string, need: Role): void {
  if (caller.isAdmin) return;

  const held = caller.collections.get(collection);
  if (!held) {
    throw new HttpError(404, 'No such collection');
  }
  if (need === 'rw' && held !== 'rw') {
    throw new HttpError(403, `Read-only access to ${collection}`);
  }
}

export function requireAdmin(caller: Caller): void {
  if (!caller.isAdmin) {
    throw new HttpError(403, 'Administrator access required');
  }
}
