import { ArrowDownIcon, ArrowUpIcon, ArrowUpDownIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export function SortableHeader({
  label,
  field,
  activeField,
  order,
  onSort,
  align,
}: {
  label: string
  field: string
  activeField: string
  order: 'asc' | 'desc'
  onSort: (field: string) => void
  align?: 'right'
}) {
  const isActive = field === activeField
  const Icon = !isActive ? ArrowUpDownIcon : order === 'asc' ? ArrowUpIcon : ArrowDownIcon

  return (
    <button
      type="button"
      onClick={() => onSort(field)}
      className={cn(
        'inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground',
        align === 'right' && 'flex-row-reverse',
      )}
    >
      {label}
      <Icon className="size-3" />
    </button>
  )
}
