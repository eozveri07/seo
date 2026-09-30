import { Link } from '@tanstack/react-router'
import { Building2Icon, ChevronsUpDownIcon, PlusIcon } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { useOrg } from '@/lib/auth/org-context'

const roleLabels: Record<string, string> = {
  owner: 'Sahip',
  admin: 'Yönetici',
  analyst: 'Analist',
  client_viewer: 'Müşteri görüntüleyici',
}

export function OrgSwitcher() {
  const { orgs, activeOrg, switchOrg } = useOrg()

  if (!activeOrg) return null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="max-w-48 justify-between gap-2" size="sm">
          <span className="flex min-w-0 items-center gap-2">
            <Building2Icon className="size-4 shrink-0" />
            <span className="truncate">{activeOrg.name}</span>
          </span>
          <ChevronsUpDownIcon className="size-4 shrink-0 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>Organizasyonlar</DropdownMenuLabel>
        {orgs.map((org) => (
          <DropdownMenuItem
            key={org.id}
            onSelect={() => switchOrg(org.id)}
            className="flex items-center justify-between gap-2"
          >
            <span className="truncate">{org.name}</span>
            <span className="text-xs text-muted-foreground">{roleLabels[org.role] ?? org.role}</span>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/organizations/new" className="flex items-center gap-2">
            <PlusIcon className="size-4" />
            Yeni organizasyon
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
