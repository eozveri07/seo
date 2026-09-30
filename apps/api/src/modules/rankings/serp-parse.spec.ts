import { DfsSerpAdvancedResult } from '../../connectors/dataforseo/dataforseo.types';
import { parseSerp } from './serp-parse';

function serp(
  items: DfsSerpAdvancedResult['items'],
  itemTypes: string[] = [],
): DfsSerpAdvancedResult {
  return {
    id: 'task-1',
    statusCode: 20000,
    statusMessage: 'Ok.',
    cost: 0,
    tag: null,
    itemTypes,
    items,
  };
}

function organic(rankGroup: number, rankAbsolute: number, domain: string) {
  return {
    type: 'organic',
    rankGroup,
    rankAbsolute,
    domain,
    url: `https://${domain}/sayfa`,
    title: domain,
  };
}

describe('parseSerp', () => {
  it('ilk eşleşen organik öğenin rank_group ve rank_absolute değerini alır', () => {
    const parsed = parseSerp(
      serp([
        organic(1, 2, 'other.com'),
        organic(2, 3, 'www.example.com'),
        organic(3, 4, 'blog.example.com'),
      ]),
      'example.com',
    );

    expect(parsed).toMatchObject({
      position: 2,
      rankAbsolute: 3,
      url: 'https://www.example.com/sayfa',
    });
  });

  it("featured snippet eşleşse bile pozisyon sayılmaz, serp_features'a girer", () => {
    const parsed = parseSerp(
      serp(
        [
          {
            type: 'featured_snippet',
            rankGroup: 1,
            rankAbsolute: 1,
            domain: 'example.com',
            url: 'https://example.com/',
            title: null,
          },
          organic(1, 2, 'other.com'),
        ],
        ['featured_snippet', 'organic'],
      ),
      'example.com',
    );

    expect(parsed.position).toBeNull();
    expect(parsed.rankAbsolute).toBeNull();
    expect(parsed.url).toBeNull();
    expect(parsed.serpFeatures).toEqual(['featured_snippet']);
  });

  it('item_types yoksa öğe tiplerinden türetir', () => {
    const parsed = parseSerp(
      serp([
        organic(1, 1, 'a.com'),
        {
          type: 'people_also_ask',
          rankGroup: 1,
          rankAbsolute: 2,
          domain: null,
          url: null,
          title: null,
        },
      ]),
      'example.com',
    );
    expect(parsed.serpFeatures).toEqual(['people_also_ask']);
  });

  it("domain alanı boşsa URL'den eşleştirir", () => {
    const parsed = parseSerp(
      serp([
        {
          ...organic(1, 1, 'x.com'),
          domain: null,
          url: 'https://example.com/a',
        },
      ]),
      'example.com',
    );
    expect(parsed.position).toBe(1);
    expect(parsed.competitorsTop).toEqual([
      { domain: 'example.com', position: 1 },
    ]);
  });

  it('competitors_top ilk 10 organik sonucu domain ve pozisyonla tutar', () => {
    const items = Array.from({ length: 12 }, (_, index) =>
      organic(index + 1, index + 1, `site${index + 1}.com`),
    );
    const parsed = parseSerp(serp(items), 'example.com');

    expect(parsed.competitorsTop).toHaveLength(10);
    expect(parsed.competitorsTop[0]).toEqual({
      domain: 'site1.com',
      position: 1,
    });
    expect(parsed.competitorsTop[9]).toEqual({
      domain: 'site10.com',
      position: 10,
    });
    expect(parsed.position).toBeNull();
  });
});
