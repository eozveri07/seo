import type { LucideIcon } from 'lucide-react'
import { ActivityIcon } from 'lucide-react'

export type NavItem = {
  title: string
  to: string
  icon: LucideIcon
}

export const navItems: NavItem[] = [{ title: 'Sistem durumu', to: '/', icon: ActivityIcon }]
