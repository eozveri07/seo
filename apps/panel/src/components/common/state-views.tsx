import type { ReactNode } from 'react'
import { AlertTriangleIcon, InboxIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

export function LoadingState({ rows = 3 }: { rows?: number }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 pt-6">
        {Array.from({ length: rows }).map((_, index) => (
          <Skeleton key={index} className="h-12 w-full" />
        ))}
      </CardContent>
    </Card>
  )
}

export function ErrorState({
  message = 'Veriler yüklenemedi.',
  onRetry,
}: {
  message?: string
  onRetry?: () => void
}) {
  return (
    <Card className="border-destructive">
      <CardContent className="flex items-center justify-between gap-3 pt-6">
        <div className="flex items-center gap-3">
          <AlertTriangleIcon className="size-5 shrink-0 text-destructive" />
          <p className="text-sm font-medium text-destructive">{message}</p>
        </div>
        {onRetry && (
          <Button variant="outline" size="sm" onClick={onRetry}>
            Tekrar dene
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
        <InboxIcon className="size-8 text-muted-foreground" />
        <div className="flex flex-col gap-1">
          <p className="font-medium">{title}</p>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
        {action}
      </CardContent>
    </Card>
  )
}
