import { useState } from 'react'
import { CheckIcon, FolderCogIcon, PencilIcon, PlusIcon, TrashIcon } from 'lucide-react'
import { toast } from 'sonner'
import {
  useKeywordGroupsControllerCreate,
  useKeywordGroupsControllerDelete,
  useKeywordGroupsControllerUpdate,
} from '@/api/keywords/keywords'
import type { KeywordGroupResponseDto } from '@/api/endpoints.schemas'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

const PRESET_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899']

function ColorSwatches({ value, onChange }: { value: string | null; onChange: (color: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {PRESET_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          aria-label={`Renk ${color}`}
          onClick={() => onChange(color)}
          className={cn('flex size-6 items-center justify-center rounded-full border', value === color && 'ring-2 ring-ring ring-offset-2 ring-offset-background')}
          style={{ backgroundColor: color }}
        >
          {value === color && <CheckIcon className="size-3.5 text-white" />}
        </button>
      ))}
    </div>
  )
}

function GroupRow({ group, canManage, onChanged }: { group: KeywordGroupResponseDto; canManage: boolean; onChanged: () => void }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(group.name)
  const [color, setColor] = useState<string | null>(group.color)
  const { mutateAsync: updateGroup, isPending: isUpdating } = useKeywordGroupsControllerUpdate()
  const { mutateAsync: deleteGroup } = useKeywordGroupsControllerDelete()

  async function onSave() {
    if (!name.trim()) return
    const response = await updateGroup({ projectId: group.projectId, groupId: group.id, data: { name: name.trim(), color: color ?? undefined } })
    if (response.status !== 200) {
      toast.error('Grup güncellenemedi.')
      return
    }
    toast.success('Grup güncellendi.')
    setEditing(false)
    onChanged()
  }

  async function onDelete() {
    const response = await deleteGroup({ projectId: group.projectId, groupId: group.id })
    if (response.status !== 204) {
      toast.error('Grup silinemedi.')
      return
    }
    toast.success('Grup silindi.')
    onChanged()
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-2 rounded-md border p-3">
        <Input value={name} onChange={(event) => setName(event.target.value)} maxLength={200} />
        <ColorSwatches value={color} onChange={setColor} />
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => setEditing(false)}>
            Vazgeç
          </Button>
          <Button size="sm" onClick={() => void onSave()} disabled={isUpdating}>
            Kaydet
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-between gap-2 rounded-md border p-3">
      <div className="flex items-center gap-2">
        <span className="size-3 shrink-0 rounded-full border" style={{ backgroundColor: group.color ?? 'transparent' }} />
        <span className="text-sm font-medium">{group.name}</span>
      </div>
      {canManage && (
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" aria-label="Grubu düzenle" onClick={() => setEditing(true)}>
            <PencilIcon className="size-4" />
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Grubu sil">
                <TrashIcon className="size-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Grubu sil</AlertDialogTitle>
                <AlertDialogDescription>
                  {group.name} silinecek; bu gruptaki keyword'ler grupsuz kalır.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Vazgeç</AlertDialogCancel>
                <AlertDialogAction onClick={() => void onDelete()}>Sil</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </div>
  )
}

export function GroupManageDialog({
  projectId,
  groups,
  canManage,
  onChanged,
}: {
  projectId: string
  groups: KeywordGroupResponseDto[]
  canManage: boolean
  onChanged: () => void
}) {
  const [open, setOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState<string | null>(null)
  const { mutateAsync: createGroup, isPending: isCreating } = useKeywordGroupsControllerCreate()

  async function onCreate() {
    if (!newName.trim()) return
    const response = await createGroup({ projectId, data: { name: newName.trim(), color: newColor ?? undefined } })
    if (response.status !== 201) {
      toast.error('Grup oluşturulamadı.')
      return
    }
    toast.success('Grup oluşturuldu.')
    setNewName('')
    setNewColor(null)
    onChanged()
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <FolderCogIcon className="size-4" />
          Grupları yönet
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Keyword grupları</DialogTitle>
          <DialogDescription>Gruplar keyword tablosunda ve filtrede kullanılır.</DialogDescription>
        </DialogHeader>

        <div className="flex max-h-80 flex-col gap-2 overflow-y-auto">
          {groups.length === 0 && <p className="text-sm text-muted-foreground">Henüz grup yok.</p>}
          {groups.map((group) => (
            <GroupRow key={group.id} group={group} canManage={canManage} onChanged={onChanged} />
          ))}
        </div>

        {canManage && (
          <div className="flex flex-col gap-2 border-t pt-4">
            <Input placeholder="Yeni grup adı" value={newName} onChange={(event) => setNewName(event.target.value)} maxLength={200} />
            <ColorSwatches value={newColor} onChange={setNewColor} />
            <Button size="sm" onClick={() => void onCreate()} disabled={!newName.trim() || isCreating} className="self-end">
              <PlusIcon className="size-4" />
              Grup ekle
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
