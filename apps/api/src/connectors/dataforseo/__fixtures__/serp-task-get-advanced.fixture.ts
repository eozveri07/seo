/**
 * `serp/google/organic/task_get/advanced/{id}` örnek yanıtı, DataForSEO
 * dokümantasyonundaki biçimle (alanlar kısaltıldı). `result[0].items` SERP'i
 * sayfadaki sırasıyla verir: reklam, featured snippet ve "People also ask"
 * organik sırayı (`rank_group`) değil yalnız mutlak sırayı (`rank_absolute`)
 * kaydırır.
 *
 * Proje domain'i `example.com` iken beklenen sonuç: ilk eşleşme
 * `blog.example.com` (subdomain), `rank_group` 3, `rank_absolute` 6.
 * `www.notexample.com` benzer ama farklı domain olduğu için eşleşmez.
 */
export const SERP_FIXTURE_TASK_ID = '09281234-1535-0066-0000-5b1f7e3c9a21';
export const SERP_FIXTURE_TAG = '0190f0e4-0000-7000-8000-0000000000c1';

function organic(rankGroup: number, rankAbsolute: number, domain: string) {
  return {
    type: 'organic',
    rank_group: rankGroup,
    rank_absolute: rankAbsolute,
    position: 'left',
    xpath: `/html[1]/body[1]/div[${rankAbsolute}]`,
    domain,
    title: `${domain} başlığı`,
    url: `https://${domain}/`,
    breadcrumb: `https://${domain}`,
    is_image: false,
    is_video: false,
    is_featured_snippet: false,
    is_malicious: false,
    description: 'Açıklama',
  };
}

export function serpTaskGetAdvancedFixture() {
  return {
    version: '0.1.20250923',
    status_code: 20000,
    status_message: 'Ok.',
    time: '0.1234 sec.',
    cost: 0,
    tasks_count: 1,
    tasks_error: 0,
    tasks: [
      {
        id: SERP_FIXTURE_TASK_ID,
        status_code: 20000,
        status_message: 'Ok.',
        time: '0.0567 sec.',
        cost: 0,
        result_count: 1,
        path: [
          'v3',
          'serp',
          'google',
          'organic',
          'task_get',
          'advanced',
          SERP_FIXTURE_TASK_ID,
        ],
        data: {
          api: 'serp',
          function: 'task_get',
          se: 'google',
          se_type: 'organic',
          keyword: 'seo araçları',
          location_code: 2792,
          language_code: 'tr',
          device: 'desktop',
          os: 'windows',
          depth: 20,
          tag: SERP_FIXTURE_TAG,
        },
        result: [
          {
            keyword: 'seo araçları',
            type: 'organic',
            se_domain: 'google.com.tr',
            location_code: 2792,
            language_code: 'tr',
            check_url:
              'https://www.google.com.tr/search?q=seo+ara%C3%A7lar%C4%B1',
            datetime: '2026-09-28 04:02:11 +00:00',
            spell: null,
            refinement_chips: null,
            item_types: [
              'paid',
              'featured_snippet',
              'organic',
              'people_also_ask',
            ],
            se_results_count: 184000000,
            items_count: 14,
            items: [
              {
                type: 'paid',
                rank_group: 1,
                rank_absolute: 1,
                position: 'left',
                domain: 'ads.example.net',
                title: 'Reklam',
                url: 'https://ads.example.net/',
              },
              {
                type: 'featured_snippet',
                rank_group: 1,
                rank_absolute: 2,
                position: 'left',
                domain: 'www.wikipedia.org',
                title: 'SEO',
                url: 'https://www.wikipedia.org/seo',
              },
              organic(1, 3, 'tr.wikipedia.org'),
              organic(2, 4, 'www.notexample.com'),
              {
                type: 'people_also_ask',
                rank_group: 1,
                rank_absolute: 5,
                position: 'left',
                title: null,
                items: [],
              },
              {
                ...organic(3, 6, 'blog.example.com'),
                url: 'https://blog.example.com/seo-araclari/',
              },
              {
                ...organic(4, 7, 'www.example.com'),
                url: 'https://www.example.com/fiyatlar',
              },
              organic(5, 8, 'site5.com'),
              organic(6, 9, 'site6.com'),
              organic(7, 10, 'site7.com'),
              organic(8, 11, 'site8.com'),
              organic(9, 12, 'site9.com'),
              organic(10, 13, 'site10.com'),
              organic(11, 14, 'site11.com'),
            ],
          },
        ],
      },
    ],
  };
}
