import { zodResolver } from '@hookform/resolvers/zod'
import type { ComponentProps } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'
import { useKeywordGroupsControllerList } from '@/api/keywords/keywords'
import { useNotificationChannelsControllerList } from '@/api/alerts/alerts'
import { AlertRuleType, type AlertRuleResponseDto } from '@/api/endpoints.schemas'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ALERT_RULE_TYPE_LABELS } from './alert-rule-labels'

const NO_GROUP = '__all__'

/** `z.coerce.number()` alanları react-hook-form'da `unknown` value taşır; Input'a bağlarken sayıya çevrilir. */
function NumberField({
  field,
  ...props
}: { field: { value: unknown; onChange: (value: string) => void; onBlur: () => void; name: string } } & Omit<
  ComponentProps<typeof Input>,
  'value' | 'onChange' | 'onBlur' | 'name'
>) {
  return (
    <Input
      {...props}
      name={field.name}
      value={field.value === undefined || field.value === null ? '' : String(field.value)}
      onChange={(event) => field.onChange(event.target.value)}
      onBlur={field.onBlur}
    />
  )
}

const baseFields = {
  name: z.string().min(1, 'Ad gerekli').max(200),
  channels: z.array(z.string()).min(1, 'En az bir bildirim kanalı seçin'),
  isActive: z.boolean(),
  cooldownHours: z.coerce.number().int().min(1).max(168),
}

const rankDropSchema = z.object({
  type: z.literal(AlertRuleType.rank_drop),
  ...baseFields,
  groupId: z.string().optional(),
  minDrop: z.coerce.number().int().min(1),
  fromTop: z.coerce.number().int().min(1),
})

const rankExitSchema = z.object({
  type: z.literal(AlertRuleType.rank_exit),
  ...baseFields,
  groupId: z.string().optional(),
  top: z.coerce.number().int().min(1),
  days: z.coerce.number().int().min(1),
})

const trafficDropSchema = z.object({
  type: z.literal(AlertRuleType.traffic_drop),
  ...baseFields,
  metric: z.enum(['clicks', 'sessions']),
  pct: z.coerce.number().min(1).max(100),
  window: z.coerce.number().int().min(1).max(90),
})

const syncFailureSchema = z.object({
  type: z.literal(AlertRuleType.sync_failure),
  ...baseFields,
})

const schema = z.discriminatedUnion('type', [
  rankDropSchema,
  rankExitSchema,
  trafficDropSchema,
  syncFailureSchema,
])

type AlertRuleFormInput = z.input<typeof schema>
export type AlertRuleFormValues = z.output<typeof schema>

export interface AlertRuleSubmitPayload {
  name: string
  type: AlertRuleType
  config: Record<string, unknown>
  channels: string[]
  isActive: boolean
  cooldownHours: number
}

function toDefaultValues(rule?: AlertRuleResponseDto): AlertRuleFormValues {
  if (!rule) {
    return {
      type: AlertRuleType.rank_drop,
      name: '',
      channels: [],
      isActive: true,
      cooldownHours: 24,
      groupId: undefined,
      minDrop: 3,
      fromTop: 10,
    }
  }
  const base = {
    name: rule.name,
    channels: rule.channels,
    isActive: rule.isActive,
    cooldownHours: rule.cooldownHours,
  }
  const config = rule.config as Record<string, unknown>
  switch (rule.type) {
    case AlertRuleType.rank_drop:
      return {
        type: AlertRuleType.rank_drop,
        ...base,
        groupId: config.groupId as string | undefined,
        minDrop: (config.minDrop as number) ?? 3,
        fromTop: (config.fromTop as number) ?? 10,
      }
    case AlertRuleType.rank_exit:
      return {
        type: AlertRuleType.rank_exit,
        ...base,
        groupId: config.groupId as string | undefined,
        top: (config.top as number) ?? 10,
        days: (config.days as number) ?? 3,
      }
    case AlertRuleType.traffic_drop:
      return {
        type: AlertRuleType.traffic_drop,
        ...base,
        metric: (config.metric as 'clicks' | 'sessions') ?? 'clicks',
        pct: (config.pct as number) ?? 25,
        window: (config.window as number) ?? 7,
      }
    case AlertRuleType.sync_failure:
      return { type: AlertRuleType.sync_failure, ...base }
  }
}

function blankValuesForType(
  type: AlertRuleType,
  base: { name: string; channels: string[]; isActive: boolean; cooldownHours: number },
): AlertRuleFormValues {
  switch (type) {
    case AlertRuleType.rank_drop:
      return { type, ...base, groupId: undefined, minDrop: 3, fromTop: 10 }
    case AlertRuleType.rank_exit:
      return { type, ...base, groupId: undefined, top: 10, days: 3 }
    case AlertRuleType.traffic_drop:
      return { type, ...base, metric: 'clicks', pct: 25, window: 7 }
    case AlertRuleType.sync_failure:
      return { type, ...base }
  }
}

