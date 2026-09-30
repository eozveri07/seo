import { previousPeriod } from './report-data.service';

describe('previousPeriod', () => {
  it('aynı gün sayısında, hemen önceki dönemi döner (haftalık)', () => {
    expect(previousPeriod('2026-09-21', '2026-09-27')).toEqual({
      start: '2026-09-14',
      end: '2026-09-20',
    });
  });

  it('tek günlük dönemde önceki gün döner', () => {
    expect(previousPeriod('2026-09-21', '2026-09-21')).toEqual({
      start: '2026-09-20',
      end: '2026-09-20',
    });
  });
});
