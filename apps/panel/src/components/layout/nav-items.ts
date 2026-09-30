import type { LucideIcon } from 'lucide-react'
import { ActivityIcon, BellIcon, BriefcaseIcon, FolderKanbanIcon, LayoutDashboardIcon, UsersIcon } from 'lucide-react'
import type { usePermissions } from '@/lib/auth/use-permissions'

export type NavItem = {
  title: string
  to: string
  icon: LucideIcon
  /** Verilmezse herkese görünür. */
  visible?: (permissions: ReturnType<typeof usePermissions>) => boolean
}

export const navItems: NavItem[] = [
  { title: 'Ana sayfa', to: '/', icon: LayoutDashboardIcon },
  { title: 'Müşteriler', to: '/clients', icon: BriefcaseIcon },
  { title: 'Projeler', to: '/projects', icon: FolderKanbanIcon },
  { title: 'Sistem durumu', to: '/system', icon: ActivityIcon },
  { title: 'Üyeler', to: '/members', icon: UsersIcon, visible: (p) => p.canManageMembers },
  {
    title: 'Bildirim kanalları',
    to: '/notifications',
    icon: BellIcon,
    visible: (p) => p.canManageNotificationChannels,
  },
]
