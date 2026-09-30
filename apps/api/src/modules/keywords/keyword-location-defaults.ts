import { Project } from '../clients/entities/project.entity';

/** Projede `dfsLocationCode`/`dfsLanguageCode` yoksa: ABD/İngilizce. */
export const DEFAULT_DFS_LOCATION_CODE = 2840;
export const DEFAULT_DFS_LANGUAGE_CODE = 'en';

export interface LocationLanguage {
  locationCode: number;
  languageCode: string;
}

/** ARCHITECTURE §5.5: lokasyon ve dil varsayılanı projeden gelir. */
export function resolveLocationLanguage(
  project: Pick<Project, 'dfsLocationCode' | 'dfsLanguageCode'>,
  overrides: { locationCode?: number; languageCode?: string } = {},
): LocationLanguage {
  return {
    locationCode:
      overrides.locationCode ??
      project.dfsLocationCode ??
      DEFAULT_DFS_LOCATION_CODE,
    languageCode:
      overrides.languageCode ??
      project.dfsLanguageCode ??
      DEFAULT_DFS_LANGUAGE_CODE,
  };
}
