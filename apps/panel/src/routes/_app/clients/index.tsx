import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { useClientsControllerList } from '@/api/clients/clients'
import type { ClientResponseDto } from '@/api/endpoints.schemas'
import type { ColumnDef } from '@tanstack/react-table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DataTable } from '@/components/common/data-table'
import { EmptyState, ErrorState, LoadingState } from '@/components/common/state-views'
import { usePermissions } from '@/lib/auth/use-permissions'
import { PlusIcon } from 'lucide-react'

export const Route = createFileRoute('/_app/clients/')({
  component: ClientsListPage,
})

const columns: ColumnDef<ClientResponseDto, unknown>[] = [
  { accessorKey: 'name', header: 'Ad' },
  {
    accessorKey: 'contactEmails',
    header: 'İletişim',
    cell: ({ row }) => row.original.contactEmails.join(', ') || '—',
  },
  {
    accessorKey: 'isActive',
    header: 'Durum',
    cell: ({ row }) => (
      <Badge variant={row.original.isActive ? 'default' : 'secondary'}>
        {row.original.isActive ? 'Aktif' : 'Pasif'}
      </Badge>
    ),
  },
]

function ClientsListPage() {
  const permissions = usePermissions()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search, 300)

  const { data, isPending, isError, refetch } = useClientsControllerList({
    page: 1,
    limit: 100,
    search: debouncedSearch || undefined,
  })

  const clients = data?.status === 200 ? data.data.items : []

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Müşteriler</h1>
        {permissions.canManageClients && (
          <Button asChild size="sm">
            <Link to="/clients/new">
              <PlusIcon className="size-4" />
              Yeni müşteri
            </Link>
          </Button>
        )}
      </div>

      <Input
        placeholder="Müşteri ara…"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        className="max-w-sm"
      />

      {isPending && <LoadingState />}
      {!isPending && isError && <ErrorState onRetry={() => refetch()} />}
      {!isPending && !isError && clients.length === 0 && (
        <EmptyState
          title={debouncedSearch ? 'Sonuç bulunamadı' : 'Henüz müşteri yok'}
          description={
            debouncedSearch
              ? 'Farklı bir arama terimi deneyin.'
              : permissions.canManageClients
                ? 'İlk müşterinizi ekleyerek başlayın.'
                : undefined
          }
          action={
            !debouncedSearch && permissions.canManageClients ? (
              <Button asChild size="sm">
                <Link to="/clients/new">Yeni müşteri</Link>
              </Button>
            ) : undefined
          }
        />
      )}
      {!isPending && !isError && clients.length > 0 && (
        <DataTable
          columns={columns}
          data={clients}
          onRowClick={
            permissions.canManageClients
              ? (client) => void navigate({ to: '/clients/$clientId', params: { clientId: client.id } })
              : undefined
          }
        />
      )}
    </div>
  )
}
