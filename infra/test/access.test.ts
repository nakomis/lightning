/**
 * The authorisation logic. This is the file where a mistake is a security bug
 * rather than a broken feature, so the cases are the ones that would be
 * exploitable rather than the ones that are convenient to write.
 */
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';

process.env.ACCESS_TABLE_NAME = 'test-access';
process.env.GATE_GROUP = 'lightning';

import {
  Caller,
  HttpError,
  readableCollections,
  requireAdmin,
  requireCollection,
  resolveCaller,
} from '../lambda/shared/auth';

const ddbMock = mockClient(DynamoDBDocumentClient);

const caller = (over: Partial<Caller> = {}): Caller => ({
  email: 'someone@example.com',
  collections: new Map(),
  isAdmin: false,
  ...over,
});

const event = (claims: Record<string, unknown>) =>
  ({ requestContext: { authorizer: { jwt: { claims } } } }) as never;

beforeEach(() => ddbMock.reset());

describe('requireCollection', () => {
  it('allows a role that meets the requirement', () => {
    const c = caller({ collections: new Map([['TDS', 'rw']]) });
    expect(() => requireCollection(c, 'TDS', 'ro')).not.toThrow();
    expect(() => requireCollection(c, 'TDS', 'rw')).not.toThrow();
  });

  it('refuses a write to a collection held read-only', () => {
    const c = caller({ collections: new Map([['TDS', 'ro']]) });
    expect(() => requireCollection(c, 'TDS', 'ro')).not.toThrow();
    expect(() => requireCollection(c, 'TDS', 'rw')).toThrow(HttpError);
  });

  it('hides a collection the caller holds nothing on behind a 404', () => {
    // 403 would confirm the collection exists, which is itself a disclosure.
    try {
      requireCollection(caller(), 'Personal', 'ro');
      throw new Error('should have thrown');
    } catch (err) {
      expect((err as HttpError).status).toBe(404);
    }
  });

  it('does not let a role on one collection leak to another', () => {
    const c = caller({ collections: new Map([['Personal', 'rw']]) });
    expect(() => requireCollection(c, 'TDS', 'ro')).toThrow(HttpError);
  });

  it('lets an admin through regardless', () => {
    const c = caller({ isAdmin: true });
    expect(() => requireCollection(c, 'anything', 'rw')).not.toThrow();
  });
});

describe('requireAdmin', () => {
  it('allows an admin and refuses everyone else', () => {
    expect(() => requireAdmin(caller({ isAdmin: true }))).not.toThrow();
    expect(() => requireAdmin(caller({ collections: new Map([['TDS', 'rw']]) }))).toThrow(
      HttpError,
    );
  });
});

describe('readableCollections', () => {
  it('is sorted', () => {
    const c = caller({
      collections: new Map([
        ['TDS', 'ro'],
        ['Personal', 'rw'],
      ]),
    });
    expect(readableCollections(c)).toEqual(['Personal', 'TDS']);
  });
});

describe('resolveCaller', () => {
  it('builds collections and admin from the access rows', async () => {
    ddbMock.on(QueryCommand).resolves({
      Items: [
        { pk: 'USER#a@b.com', sk: 'COLLECTION#TDS', role: 'rw' },
        { pk: 'USER#a@b.com', sk: 'COLLECTION#Personal', role: 'ro' },
        { pk: 'USER#a@b.com', sk: 'ROOT', role: 'admin' },
      ],
    });

    const c = await resolveCaller(
      event({ email: 'A@B.com', email_verified: 'true', 'cognito:groups': ['lightning'] }),
    );

    // Lower-cased, because the table is keyed on it and addresses are not
    // case-sensitive in practice.
    expect(c.email).toBe('a@b.com');
    expect(c.isAdmin).toBe(true);
    expect(c.collections.get('TDS')).toBe('rw');
    expect(c.collections.get('Personal')).toBe('ro');
  });

  it('refuses anyone outside the gate group', async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [] });
    await expect(
      resolveCaller(
        event({ email: 'a@b.com', email_verified: 'true', 'cognito:groups': ['nakostat'] }),
      ),
    ).rejects.toThrow(/lightning group/);
  });

  it('refuses a token with no groups at all', async () => {
    await expect(
      resolveCaller(event({ email: 'a@b.com', email_verified: 'true' })),
    ).rejects.toThrow(HttpError);
  });

  it('refuses an unverified email address', async () => {
    // The access table is keyed on email, so an unverified one would let a
    // person claim someone else's grants.
    await expect(
      resolveCaller(
        event({ email: 'a@b.com', email_verified: 'false', 'cognito:groups': ['lightning'] }),
      ),
    ).rejects.toThrow(/not verified/);
  });

  it('refuses a token carrying no email', async () => {
    await expect(
      resolveCaller(event({ email_verified: 'true', 'cognito:groups': ['lightning'] })),
    ).rejects.toThrow(HttpError);
  });

  it('ignores rows with an unrecognised role', async () => {
    ddbMock.on(QueryCommand).resolves({
      Items: [{ pk: 'USER#a@b.com', sk: 'COLLECTION#TDS', role: 'superuser' }],
    });
    const c = await resolveCaller(
      event({ email: 'a@b.com', email_verified: 'true', 'cognito:groups': ['lightning'] }),
    );
    expect(c.collections.size).toBe(0);
  });

  it('does not grant admin from a ROOT row with another role', async () => {
    ddbMock.on(QueryCommand).resolves({
      Items: [{ pk: 'USER#a@b.com', sk: 'ROOT', role: 'rw' }],
    });
    const c = await resolveCaller(
      event({ email: 'a@b.com', email_verified: 'true', 'cognito:groups': ['lightning'] }),
    );
    expect(c.isAdmin).toBe(false);
  });
});
