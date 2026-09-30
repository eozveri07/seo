import { EntityManager } from 'typeorm';

/**
 * Organizasyon satırını transaction sonuna kadar kilitler. Aynı org'un üyelik
 * değişiklikleri böylece sıraya girer; iki owner'ın aynı anda birbirinin rolünü
 * düşürmesi "son owner" kuralını delemez.
 */
export async function lockOrganization(
  manager: EntityManager,
  orgId: string,
): Promise<void> {
  await manager.query('SELECT id FROM organizations WHERE id = $1 FOR UPDATE', [
    orgId,
  ]);
}
