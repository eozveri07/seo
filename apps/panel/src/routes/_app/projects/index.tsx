import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { PlusIcon } from 'lucide-react'
import { useState } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { useProjectsControllerList } from '@/api/projects/projects'
import type { ProjectResponseDto } from '@/api/endpoints.schemas'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DataTable } from '@/components/common/data-table'
import { EmptyState, ErrorState, LoadingState } from '@/components/common/state-views'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { usePermissions } from '@/lib/auth/use-permissions'

export const Route = createFileRoute('/_app/projects/')({
  component: ProjectsListPage,
})

const statusVariant: Record<string, 'default' | 'secondary' | 'outline'> = {
  active: 'default',
  paused: 'secondary',
  archived: 'outline',
}

const statusLabels: Record<string, string> = {
  active: 'Aktif',
  paused: 'Duraklatıldı',
  archived: 'Arşivlendi',
}

const columns: ColumnDef<ProjectResponseDto, unknown>[] = [
  { accessorKey: 'name', header: 'Proje' },
  { accessorKey: 'domain', header: 'Domain' },
  {
    accessorKey: 'status',
    header: 'Durum',
    cell: ({ row }) => (
      <Badge variant={statusVariant[row.original.status]}>{statusLabels[row.original.status]}</Badge>
    ),
  },
]

function ProjectsListPage() {
  const permissions = usePermissions()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search, 300)

  const { data, isPending, isError, refetch } = useProjectsControllerList({
    page: 1,
    limit: 100,
    search: debouncedSearch || undefined,
  })

  const projects = data?.status === 200 ? data.data.items : []

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Projeler</h1>
        {permissions.canManageProjects && (
          <Button asChild size="sm">
            <Link to="/projects/new" search={{ clientId: undefined }}>
              <PlusIcon className="size-4" />
              Yeni proje
            </Link>
          </Button>
        )}
      </div>

      <Input
        placeholder="Proje ara…"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        className="max-w-sm"
      />

      {isPending && <LoadingState />}
      {!isPending && isError && <ErrorState onRetry={() => refetch()} />}
      {!isPending && !isError && projects.length === 0 && (
        <EmptyState
          title={debouncedSearch ? 'Sonuç bulunamadı' : 'Henüz proje yok'}
          description={
            debouncedSearch
              ? 'Farklı bir arama terimi deneyin.'
              : permissions.canManageProjects
                ? 'İlk projenizi ekleyerek başlayın.'
                : undefined
          }
          action={
            !debouncedSearch && permissions.canManageProjects ? (
              <Button asChild size="sm">
                <Link to="/projects/new" search={{ clientId: undefined }}>Yeni proje</Link>
              </Button>
            ) : undefined
          }
        />
      )}
      {!isPending && !isError && projects.length > 0 && (
        <DataTable
          columns={columns}
          data={projects}
          onRowClick={
            permissions.canManageProjects
              ? (project) => void navigate({ to: '/projects/$projectId', params: { projectId: project.id } })
              : undefined
          }
        />
      )}
    </div>
  )
}
