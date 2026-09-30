import { Link, useRouterState } from '@tanstack/react-router'
import { cn } from '@/lib/utils'

const tabs = [
  { to: '/projects/$projectId/dashboard', label: 'Özet' },
  { to: '/projects/$projectId', label: 'Ayarlar' },
  { to: '/projects/$projectId/connections', label: 'Bağlantılar' },
  { to: '/projects/$projectId/explorer', label: 'GSC Explorer' },
  { to: '/projects/$projectId/keywords', label: "Keyword'ler" },
  { to: '/projects/$projectId/alerts', label: 'Alertler' },
  { to: '/projects/$projectId/reports', label: 'Raporlar' },
] as const

export function ProjectNav({ projectId }: { projectId: string }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname })

  return (
    <nav className="flex gap-1 border-b">
      {tabs.map((tab) => {
        const href = tab.to.replace('$projectId', projectId)
        const isActive = pathname === href
        return (
          <Link
            key={tab.to}
            to={tab.to}
            params={{ projectId }}
            className={cn(
              'rounded-t-md px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground',
              isActive && 'border-b-2 border-primary text-foreground',
            )}
          >
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
