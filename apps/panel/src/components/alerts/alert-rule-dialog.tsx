import { useState } from 'react'
import { PlusIcon } from 'lucide-react'
import { toast } from 'sonner'
import {
  useAlertRulesControllerCreate,
  useAlertRulesControllerUpdate,
} from '@/api/alerts/alerts'
import type { AlertRuleResponseDto } from '@/api/endpoints.schemas'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { AlertRuleForm, type AlertRuleSubmitPayload } from './alert-rule-form'

export function AlertRuleDialog({
  projectId,
  rule,
  onSaved,
  trigger,
}: {
  projectId: string
  rule?: AlertRuleResponseDto
  onSaved: () => void
  trigger?: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const { mutateAsync: createRule } = useAlertRulesControllerCreate()
  const { mutateAsync: updateRule } = useAlertRulesControllerUpdate()

  async function handleSubmit(payload: AlertRuleSubmitPayload) {
    const response = rule
      ? await updateRule({ projectId, ruleId: rule.id, data: payload })
      : await createRule({ projectId, data: payload })
    if (response.status !== 200 && response.status !== 201) {
      toast.error('Kural kaydedilemedi.')
      return
    }
    toast.success(rule ? 'Kural güncellendi.' : 'Kural eklendi.')
    setOpen(false)
    onSaved()
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm">
            <PlusIcon className="size-4" />
            Kural ekle
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{rule ? 'Kuralı düzenle' : 'Yeni alert kuralı'}</DialogTitle>
        </DialogHeader>
        <AlertRuleForm
          projectId={projectId}
          rule={rule}
          onSubmit={handleSubmit}
          submitLabel={rule ? 'Kaydet' : 'Ekle'}
        />
      </DialogContent>
    </Dialog>
  )
}
