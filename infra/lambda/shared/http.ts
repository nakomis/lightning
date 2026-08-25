import type { APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { HttpError } from './auth';

export const json = (
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): APIGatewayProxyStructuredResultV2 => ({
  statusCode: status,
  headers: { 'Content-Type': 'application/json', ...headers },
  body: JSON.stringify(body),
});

/**
 * Wrap a handler so an HttpError becomes its status and anything else becomes a
 * 500 with the detail logged rather than returned.
 *
 * The asymmetry is the point: an HttpError is a message we chose to send, so it
 * is safe to show. An unexpected throw may carry a table name, a key, or an
 * SDK's idea of a helpful message, none of which the caller should see.
 */
export function handle<E>(
  fn: (event: E) => Promise<APIGatewayProxyStructuredResultV2>,
): (event: E) => Promise<APIGatewayProxyStructuredResultV2> {
  return async (event: E) => {
    try {
      return await fn(event);
    } catch (err) {
      if (err instanceof HttpError) {
        return json(err.status, { error: err.message });
      }
      console.error('Unhandled error', err);
      return json(500, { error: 'Internal error' });
    }
  };
}

/** Parse a JSON body, or 400. */
export function body<T>(raw: string | undefined, isBase64 = false): T {
  if (!raw) throw new HttpError(400, 'Request body is required');
  try {
    return JSON.parse(isBase64 ? Buffer.from(raw, 'base64').toString('utf8') : raw) as T;
  } catch {
    throw new HttpError(400, 'Request body is not valid JSON');
  }
}

/** Assert a value is a non-empty string, and hand back a trimmed copy. */
export function requireString(value: unknown, field: string, maxLength = 200): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new HttpError(400, `${field} is required`);
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    throw new HttpError(400, `${field} must be ${maxLength} characters or fewer`);
  }
  return trimmed;
}
