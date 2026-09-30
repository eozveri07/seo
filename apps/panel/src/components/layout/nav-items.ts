import type { LucideIcon } from 'lucide-react'
import { ActivityIcon, BellIcon, BriefcaseIcon, FolderKanbanIcon, UsersIcon } from 'lucide-react'
import type { usePermissions } from '@/lib/auth/use-permissions'

export type NavItem = {
  title: string
  to: string
  icon: LucideIcon
  /** Verilmezse herkese görünür. */
  visible?: (permissions: ReturnType<typeof usePermissions>) => boolean
}

export const navItems: NavItem[] = [
  { title: 'Sistem durumu', to: '/', icon: ActivityIcon },
  { title: 'Müşteriler', to: '/clients', icon: BriefcaseIcon },
  { title: 'Projeler', to: '/projects', icon: FolderKanbanIcon },
  { title: 'Üyeler', to: '/members', icon: UsersIcon, visible: (p) => p.canManageMembers },
  {
    title: 'Bildirim kanalları',
    to: '/notifications',
    icon: BellIcon,
    visible: (p) => p.canManageNotificationChannels,
  },
]
