/**
 * ARCHITECTURE §7 tenant adaleti: öğeleri org'lara göre sırayla dağıtır
 * (A1, B1, C1, A2, B2, ...). Aynı öncelikteki BullMQ job'ları FIFO işlendiği
 * için tek bir org'un çok sayıda projesi diğer org'ları bekletmez. Org'ların
 * ve her org içindeki öğelerin sırası girdideki ilk görülme sırasıdır.
 */
export function roundRobinByOrg<T extends { orgId: string }>(items: T[]): T[] {
  const buckets = new Map<string, T[]>();
  for (const item of items) {
    const bucket = buckets.get(item.orgId);
    if (bucket) {
      bucket.push(item);
    } else {
      buckets.set(item.orgId, [item]);
    }
  }

  const queues = [...buckets.values()];
  const result: T[] = [];
  for (let round = 0; result.length < items.length; round += 1) {
    for (const queue of queues) {
      if (round < queue.length) {
        result.push(queue[round]);
      }
    }
  }
  return result;
}
