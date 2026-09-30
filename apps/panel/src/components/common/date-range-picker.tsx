import { useState } from 'react'
import { format, subDays } from 'date-fns'
import { tr } from 'date-fns/locale'
import { CalendarIcon } from 'lucide-react'
import type { DateRange } from 'react-day-picker'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

export type DateRangeValue = { from: string; to: string }

const presets: { label: string; days: number }[] = [
  { label: 'Son 7 gün', days: 7 },
  { label: 'Son 28 gün', days: 28 },
  { label: 'Son 90 gün', days: 90 },
]

function toIso(date: Date): string {
  return format(date, 'yyyy-MM-dd')
}

export function DateRangePicker({
  value,
  onChange,
}: {
  value: DateRangeValue
  onChange: (value: DateRangeValue) => void
}) {
  const [open, setOpen] = useState(false)
  const selected: DateRange = { from: new Date(value.from), to: new Date(value.to) }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="justify-start font-normal">
          <CalendarIcon className="size-4" />
          {format(selected.from!, 'd MMM yyyy', { locale: tr })} – {format(selected.to!, 'd MMM yyyy', { locale: tr })}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <div className="flex flex-col gap-2 p-3 sm:flex-row">
          <div className="flex flex-row gap-1 sm:flex-col">
            {presets.map((preset) => (
              <Button
                key={preset.days}
                type="button"
                variant="ghost"
                size="sm"
                className="justify-start"
                onClick={() => {
                  const to = new Date()
                  const from = subDays(to, preset.days - 1)
                  onChange({ from: toIso(from), to: toIso(to) })
                  setOpen(false)
                }}
              >
                {preset.label}
              </Button>
            ))}
          </div>
          <Calendar
            mode="range"
            selected={selected}
            defaultMonth={selected.from}
            numberOfMonths={2}
            locale={tr}
            disabled={{ after: new Date() }}
            onSelect={(range) => {
              if (range?.from && range?.to) {
                onChange({ from: toIso(range.from), to: toIso(range.to) })
              }
            }}
          />
        </div>
      </PopoverContent>
    </Popover>
  )
}
