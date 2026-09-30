import 'reflect-metadata';
import { AppModule } from './app.module';
import { HousekeepingModule } from './modules/housekeeping/housekeeping.module';

describe('AppModule', () => {
  it("HousekeepingModule'ü import etmez (bakım cron'ları sadece worker'da yüklenir)", () => {
    const imports =
      (Reflect.getMetadata('imports', AppModule) as unknown[] | undefined) ??
      [];

    expect(imports).not.toContain(HousekeepingModule);
  });
});
