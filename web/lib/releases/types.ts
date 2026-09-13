export interface ICollectedRelease {
  technology: string;
  label: string;
  externalId: string;
  version: string;
  title: string;
  description: string | null;
  sourceUrl: string | null;
  changelogUrl: string | null;
  releasedAt: string;
}

export interface ICollectionResult {
  warnings: string[];
}

export interface ICollectionErrorResponse {
  success: false;
  error: string;
}

export interface ICollectionSuccessResponse extends ICollectionResult {
  success: true;
}

export type CollectionApiResponse =
  | ICollectionSuccessResponse
  | ICollectionErrorResponse;
