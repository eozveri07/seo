import { useState } from 'react'
import { SparklesIcon } from 'lucide-react'
import { toast } from 'sonner'
import { useTrackedKeywordsControllerBulkAdd, useTrackedKeywordsControllerSuggestions } from '@/api/keywords/keywords'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { EmptyState, ErrorState, LoadingState } from '@/components/common/state-views'

export function SuggestionsDialog({ projectId, onAdded }: { projectId: string; onAdded: () => void }) {
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const { data, isPending, isError, refetch } = useTrackedKeywordsControllerSuggestions(projectId, { limit: 50 }, { query: { enabled: open } })
  const { mutateAsync, isPending: isAdding } = useTrackedKeywordsControllerBulkAdd()

  const items = data?.status === 200 ? data.data.items : []

  function toggle(query: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (checked) next.add(query)
      else next.delete(query)
      return next
    })
  }

  async function onTakeover() {
    if (selected.size === 0) return
    const response = await mutateAsync({ projectId, data: { text: Array.from(selected).join('\n') } })
    if (response.status !== 201) {
      toast.error('Öneriler takibe alınamadı.')
      return
    }
    toast.success(`${response.data.added} keyword takibe alındı.`)
    setSelected(new Set())
    setOpen(false)
    onAdded()
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setSelected(new Set())
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <SparklesIcon className="size-4" />
          GSC önerileri
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>GSC önerileri</DialogTitle>
          <DialogDescription>Son 28 günde gösterimi yüksek, henüz takip edilmeyen sorgular.</DialogDescription>
        </DialogHeader>

        {isPending && <LoadingState rows={4} />}
        {!isPending && isError && <ErrorState onRetry={() => refetch()} />}
        {!isPending && !isError && items.length === 0 && <EmptyState title="Öneri yok" description="GSC bağlantısı veya veri henüz olmayabilir." />}
        {!isPending && !isError && items.length > 0 && (
          <div className="max-h-96 overflow-y-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10" />
                  <TableHead>Sorgu</TableHead>
                  <TableHead className="text-right">Gösterim</TableHead>
                  <TableHead className="text-right">Tıklama</TableHead>
                  <TableHead className="text-right">Pozisyon</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.query} className="cursor-pointer" onClick={() => toggle(item.query, !selected.has(item.query))}>
                    <TableCell onClick={(event) => event.stopPropagation()}>
                      <Checkbox
                        checked={selected.has(item.query)}
                        onCheckedChange={(checked) => toggle(item.query, checked === true)}
                        aria-label={`${item.query} seç`}
                      />
                    </TableCell>
                    <TableCell className="max-w-xs truncate text-sm" title={item.query}>
                      {item.query}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{item.impressions.toLocaleString('tr-TR')}</TableCell>
                    <TableCell className="text-right tabular-nums">{item.clicks.toLocaleString('tr-TR')}</TableCell>
                    <TableCell className="text-right tabular-nums">{item.position.toFixed(1)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <DialogFooter>
          <Button onClick={() => void onTakeover()} disabled={selected.size === 0 || isAdding}>
            {selected.size > 0 ? `${selected.size} keyword'ü takibe al` : 'Takibe al'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
