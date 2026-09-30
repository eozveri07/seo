import { useMemo, useState } from 'react'
import { PlusIcon } from 'lucide-react'
import { toast } from 'sonner'
import { useTrackedKeywordsControllerBulkAdd } from '@/api/keywords/keywords'
import type { BulkAddKeywordsResponseDto, TrackedKeywordsControllerListDevice } from '@/api/endpoints.schemas'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'

interface PreviewRow {
  line: number
  keyword: string
  groupName: string | null
  device: string
  targetUrl: string | null
  isValid: boolean
}

/** Backend parse'ının basitleştirilmiş istemci önizlemesi (tırnaklı CSV alanları desteklenmez); geçerlilik son sözü sunucudadır. */
function parsePreview(text: string, defaultGroupName: string, defaultDevice: string): PreviewRow[] {
  return text
    .split(/\r\n|\r|\n/)
    .map((raw, index) => ({ raw: raw.trim(), line: index + 1 }))
    .filter((row) => row.raw.length > 0)
    .map(({ raw, line }) => {
      const columns = raw.split(',').map((column) => column.trim())
      const [keyword, groupName, device, targetUrl] = columns
      return {
        line,
        keyword: keyword ?? '',
        groupName: groupName || defaultGroupName || null,
        device: device || defaultDevice,
        targetUrl: targetUrl || null,
        isValid: Boolean(keyword),
      }
    })
}

export function BulkAddDialog({ projectId, onAdded }: { projectId: string; onAdded: () => void }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [defaultGroupName, setDefaultGroupName] = useState('')
  const [defaultDevice, setDefaultDevice] = useState<TrackedKeywordsControllerListDevice>('desktop')
  const [result, setResult] = useState<BulkAddKeywordsResponseDto | null>(null)

  const { mutateAsync, isPending } = useTrackedKeywordsControllerBulkAdd()

  const preview = useMemo(() => parsePreview(text, defaultGroupName, defaultDevice), [text, defaultGroupName, defaultDevice])
  const invalidCount = preview.filter((row) => !row.isValid).length

  function reset() {
    setText('')
    setDefaultGroupName('')
    setDefaultDevice('desktop')
    setResult(null)
  }

  async function onSubmit() {
    if (preview.length === 0) return
    const response = await mutateAsync({
      projectId,
      data: { text, defaultGroupName: defaultGroupName || undefined, defaultDevice },
    })
    if (response.status !== 201) {
      toast.error('Toplu ekleme başarısız oldu.')
      return
    }
    setResult(response.data)
    if (response.data.added > 0) {
      toast.success(`${response.data.added} keyword eklendi.`)
      onAdded()
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) reset()
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">
          <PlusIcon className="size-4" />
          Toplu ekle
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Toplu keyword ekle</DialogTitle>
          <DialogDescription>
            Her satıra bir keyword yazın, ya da <code>keyword,grup,cihaz,hedef url</code> biçiminde CSV yapıştırın.
          </DialogDescription>
        </DialogHeader>

        {!result ? (
          <div className="flex flex-col gap-4">
            <Textarea
              placeholder={'seo aracı\nkeyword takibi,İzleme,desktop,https://example.com/seo'}
              value={text}
              onChange={(event) => setText(event.target.value)}
              rows={8}
            />
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="bulk-default-group">Varsayılan grup</Label>
                <Input
                  id="bulk-default-group"
                  placeholder="Grupsuz"
                  value={defaultGroupName}
                  onChange={(event) => setDefaultGroupName(event.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Varsayılan cihaz</Label>
                <Select value={defaultDevice} onValueChange={(value) => setDefaultDevice(value as TrackedKeywordsControllerListDevice)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="desktop">Masaüstü</SelectItem>
                    <SelectItem value="mobile">Mobil</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {preview.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-sm font-medium">
                  Önizleme — {preview.length} satır{invalidCount > 0 && `, ${invalidCount} hatalı`}
                </p>
                <div className="max-h-48 overflow-y-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10">#</TableHead>
                        <TableHead>Keyword</TableHead>
                        <TableHead>Grup</TableHead>
                        <TableHead>Cihaz</TableHead>
                        <TableHead>Hedef URL</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {preview.map((row) => (
                        <TableRow key={row.line} className={!row.isValid ? 'bg-destructive/10' : undefined}>
                          <TableCell className="text-xs text-muted-foreground">{row.line}</TableCell>
                          <TableCell className="text-sm">{row.keyword || <span className="text-destructive">Keyword boş</span>}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{row.groupName ?? '—'}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{row.device}</TableCell>
                          <TableCell className="max-w-[160px] truncate text-xs text-muted-foreground">{row.targetUrl ?? '—'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            <DialogFooter>
              <Button onClick={() => void onSubmit()} disabled={preview.length === 0 || isPending}>
                {preview.length > 0 ? `${preview.length} keyword ekle` : 'Ekle'}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3 text-center">
              <div className="rounded-md border p-3">
                <p className="text-2xl font-semibold text-success">{result.added}</p>
                <p className="text-xs text-muted-foreground">Eklendi</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-2xl font-semibold text-muted-foreground">{result.skipped}</p>
                <p className="text-xs text-muted-foreground">Atlandı / hatalı</p>
              </div>
            </div>
            {result.errors.length > 0 && (
              <div className="max-h-48 overflow-y-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-16">Satır</TableHead>
                      <TableHead>Mesaj</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.errors.map((error) => (
                      <TableRow key={error.line}>
                        <TableCell className="text-xs text-muted-foreground">{error.line}</TableCell>
                        <TableCell className="text-sm">{error.message}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={reset}>
                Yeniden ekle
              </Button>
              <Button onClick={() => setOpen(false)}>Kapat</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
