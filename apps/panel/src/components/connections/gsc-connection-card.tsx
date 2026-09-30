import { useState } from 'react'
import { toast } from 'sonner'
import { useConnectionsControllerCreate, useConnectionsControllerListGscSites } from '@/api/connections/connections'
import { CreateConnectionDtoType, type ConnectionResponseDto } from '@/api/endpoints.schemas'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { ConnectionStatusPanel } from './connection-status-panel'

export function GscConnectionCard({
  projectId,
  connection,
  onCreated,
}: {
  projectId: string
  connection: ConnectionResponseDto | undefined
  onCreated: () => void
}) {
  const [siteUrl, setSiteUrl] = useState<string>('')
  const { data, isPending, isError } = useConnectionsControllerListGscSites(projectId, {
    query: { enabled: !connection },
  })
  const { mutateAsync: createConnection, isPending: isCreating } = useConnectionsControllerCreate()

  const sites = data?.status === 200 ? data.data.items : []

  async function connect() {
    if (!siteUrl) return
    const response = await createConnection({
      projectId,
      data: { type: CreateConnectionDtoType.gsc, externalId: siteUrl },
    })
    if (response.status !== 201) {
      toast.error('GSC bağlantısı oluşturulamadı.')
      return
    }
    toast.success('GSC bağlantısı oluşturuldu, doğrulayabilirsiniz.')
    onCreated()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Google Search Console</CardTitle>
        <CardDescription>Takip edilecek site mülkünü seçin.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {connection ? (
          <ConnectionStatusPanel connection={connection} />
        ) : (
          <>
            {isPending && <Skeleton className="h-9 w-full" />}
            {!isPending && isError && (
              <p className="text-sm text-destructive">
                Site listesi alınamadı. Service account'un GSC'de erişimi olduğundan emin olun.
              </p>
            )}
            {!isPending && !isError && sites.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Service account henüz hiçbir GSC mülküne eklenmemiş.
              </p>
            )}
            {!isPending && !isError && sites.length > 0 && (
              <Select value={siteUrl} onValueChange={setSiteUrl}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Site seçin" />
                </SelectTrigger>
                <SelectContent>
                  {sites.map((site) => (
                    <SelectItem key={site.siteUrl} value={site.siteUrl}>
                      {site.siteUrl}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Button type="button" disabled={!siteUrl || isCreating} onClick={() => void connect()} className="self-start">
              Bağla
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  )
}
