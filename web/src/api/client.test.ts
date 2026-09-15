import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setAccessToken } from '@/api/auth-token';
import { ApiError, api, uploadFile } from '@/api/client';

const ok = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

describe('api client', () => {
  beforeEach(() => {
    setAccessToken(undefined);
    vi.restoreAllMocks();
  });

  it('sends the bearer token when there is a session', async () => {
    setAccessToken('tok-123');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(ok({ email: 'a@b.com' }));

    await api.me();

    const [, init] = fetchMock.mock.calls[0];
    const headers = (init?.headers ?? {}) as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer tok-123');
  });

  it('omits the header entirely when signed out', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(ok({ talks: [] }));

    await api.talks();

    const [, init] = fetchMock.mock.calls[0];
    const headers = (init?.headers ?? {}) as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
  });

  it('preserves the status on an error so 403 and 404 stay distinguishable', async () => {
    // The API answers 404 rather than 403 for a collection the caller holds no
    // role on. Collapsing both to a generic Error would throw that away.
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(ok({ error: 'No such collection' }, 404));

    await expect(api.talk('abc')).rejects.toMatchObject({
      status: 404,
      message: 'No such collection',
    });
  });

  it('falls back to the status text when the body is not JSON', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('<html>gateway</html>', { status: 502, statusText: 'Bad Gateway' }),
    );

    await expect(api.me()).rejects.toMatchObject({ status: 502, message: 'Bad Gateway' });
  });

  it('escapes a talk id into the path', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(ok({ talk: {} }));

    await api.talk('a b/c');

    expect(fetchMock.mock.calls[0][0]).toContain('/talks/a%20b%2Fc');
  });
});

describe('uploadFile', () => {
  beforeEach(() => vi.restoreAllMocks());

  const file = () => new File(['<html></html>'], 'deck.html', { type: 'text/html' });

  it('PUTs to S3 without the bearer token, then records the key', async () => {
    // S3 rejects a presigned request that also carries an Authorization header.
    setAccessToken('tok-123');
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        ok({
          url: 'https://s3.example/put',
          key: 'talks/t1/deck/deck.html',
          contentType: 'text/html',
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(ok({ talkId: 't1', kind: 'deck', key: 'talks/t1/deck/deck.html' }));

    await uploadFile('t1', 'deck', file());

    const [putUrl, putInit] = fetchMock.mock.calls[1];
    expect(putUrl).toBe('https://s3.example/put');
    expect(putInit?.method).toBe('PUT');
    const putHeaders = (putInit?.headers ?? {}) as Record<string, string>;
    expect(putHeaders.Authorization).toBeUndefined();

    expect(fetchMock.mock.calls[2][0]).toContain('/talks/t1/files');
  });

  it('does not record an asset against the talk', async () => {
    // Assets are reached through the deck's own relative paths; recording one
    // would let it be served as though it were the deck.
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        ok({
          url: 'https://s3.example/put',
          key: 'talks/t1/assets/x.png',
          contentType: 'image/png',
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }));

    await uploadFile('t1', 'asset', new File([''], 'x.png', { type: 'image/png' }));

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not record the key when the upload itself fails', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        ok({
          url: 'https://s3.example/put',
          key: 'talks/t1/deck/deck.html',
          contentType: 'text/html',
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 403 }));

    await expect(uploadFile('t1', 'deck', file())).rejects.toBeInstanceOf(ApiError);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
