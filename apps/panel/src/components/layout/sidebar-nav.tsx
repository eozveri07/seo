import { Link } from '@tanstack/react-router'
import { cn } from '@/lib/utils'
import { navItems } from './nav-items'

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-1 p-2">
      {navItems.map((item) => (
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
