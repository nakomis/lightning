/** The shapes the API returns. Mirrors infra/lambda/api. */

export type Role = 'ro' | 'rw';

export interface Me {
  email: string;
  isAdmin: boolean;
  collections: Array<{ name: string; role: Role }>;
}

export interface Talk {
  talkId: string;
  title: string;
  collection: string;
  date: string;
  createdBy: string;
  createdAt: string;
  updatedAt?: string;
  /** S3 keys, populated once an upload is confirmed. */
  files: { deck?: string; notes?: string };
}

export interface TalksResponse {
  talks: Talk[];
  collections: string[];
}

export type UploadKind = 'deck' | 'notes' | 'asset';

export interface UploadUrl {
  url: string;
  key: string;
  contentType: string;
}

export interface ShareLink {
  token: string;
  url: string;
}
