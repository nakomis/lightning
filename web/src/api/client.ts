import { authHeaders } from '@/api/auth-token';
import type { Me, ShareLink, Talk, TalksResponse, UploadKind, UploadUrl } from '@/api/types';
import Config from '@/config/config';

/**
 * An error carrying the HTTP status, so callers can tell apart the cases the
 * API deliberately distinguishes — notably 404 for a collection the caller
 * holds no role on, which is not the same as an empty one.
 */
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

const base = () => Config.api.apiUrl.replace(/\/$/, '');

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${base()}${path}`, {
    ...init,
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...authHeaders(),
      ...init.headers,
    },
  });

  if (!response.ok) {
    throw new ApiError(response.status, await errorMessage(response));
  }
  // 204 has no body, and calling .json() on it throws.
  return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
}

/**
 * The API sends `{ error }` for anything it raised deliberately, but a failure
 * at the edge — a CloudFront error page, a gateway timeout — is not JSON at all.
 * Falling back to the status text keeps those from surfacing as a parse error
 * that hides what actually happened.
 */
async function errorMessage(response: Response): Promise<string> {
  try {
    const parsed = (await response.json()) as { error?: string; message?: string };
    return parsed.error ?? parsed.message ?? response.statusText;
  } catch {
    return response.statusText || `Request failed with ${response.status}`;
  }
}

export const api = {
  me: () => request<Me>('/me'),

  talks: () => request<TalksResponse>('/talks'),

  talk: (talkId: string) => request<{ talk: Talk }>(`/talks/${encodeURIComponent(talkId)}`),

  /** A short-lived presigned GET, for viewing a deck while signed in. */
  content: (talkId: string, kind: 'deck' | 'notes' = 'deck') =>
    request<{ url: string; kind: string; expiresIn: number }>(
      `/talks/${encodeURIComponent(talkId)}/content?kind=${kind}`,
    ),

  createTalk: (input: { title: string; collection: string; date: string }) =>
    request<{ talk: Talk }>('/talks', { method: 'POST', body: JSON.stringify(input) }),

  uploadUrl: (
    talkId: string,
    input: { kind: UploadKind; filename: string; contentType?: string },
  ) =>
    request<UploadUrl>(`/talks/${encodeURIComponent(talkId)}/upload-url`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  confirmUpload: (talkId: string, input: { kind: 'deck' | 'notes'; key: string }) =>
    request<{ talkId: string; kind: string; key: string }>(
      `/talks/${encodeURIComponent(talkId)}/files`,
      { method: 'POST', body: JSON.stringify(input) },
    ),

  share: (talkId: string) =>
    request<ShareLink>(`/talks/${encodeURIComponent(talkId)}/share`, { method: 'POST' }),

  revokeShare: (talkId: string, token: string) =>
    request<void>(`/talks/${encodeURIComponent(talkId)}/share?token=${encodeURIComponent(token)}`, {
      method: 'DELETE',
    }),
};

/**
 * Upload a file straight to S3, then tell the API where it landed.
 *
 * The PUT does not carry the Authorization header — the presigned URL is the
 * authorisation, and sending a bearer token alongside it makes S3 reject the
 * request as doubly-authenticated.
 */
export async function uploadFile(
  talkId: string,
  kind: UploadKind,
  file: File,
): Promise<{ key: string }> {
  const { url, key, contentType } = await api.uploadUrl(talkId, {
    kind,
    filename: file.name,
    contentType: file.type || undefined,
  });

  const put = await fetch(url, {
    method: 'PUT',
    body: file,
    headers: { 'Content-Type': contentType },
  });
  if (!put.ok) {
    throw new ApiError(put.status, `Upload failed (${put.status})`);
  }

  // Assets are referenced by the deck's own relative paths, so they are not
  // recorded against the talk; only the two addressable artefacts are.
  if (kind === 'deck' || kind === 'notes') {
    await api.confirmUpload(talkId, { kind, key });
  }
  return { key };
}
