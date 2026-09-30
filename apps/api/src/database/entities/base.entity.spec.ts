import { validate as isUuid, version as uuidVersion } from 'uuid';
import { BaseEntity } from './base.entity';

class TestEntity extends BaseEntity {}

describe('BaseEntity', () => {
  it('id atanmamışsa insert öncesi UUIDv7 üretir', () => {
    const entity = new TestEntity();

    entity.ensureId();

    expect(isUuid(entity.id)).toBe(true);
    expect(uuidVersion(entity.id)).toBe(7);
  });

  it('id zaten atanmışsa korur', () => {
    const entity = new TestEntity();
    entity.id = '0190f0e4-5a2b-7c3d-8e4f-123456789abc';

    entity.ensureId();

    expect(entity.id).toBe('0190f0e4-5a2b-7c3d-8e4f-123456789abc');
  });
});
