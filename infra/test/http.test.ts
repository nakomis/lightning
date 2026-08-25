import { HttpError } from '../lambda/shared/auth';
import { body, handle, json, requireString } from '../lambda/shared/http';

describe('json', () => {
  it('sets a JSON content type and serialises the body', () => {
    const r = json(201, { a: 1 });
    expect(r.statusCode).toBe(201);
    expect(r.headers).toMatchObject({ 'Content-Type': 'application/json' });
    expect(JSON.parse(r.body as string)).toEqual({ a: 1 });
  });
});

describe('handle', () => {
  it('passes a successful result through', async () => {
    const r = await handle(async () => json(200, { ok: true }))({});
    expect(r.statusCode).toBe(200);
  });

  it('turns an HttpError into its own status and message', async () => {
    const r = await handle(async () => {
      throw new HttpError(403, 'Nope');
    })({});
    expect(r.statusCode).toBe(403);
    expect(JSON.parse(r.body as string)).toEqual({ error: 'Nope' });
  });

  it('does not leak the detail of an unexpected throw', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const r = await handle(async () => {
      throw new Error('table lightning-access-prod does not exist');
    })({});
    expect(r.statusCode).toBe(500);
    expect(r.body).not.toContain('lightning-access-prod');
    expect(JSON.parse(r.body as string)).toEqual({ error: 'Internal error' });
    // Still logged, so it is diagnosable — just not returned.
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('body', () => {
  it('parses JSON', () => {
    expect(body<{ a: number }>('{"a":1}')).toEqual({ a: 1 });
  });

  it('parses base64-encoded JSON', () => {
    const raw = Buffer.from('{"a":2}').toString('base64');
    expect(body<{ a: number }>(raw, true)).toEqual({ a: 2 });
  });

  it('rejects a missing or malformed body with 400', () => {
    expect(() => body(undefined)).toThrow(HttpError);
    expect(() => body('not json')).toThrow(HttpError);
  });
});

describe('requireString', () => {
  it('trims and returns', () => {
    expect(requireString('  hello  ', 'field')).toBe('hello');
  });

  it('rejects empty, whitespace-only and non-strings', () => {
    for (const bad of ['', '   ', 42, null, undefined, {}]) {
      expect(() => requireString(bad, 'field')).toThrow(HttpError);
    }
  });

  it('enforces a maximum length', () => {
    expect(() => requireString('x'.repeat(50), 'field', 10)).toThrow(HttpError);
  });
});
