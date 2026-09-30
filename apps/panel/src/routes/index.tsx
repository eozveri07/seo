import { createFileRoute } from '@tanstack/react-router'
import { AlertTriangleIcon, CheckCircle2Icon, XCircleIcon } from 'lucide-react'
import { useHealthControllerCheck } from '@/api/health/health'
import type { HealthCheckResultDto } from '@/api/endpoints.schemas'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

export const Route = createFileRoute('/')({
  component: HealthPage,
})

const checkLabels: Record<'database' | 'redis', string> = {
  database: 'Veritabanı',
  redis: 'Redis',
}

function CheckRow({ name, result }: { name: 'database' | 'redis'; result: HealthCheckResultDto }) {
  const isUp = result.status === 'up'
  return (
    <div className="flex items-center justify-between rounded-md border p-3">
      <div className="flex items-center gap-2">
        {isUp ? (
          <CheckCircle2Icon className="size-4 text-success" />
        ) : (
          <XCircleIcon className="size-4 text-destructive" />
        )}
        <span className="font-medium">{checkLabels[name]}</span>
      </div>
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        {typeof result.latencyMs === 'number' && <span>{result.latencyMs} ms</span>}
        {result.error && <span className="text-destructive">{result.error}</span>}
        <Badge variant={isUp ? 'default' : 'destructive'}>{isUp ? 'çalışıyor' : 'erişilemiyor'}</Badge>
      </div>
    </div>
  )
}

function HealthPage() {
  const { data, isPending, isError, refetch, isFetching } = useHealthControllerCheck()
  const health = data?.data
  const isUnreachable = isError || (!isPending && !health?.checks)

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Sistem durumu</h1>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          Yenile
        </Button>
      </div>

      {isPending && (
        <Card>
          <CardHeader>
            <CardTitle>
              <Skeleton className="h-5 w-40" />
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </CardContent>
        </Card>
      )}

      {!isPending && isUnreachable && (
        <Card className="border-destructive">
          <CardContent className="flex items-center gap-3 pt-6">
            <AlertTriangleIcon className="size-5 shrink-0 text-destructive" />
            <div>
              <p className="font-medium text-destructive">API'ye ulaşılamıyor</p>
              <p className="text-sm text-muted-foreground">
                http://localhost:3000 üzerinde API çalışıyor mu kontrol edin ve tekrar deneyin.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {!isUnreachable && health && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Bağımlılıklar</CardTitle>
            <Badge variant={health.status === 'ok' ? 'default' : 'destructive'}>
              {health.status === 'ok' ? 'Her şey yolunda' : 'Sorun var'}
            </Badge>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <CheckRow name="database" result={health.checks.database} />
            <CheckRow name="redis" result={health.checks.redis} />
          </CardContent>
        </Card>
      )}
    </div>
  )
}
