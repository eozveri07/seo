import { PencilIcon, TrashIcon } from 'lucide-react'
import { toast } from 'sonner'
import { useAlertRulesControllerDelete } from '@/api/alerts/alerts'
import type { AlertRuleResponseDto, NotificationChannelResponseDto } from '@/api/endpoints.schemas'
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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { AlertRuleDialog } from './alert-rule-dialog'
import { ALERT_RULE_TYPE_LABELS } from './alert-rule-labels'

export function AlertRuleTable({
  projectId,
  rules,
  channelsById,
  onChanged,
}: {
  projectId: string
  rules: AlertRuleResponseDto[]
  channelsById: Map<string, NotificationChannelResponseDto>
  onChanged: () => void
}) {
  const { mutateAsync: deleteRule } = useAlertRulesControllerDelete()

  async function handleDelete(id: string) {
    const response = await deleteRule({ projectId, ruleId: id })
    if (response.status !== 204) {
      toast.error('Kural silinemedi.')
      return
    }
    toast.success('Kural silindi.')
    onChanged()
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Ad</TableHead>
          <TableHead>Tip</TableHead>
          <TableHead>Kanallar</TableHead>
          <TableHead>Cooldown</TableHead>
          <TableHead>Durum</TableHead>
          <TableHead className="text-right">Aksiyonlar</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rules.map((rule) => (
          <TableRow key={rule.id}>
            <TableCell className="font-medium">{rule.name}</TableCell>
            <TableCell>{ALERT_RULE_TYPE_LABELS[rule.type]}</TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {rule.channels.map((id) => channelsById.get(id)?.name ?? '—').join(', ') || '—'}
            </TableCell>
            <TableCell>{rule.cooldownHours} sa</TableCell>
            <TableCell>
              <Badge variant={rule.isActive ? 'default' : 'outline'}>{rule.isActive ? 'Aktif' : 'Pasif'}</Badge>
            </TableCell>
            <TableCell>
              <div className="flex justify-end gap-2">
                <AlertRuleDialog
                  projectId={projectId}
                  rule={rule}
                  onSaved={onChanged}
                  trigger={
                    <Button variant="ghost" size="icon" aria-label="Kuralı düzenle">
                      <PencilIcon className="size-4" />
                    </Button>
                  }
                />
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label="Kuralı sil">
                      <TrashIcon className="size-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Kuralı sil</AlertDialogTitle>
                      <AlertDialogDescription>{rule.name} silinecek.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Vazgeç</AlertDialogCancel>
                      <AlertDialogAction onClick={() => void handleDelete(rule.id)}>Sil</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
