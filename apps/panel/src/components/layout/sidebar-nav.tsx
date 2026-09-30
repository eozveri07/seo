import { Link } from '@tanstack/react-router'
import { usePermissions } from '@/lib/auth/use-permissions'
import { cn } from '@/lib/utils'
import { navItems } from './nav-items'

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const permissions = usePermissions()
  const visibleItems = navItems.filter((item) => !item.visible || item.visible(permissions))

  return (
    <nav className="flex flex-col gap-1 p-2">
      {visibleItems.map((item) => (
        <Link
          key={item.to}
          to={item.to}
          onClick={onNavigate}
          activeOptions={{ exact: true }}
          className={cn(
            'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground',
          )}
          activeProps={{
            className: 'bg-accent text-accent-foreground',
          }}
        >
          <item.icon className="size-4" />
          {item.title}
        </Link>
      ))}
    </nav>
  )
}