export function AlertRuleForm({
  projectId,
  rule,
  onSubmit,
  submitLabel,
}: {
  projectId: string
  rule?: AlertRuleResponseDto
  onSubmit: (payload: AlertRuleSubmitPayload) => Promise<void>
  submitLabel: string
}) {
  const form = useForm<AlertRuleFormInput, unknown, AlertRuleFormValues>({
    resolver: zodResolver(schema),
    defaultValues: toDefaultValues(rule),
  })
  const type = form.watch('type')

  const { data: groupsData } = useKeywordGroupsControllerList(projectId, { page: 1, limit: 200 })
  const groups = groupsData?.status === 200 ? groupsData.data.items : []
  const { data: channelsData } = useNotificationChannelsControllerList()
  const channels = channelsData?.status === 200 ? channelsData.data.items : []

  async function handleSubmit(values: AlertRuleFormValues) {
    let config: Record<string, unknown>
    switch (values.type) {
      case AlertRuleType.rank_drop:
        config = { groupId: values.groupId || undefined, minDrop: values.minDrop, fromTop: values.fromTop }
        break
      case AlertRuleType.rank_exit:
        config = { groupId: values.groupId || undefined, top: values.top, days: values.days }
        break
      case AlertRuleType.traffic_drop:
        config = { metric: values.metric, pct: values.pct, window: values.window }
        break
      case AlertRuleType.sync_failure:
        config = {}
        break
    }
    await onSubmit({
      name: values.name,
      type: values.type,
      config,
      channels: values.channels,
      isActive: values.isActive,
      cooldownHours: values.cooldownHours,
    })
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="flex flex-col gap-4">
        <FormField
          control={form.control}
          name="type"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Kural tipi</FormLabel>
              <Select
                value={field.value}
                onValueChange={(value) => {
                  const current = form.getValues()
                  form.reset(
                    blankValuesForType(value as AlertRuleType, {
                      name: current.name,
                      channels: current.channels,
                      isActive: current.isActive,
                      cooldownHours: Number(current.cooldownHours) || 24,
                    }),
                  )
                }}
                disabled={Boolean(rule)}
              >
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {Object.values(AlertRuleType).map((value) => (
                    <SelectItem key={value} value={value}>
                      {ALERT_RULE_TYPE_LABELS[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Kural adı</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {(type === AlertRuleType.rank_drop || type === AlertRuleType.rank_exit) && (
          <Controller
            control={form.control}
            name="groupId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Keyword grubu</FormLabel>
                <Select
                  value={field.value ?? NO_GROUP}
                  onValueChange={(value) => field.onChange(value === NO_GROUP ? undefined : value)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_GROUP}>Tüm keyword'ler</SelectItem>
                    {groups.map((group) => (
                      <SelectItem key={group.id} value={group.id}>
                        {group.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormItem>
            )}
          />
        )}

        {type === AlertRuleType.rank_drop && (
          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="minDrop"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>En az kaç sıra düşüş</FormLabel>
                  <FormControl>
                    <NumberField field={field} type="number" min={1} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="fromTop"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Önceki pozisyon top kaç içinde</FormLabel>
                  <FormControl>
                    <NumberField field={field} type="number" min={1} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        )}

        {type === AlertRuleType.rank_exit && (
          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="top"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Top kaç</FormLabel>
                  <FormControl>
                    <NumberField field={field} type="number" min={1} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="days"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Kaç gündür</FormLabel>
                  <FormControl>
                    <NumberField field={field} type="number" min={1} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        )}

        {type === AlertRuleType.traffic_drop && (
          <div className="grid grid-cols-3 gap-4">
            <Controller
              control={form.control}
              name="metric"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Metrik</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="clicks">Tıklama (GSC)</SelectItem>
                      <SelectItem value="sessions">Oturum (GA4)</SelectItem>
                    </SelectContent>
                  </Select>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="pct"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Düşüş yüzdesi</FormLabel>
                  <FormControl>
                    <NumberField field={field} type="number" min={1} max={100} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="window"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Pencere (gün)</FormLabel>
                  <FormControl>
                    <NumberField field={field} type="number" min={1} max={90} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        )}

        <FormField
          control={form.control}
          name="channels"
          render={() => (
            <FormItem>
              <FormLabel>Bildirim kanalları</FormLabel>
              <div className="flex flex-col gap-2">
                {channels.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    Önce Bildirim kanalları sayfasından bir kanal ekleyin.
                  </p>
                )}
                {channels.map((channel) => (
                  <Controller
                    key={channel.id}
                    control={form.control}
                    name="channels"
                    render={({ field }) => (
                      <label className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={field.value.includes(channel.id)}
                          onCheckedChange={(checked) =>
                            field.onChange(
                              checked
                                ? [...field.value, channel.id]
                                : field.value.filter((id) => id !== channel.id),
                            )
                          }
                        />
                        {channel.name}
                      </label>
                    )}
                  />
                ))}
              </div>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="cooldownHours"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Cooldown (saat)</FormLabel>
                <FormControl>
                  <NumberField field={field} type="number" min={1} max={168} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="flex items-end pb-2">
            <Controller
              control={form.control}
              name="isActive"
              render={({ field }) => (
                <Label className="flex items-center gap-2">
                  <Checkbox checked={field.value} onCheckedChange={(checked) => field.onChange(checked === true)} />
                  Aktif
                </Label>
              )}
            />
          </div>
        </div>

        <Button type="submit" disabled={form.formState.isSubmitting} className="self-start">
          {submitLabel}
        </Button>
      </form>
    </Form>
  )
}
