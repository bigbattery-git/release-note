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

export type CollectionStatus = "inserted" | "updated" | "skipped";

export interface ICollectionItemResult {
  technology: string;
  label: string;
  version: string;
  status: CollectionStatus;
}

export interface ICollectionResult {
  items: ICollectionItemResult[];
  inserted: number;
  updated: number;
  skipped: number;
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
