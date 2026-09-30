/** DataForSEO response zarfı (ARCHITECTURE §9.3): top-level ve task-level `status_code`. */
export interface DataForSeoEnvelope<T> {
  version: string;
  status_code: number;
  status_message: string;
  time: string;
  cost: number;
  tasks_count: number;
  tasks_error: number;
  tasks: DataForSeoTask<T>[] | null;
}

export interface DataForSeoTask<T> {
  id: string;
  status_code: number;
  status_message: string;
  time: string;
  cost: number;
  result_count: number;
  path: string[];
  data: Record<string, unknown> | null;
  result: T[] | null;
}

export type DfsDevice = 'desktop' | 'mobile';

export interface DfsSerpTaskPostItem {
  keyword: string;
  locationCode: number;
  languageCode: string;
  device?: DfsDevice;
  depth?: number;
  /** `tracked_keyword_id`; sonuçta aynı task'a geri döner (ARCHITECTURE §9.3). */
  tag?: string;
}

export interface DfsSerpTaskPostResult {
  id: string;
  statusCode: number;
  statusMessage: string;
  cost: number;
  tag: string | null;
}

export interface DfsTaskReadyItem {
  id: string;
  se: string;
  seType: string;
  date: string;
  tag: string | null;
}

export interface DfsSerpOrganicItem {
  type: string;
  rankGroup: number | null;
  rankAbsolute: number | null;
  domain: string | null;
  url: string | null;
  title: string | null;
}

export interface DfsSerpAdvancedResult {
  id: string;
  statusCode: number;
  statusMessage: string;
  cost: number;
  tag: string | null;
  items: DfsSerpOrganicItem[];
}

export interface DfsSerpLiveTask {
  keyword: string;
  locationCode: number;
  languageCode: string;
  device?: DfsDevice;
  depth?: number;
  tag?: string;
}

export interface DfsLocation {
  locationCode: number;
  locationName: string;
  countryIsoCode: string | null;
}

export interface DfsLanguage {
  languageCode: string;
  languageName: string;
}

export interface DfsKeywordVolumeResult {
  keyword: string;
  searchVolume: number | null;
  cpc: number | null;
}

/** Ücretli çağrılarda `UsageService.record`'a geçilecek tenant bağlamı; hepsi opsiyonel. */
export interface DfsUsageContext {
  orgId?: string;
  projectId?: string;
  jobRunId?: string;
}
