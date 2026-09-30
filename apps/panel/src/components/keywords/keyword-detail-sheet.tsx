import { useEffect, useRef, useState } from 'react'
import { format, subDays } from 'date-fns'
import { RefreshCwIcon } from 'lucide-react'
import { toast } from 'sonner'
import { useRankingsControllerCheckNow, useRankingsControllerHistory, useRankingsControllerSerp } from '@/api/rankings/rankings'
import { RankSource, type TrackedKeywordResponseDto } from '@/api/endpoints.schemas'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { EmptyState, ErrorState, LoadingState } from '@/components/common/state-views'
import { PositionHistoryChart } from './position-history-chart'

const CHECK_NOW_POLL_MS = 3000
const CHECK_NOW_TIMEOUT_MS = 60_000

function todayIso(): string {
  return format(new Date(), 'yyyy-MM-dd')
}

export function KeywordDetailSheet({
  projectId,
  keyword,
  canManage,
  onClose,
}: {
  projectId: string
  keyword: TrackedKeywordResponseDto | null
  canManage: boolean
  onClose: () => void
}) {
  const [serpDate, setSerpDate] = useState(todayIso())
  const [checkingSince, setCheckingSince] = useState<Date | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Keyword değişince (yeni sheet açılınca) tarih ve kontrol durumunu sıfırla; render sırasında
  // önceki id ile karşılaştırıp React'in "state'i prop değişiminde sıfırlama" deseniyle yapılır.
  const [resetForKeywordId, setResetForKeywordId] = useState<string | null>(null)
  if (keyword && keyword.id !== resetForKeywordId) {
    setResetForKeywordId(keyword.id)
    setSerpDate(todayIso())
    setCheckingSince(null)
  }

  const from = format(subDays(new Date(), 30), 'yyyy-MM-dd')
  const to = todayIso()

  const history = useRankingsControllerHistory(
    projectId,
    { keywordIds: keyword ? [keyword.id] : [], from, to },
    { query: { enabled: !!keyword } },
  )

  const serp = useRankingsControllerSerp(
    projectId,
    keyword?.id ?? '',
    { date: serpDate },
    {
      query: {
        enabled: !!keyword,
        refetchInterval: (query) => {
          if (!checkingSince) return false
          const result = query.state.data
          const checkedAt = result?.status === 200 ? new Date(result.data.checkedAt) : null
          if (checkedAt && checkedAt > checkingSince) return false
          return CHECK_NOW_POLL_MS
        },
      },
    },
  )

  const { mutateAsync: checkNow, isPending: isTriggering } = useRankingsControllerCheckNow()

  const completedCheckedAt = serp.data?.status === 200 ? serp.data.data.checkedAt : null
  const isChecking = checkingSince !== null && !(completedCheckedAt && new Date(completedCheckedAt) > checkingSince)

  // Kontrol tamamlandığında (taze `checkedAt` gelince) bir kez bildir; `toastedForRef`
  // aynı `checkingSince` için tekrar tetiklenmeyi engeller. Dış sistemden (polling) gelen
  // veriye tepki verip zamanlayıcıyı temizlemek dışında state set etmiyor.
  const toastedForRef = useRef<Date | null>(null)
  useEffect(() => {
    if (!checkingSince || isChecking || toastedForRef.current === checkingSince) return
    toastedForRef.current = checkingSince
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    toast.success('Kontrol tamamlandı.')
  }, [checkingSince, isChecking])

  async function onCheckNow() {
    if (!keyword) return
    const response = await checkNow({ projectId, keywordId: keyword.id })
    if (response.status === 429) {
      toast.error('Dakikada en fazla 5 anlık kontrol yapabilirsiniz; birazdan tekrar deneyin.')
      return
    }
    if (response.status !== 202) {
      toast.error('Kontrol başlatılamadı.')
      return
    }
    setSerpDate(todayIso())
    setCheckingSince(new Date())
    toast.info('Kontrol kuyruğa alındı; birkaç saniye sürebilir.')
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => {
      setCheckingSince((current) => {
        if (current) toast.warning('Kontrol tamamlanamadı; birazdan tekrar deneyin.')
        return null
      })
    }, CHECK_NOW_TIMEOUT_MS)
  }

  useEffect(() => () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
  }, [])

  const historyPoints = history.data?.status === 200 ? (history.data.data.keywords[0]?.points ?? []) : []
  const serpResult = serp.data?.status === 200 ? serp.data.data : null
  const serpNotFound = serp.data?.status === 404

  return (
    <Sheet open={!!keyword} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full gap-4 overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="break-all">{keyword?.keyword}</SheetTitle>
        </SheetHeader>

        <div className="flex flex-col gap-6 px-4 pb-4">
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">Pozisyon geçmişi (son 30 gün)</h3>
            {history.isPending && <LoadingState rows={2} />}
            {!history.isPending && history.isError && <ErrorState onRetry={() => history.refetch()} />}
            {!history.isPending && !history.isError && historyPoints.every((point) => point.position === null) && (
              <EmptyState title="Bu keyword için geçmiş veri yok" />
            )}
            {!history.isPending && !history.isError && historyPoints.some((point) => point.position !== null) && (
              <PositionHistoryChart points={historyPoints} />
            )}
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-medium">Günün SERP'i</h3>
              {canManage && (
                <Button size="sm" variant="outline" onClick={() => void onCheckNow()} disabled={isTriggering || isChecking}>
                  <RefreshCwIcon className={isChecking ? 'size-4 animate-spin' : 'size-4'} />
                  {isChecking ? 'Kontrol ediliyor…' : 'Şimdi kontrol et'}
                </Button>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="serp-date">Tarih</Label>
              <Input id="serp-date" type="date" value={serpDate} max={todayIso()} onChange={(event) => setSerpDate(event.target.value)} className="max-w-[160px]" />
            </div>

            {serp.isPending && <LoadingState rows={2} />}
            {!serp.isPending && serp.isError && !serpNotFound && <ErrorState onRetry={() => serp.refetch()} />}
            {!serp.isPending && serpNotFound && <EmptyState title="Bu gün için sonuç yok" description="Henüz kontrol edilmemiş olabilir." />}
            {!serp.isPending && serpResult && (
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">
                    Pozisyon: {serpResult.position ?? '20+'}
                  </Badge>
                  <Badge variant="outline">{serpResult.source === RankSource.dfs_live ? 'Anlık' : 'Günlük'}</Badge>
                  {serpResult.serpFeatures.map((feature) => (
                    <Badge key={feature} variant="outline">
                      {feature}
                    </Badge>
                  ))}
                </div>
                {serpResult.url && <p className="max-w-full truncate text-xs text-muted-foreground">{serpResult.url}</p>}

                <div className="flex flex-col gap-1">
                  <p className="text-xs font-medium text-muted-foreground">İlk 10 organik sonuç</p>
                  <ol className="flex flex-col gap-1">
                    {serpResult.competitorsTop.map((competitor) => (
                      <li key={`${competitor.position}-${competitor.domain}`} className="flex items-center gap-2 text-sm">
                        <span className="w-5 shrink-0 text-right text-xs text-muted-foreground tabular-nums">{competitor.position}</span>
                        <span className="truncate">{competitor.domain}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
