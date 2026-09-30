import { DataSource, Repository } from 'typeorm';
import { ApiUsage, ApiUsageProvider } from './entities/api-usage.entity';
import { UsageGroupBy } from './dto/usage-query.dto';
import { InvalidDateRangeError } from './usage.errors';
import { formatCost, roundCost, UsageService } from './usage.service';

const TODAY = '2026-09-30';

function buildService(queryResult: unknown[] = []) {
  const insert = jest.fn().mockResolvedValue(undefined);
  const query = jest.fn().mockResolvedValue(queryResult);
  const service = new UsageService(
    { insert } as unknown as Repository<ApiUsage>,
    { query } as unknown as DataSource,
  );
  return { service, insert, query };
}

describe('UsageService', () => {
  describe('record', () => {
    it("api_usage'a maliyeti numeric(12,6) formatında yazar", async () => {
      const { service, insert } = buildService();

      await service.record({
        provider: ApiUsageProvider.DataForSeo,
        endpoint: 'serp/google/organic/task_post',
        units: 3,
        cost: 0.1 + 0.2,
        orgId: 'org-1',
        projectId: 'project-1',
        jobRunId: 'run-1',
      });

      expect(insert).toHaveBeenCalledWith({
        orgId: 'org-1',
        projectId: 'project-1',
        provider: ApiUsageProvider.DataForSeo,
        endpoint: 'serp/google/organic/task_post',
        units: 3,
        cost: '0.300000',
        jobRunId: 'run-1',
      });
    });

    it('orgId/projectId/jobRunId verilmezse null yazar (sistem çağrısı)', async () => {
      const { service, insert } = buildService();

      await service.record({
        provider: ApiUsageProvider.Anthropic,
        endpoint: 'messages',
        units: 1,
        cost: 0,
      });

      expect(insert).toHaveBeenCalledWith(
        expect.objectContaining({
          orgId: null,
          projectId: null,
          jobRunId: null,
        }),
      );
    });
  });

  describe('report', () => {
    it('groupBy=provider ile sağlayıcı bazında toplar', async () => {
      const { service, query } = buildService([
        { key: 'dataforseo', cost: '1.500000', units: '10' },
        { key: 'gsc', cost: '0.000000', units: '5' },
      ]);

      const result = await service.report(
        'org-1',
        { groupBy: UsageGroupBy.Provider },
        TODAY,
      );

      const [sql, params] = query.mock.calls[0] as [string, unknown[]];
      expect(sql).toContain('GROUP BY "provider"');
      expect(params[0]).toBe('org-1');
      expect(result).toEqual({
        from: '2026-08-31',
        to: '2026-09-29',
        groupBy: UsageGroupBy.Provider,
        items: [
          { key: 'dataforseo', cost: 1.5, units: 10 },
          { key: 'gsc', cost: 0, units: 5 },
        ],
        totalCost: 1.5,
        totalUnits: 15,
      });
    });

    it('groupBy=project projeye göre gruplar, null project unassigned olur', async () => {
      const { service, query } = buildService([
        { key: 'unassigned', cost: '0.000600', units: '1' },
      ]);

      await service.report(
        'org-1',
        { groupBy: UsageGroupBy.Project, from: '2026-09-01', to: '2026-09-02' },
        TODAY,
      );

      const [sql] = query.mock.calls[0] as [string, unknown[]];
      expect(sql).toContain('COALESCE("project_id"::text, \'unassigned\')');
    });

    it('groupBy=day güne göre gruplar', async () => {
      const { service, query } = buildService([]);

      await service.report('org-1', { groupBy: UsageGroupBy.Day }, TODAY);

      const [sql] = query.mock.calls[0] as [string, unknown[]];
      expect(sql).toContain(
        "to_char(\"created_at\" AT TIME ZONE 'UTC', 'YYYY-MM-DD')",
      );
    });

    it('from > to ise InvalidDateRangeError fırlatır', async () => {
      const { service } = buildService();

      await expect(
        service.report(
          'org-1',
          { groupBy: UsageGroupBy.Day, from: '2026-09-10', to: '2026-09-01' },
          TODAY,
        ),
      ).rejects.toThrow(InvalidDateRangeError);
    });
  });

  describe('roundCost/formatCost', () => {
    it('float toplama hatasını 6 basamağa yuvarlar', () => {
      expect(roundCost(0.1 + 0.2)).toBe(0.3);
      expect(formatCost(0.1 + 0.2)).toBe('0.300000');
    });
  });
});
