import { OrgRole } from '@/api/endpoints.schemas'
import { useOrg } from './org-context'

/**
 * ARCHITECTURE §4.2 rol matrisi. `client_viewer` her zaman salt okunur;
 * `analyst` yalnız keyword/alert/rapor gibi izinli aksiyonları görür.
 */
export function usePermissions() {
  const { activeOrg } = useOrg()
  const role = activeOrg?.role ?? null
  const isOwner = role === OrgRole.owner
  const isAdmin = role === OrgRole.admin
  const isOwnerOrAdmin = isOwner || isAdmin

  return {
    role,
    canManageOrganization: isOwner,
    canManageMembers: isOwnerOrAdmin,
    canManageClients: isOwnerOrAdmin,
    canManageProjects: isOwnerOrAdmin,
    canManageConnections: isOwnerOrAdmin,
    canViewUsage: isOwnerOrAdmin,
    canManageNotificationChannels: isOwnerOrAdmin,
    /** `contentManage` rol matrisi: owner/admin/analyst; client_viewer yalnız okur. */
    canManageKeywords: isOwnerOrAdmin || role === OrgRole.analyst,
  }
}
