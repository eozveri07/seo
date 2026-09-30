export interface DataForSeoLocationReference {
  locationCode: number;
  locationName: string;
  languageCode: string;
  languageName: string;
}

/**
 * DataForSEO lokasyon/dil referansı (ARCHITECTURE §5.2, PLAN.md T1.3). Statik
 * bir seed: sık kullanılan ülke/dil kombinasyonları. `location_code`'lar
 * DataForSEO'nun ülke seviyesindeki kodlarıdır (ISO 3166-1 numeric + 2000).
 * Tam liste ileride DataForSEO'nun `locations` endpoint'inden çekilebilir.
 */
export const DATAFORSEO_LOCATIONS: readonly DataForSeoLocationReference[] = [
  {
    locationCode: 2792,
    locationName: 'Turkey',
    languageCode: 'tr',
    languageName: 'Turkish',
  },
  {
    locationCode: 2826,
    locationName: 'United Kingdom',
    languageCode: 'en',
    languageName: 'English',
  },
  {
    locationCode: 2840,
    locationName: 'United States',
    languageCode: 'en',
    languageName: 'English',
  },
  {
    locationCode: 2840,
    locationName: 'United States',
    languageCode: 'es',
    languageName: 'Spanish',
  },
  {
    locationCode: 2276,
    locationName: 'Germany',
    languageCode: 'de',
    languageName: 'German',
  },
  {
    locationCode: 2124,
    locationName: 'Canada',
    languageCode: 'en',
    languageName: 'English',
  },
  {
    locationCode: 2124,
    locationName: 'Canada',
    languageCode: 'fr',
    languageName: 'French',
  },
  {
    locationCode: 2250,
    locationName: 'France',
    languageCode: 'fr',
    languageName: 'French',
  },
  {
    locationCode: 2724,
    locationName: 'Spain',
    languageCode: 'es',
    languageName: 'Spanish',
  },
  {
    locationCode: 2380,
    locationName: 'Italy',
    languageCode: 'it',
    languageName: 'Italian',
  },
  {
    locationCode: 2528,
    locationName: 'Netherlands',
    languageCode: 'nl',
    languageName: 'Dutch',
  },
  {
    locationCode: 2036,
    locationName: 'Australia',
    languageCode: 'en',
    languageName: 'English',
  },
  {
    locationCode: 2784,
    locationName: 'United Arab Emirates',
    languageCode: 'ar',
    languageName: 'Arabic',
  },
  {
    locationCode: 2784,
    locationName: 'United Arab Emirates',
    languageCode: 'en',
    languageName: 'English',
  },
  {
    locationCode: 2356,
    locationName: 'India',
    languageCode: 'en',
    languageName: 'English',
  },
  {
    locationCode: 2616,
    locationName: 'Poland',
    languageCode: 'pl',
    languageName: 'Polish',
  },
  {
    locationCode: 2620,
    locationName: 'Portugal',
    languageCode: 'pt',
    languageName: 'Portuguese',
  },
  {
    locationCode: 2076,
    locationName: 'Brazil',
    languageCode: 'pt',
    languageName: 'Portuguese',
  },
  {
    locationCode: 2484,
    locationName: 'Mexico',
    languageCode: 'es',
    languageName: 'Spanish',
  },
  {
    locationCode: 2752,
    locationName: 'Sweden',
    languageCode: 'sv',
    languageName: 'Swedish',
  },
  {
    locationCode: 2756,
    locationName: 'Switzerland',
    languageCode: 'de',
    languageName: 'German',
  },
  {
    locationCode: 2682,
    locationName: 'Saudi Arabia',
    languageCode: 'ar',
    languageName: 'Arabic',
  },
];
