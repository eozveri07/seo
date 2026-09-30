/** ARCHITECTURE §4.2: organizasyon içindeki roller. DB'de `org_role` enum'u. */
export enum OrgRole {
  Owner = 'owner',
  Admin = 'admin',
  Analyst = 'analyst',
  ClientViewer = 'client_viewer',
}

export const ALL_ORG_ROLES: readonly OrgRole[] = Object.values(OrgRole);

/**
 * ARCHITECTURE §4.2 rol matrisi. Endpoint'ler rolleri buradan alır:
 * `@Roles(...ROLE_MATRIX.memberManage)`. Matris değişirse yalnız burası
 * ve `role-matrix.spec.ts` değişir.
 *
 * `dataView` ve `reportView`'da client_viewer yalnız kendi client'ını görür;
 * bu kısıt rol kontrolüyle değil CLS'teki `clientScope` ile uygulanır.
 */
export const ROLE_MATRIX = {
  /** Org ayarları, üye çıkarma, org silme. */
  orgManage: [OrgRole.Owner],
  /** Üye davet etme, rol değiştirme, üye ve davet listeleme. */
  memberManage: [OrgRole.Owner, OrgRole.Admin],
  /** Client/project oluşturma ve silme. */
  clientProjectManage: [OrgRole.Owner, OrgRole.Admin],
  /** GSC/GA4 bağlantıları. */
  connectionManage: [OrgRole.Owner, OrgRole.Admin],
  /** Keyword, alert ve rapor yönetimi. */
  contentManage: [OrgRole.Owner, OrgRole.Admin, OrgRole.Analyst],
  /** Veri görüntüleme. */
  dataView: [...ALL_ORG_ROLES],
  /** Rapor görüntüleme. */
  reportView: [...ALL_ORG_ROLES],
  /** Maliyet raporu (`/usage`). */
  usageView: [OrgRole.Owner, OrgRole.Admin],
} as const satisfies Record<string, readonly OrgRole[]>;
