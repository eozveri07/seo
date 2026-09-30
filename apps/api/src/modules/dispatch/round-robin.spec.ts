import { roundRobinByOrg } from './round-robin';

describe('roundRobinByOrg', () => {
  it("org'lar arasında sırayla dağıtır", () => {
    const items = [
      { orgId: 'a', id: 'a1' },
      { orgId: 'a', id: 'a2' },
      { orgId: 'a', id: 'a3' },
      { orgId: 'b', id: 'b1' },
      { orgId: 'c', id: 'c1' },
      { orgId: 'c', id: 'c2' },
    ];

    expect(roundRobinByOrg(items).map((i) => i.id)).toEqual([
      'a1',
      'b1',
      'c1',
      'a2',
      'c2',
      'a3',
    ]);
  });

  it('boş listede boş döner', () => {
    expect(roundRobinByOrg([])).toEqual([]);
  });
});
