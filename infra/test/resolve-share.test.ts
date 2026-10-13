/**
 * The unauthenticated share resolver. Its one job besides redirecting is to say
 * nothing useful to someone holding a token that does not work — so every
 * failure must look exactly like every other.
 */
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';

process.env.TALKS_TABLE_NAME = 'test-talks';
process.env.SHARE_TABLE_NAME = 'test-share';
process.env.CONTENT_BUCKET_NAME = 'test-content';

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn(async () => 'https://s3.example/deck.html?sig=1'),
}));

import { NOT_FOUND, handler } from '../lambda/api/resolve-share';

const ddbMock = mockClient(DynamoDBDocumentClient);
const TOKEN = 'AbCdEfGhIjKlMnOpQrStUv';

const event = (token: string | undefined, file?: string) =>
  ({ pathParameters: { token, ...(file ? { file } : {}) } }) as never;

const share = (over: Record<string, unknown> = {}) => ({
  token: TOKEN,
  talkId: 't1',
  revoked: false,
  ...over,
});

const talk = { talkId: 't1', files: { deck: 'talks/t1/deck/deck.html' } };

beforeEach(() => {
  ddbMock.reset();
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('resolve-share', () => {
  it('redirects a live token to a presigned URL, without leaking a referrer', async () => {
    ddbMock
      .on(GetCommand, { TableName: 'test-share' })
      .resolves({ Item: share() })
      .on(GetCommand, { TableName: 'test-talks' })
      .resolves({ Item: talk });

    const result = await handler(event(TOKEN));

    expect(result.statusCode).toBe(302);
    expect(result.headers?.Location).toBe('https://s3.example/deck.html?sig=1');
    expect(result.headers?.['Referrer-Policy']).toBe('no-referrer');
    expect(result.headers?.['X-Robots-Tag']).toMatch(/noindex/);
  });

  it('answers a revoked token with the not-found page, never 403', async () => {
    ddbMock.on(GetCommand, { TableName: 'test-share' }).resolves({ Item: share({ revoked: true }) });

    expect(await handler(event(TOKEN))).toEqual(NOT_FOUND);
  });

  it('answers an unknown, malformed or missing token identically', async () => {
    ddbMock.on(GetCommand).resolves({});

    expect(await handler(event(TOKEN))).toEqual(NOT_FOUND);
    expect(await handler(event('short'))).toEqual(NOT_FOUND);
    expect(await handler(event('has/slash-and-more-chars'))).toEqual(NOT_FOUND);
    expect(await handler(event(undefined))).toEqual(NOT_FOUND);
  });

  it('answers a failure inside the handler the same way', async () => {
    ddbMock.on(GetCommand).rejects(new Error('ResourceNotFoundException: test-share'));

    expect(await handler(event(TOKEN))).toEqual(NOT_FOUND);
  });

  it('answers 404 for a talk that has no deck yet', async () => {
    ddbMock
      .on(GetCommand, { TableName: 'test-share' })
      .resolves({ Item: share() })
      .on(GetCommand, { TableName: 'test-talks' })
      .resolves({ Item: { talkId: 't1', files: {} } });

    expect(await handler(event(TOKEN))).toEqual(NOT_FOUND);
  });

  it('serves the not-found page as a readable page that is never indexed or cached', () => {
    // Whoever follows a dead link was usually sent it and has no account; a
    // bare "Not found" reads as the site being broken.
    expect(NOT_FOUND.statusCode).toBe(404);
    expect(NOT_FOUND.headers?.['Content-Type']).toMatch(/^text\/html/);
    expect(NOT_FOUND.headers?.['Cache-Control']).toBe('no-store');
    expect(NOT_FOUND.headers?.['X-Robots-Tag']).toMatch(/noindex/);
    expect(NOT_FOUND.headers?.['Content-Security-Policy']).toContain("default-src 'none'");
    expect(NOT_FOUND.body).toContain('This link isn’t available');
    // Nothing that would distinguish revoked from never-issued.
    expect(NOT_FOUND.body).not.toMatch(/expired/i);
    expect(NOT_FOUND.body).not.toContain('<script');
  });
});
