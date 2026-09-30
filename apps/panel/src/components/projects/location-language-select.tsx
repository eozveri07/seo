import { useMemo } from 'react'
import { useLocationsControllerList } from '@/api/locations/locations'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'

export function LocationLanguageSelect({
  locationCode,
  languageCode,
  onChange,
}: {
  locationCode: number | undefined
  languageCode: string | undefined
  onChange: (value: { locationCode: number | undefined; languageCode: string | undefined }) => void
}) {
  const { data, isPending, isError } = useLocationsControllerList()
  const items = useMemo(() => (data?.status === 200 ? data.data.items : []), [data])

  const locations = useMemo(() => {
    const seen = new Map<number, string>()
    for (const item of items) {
      if (!seen.has(item.locationCode)) seen.set(item.locationCode, item.locationName)
    }
    return Array.from(seen.entries()).map(([code, name]) => ({ code, name }))
  }, [items])

  const languageOptions = useMemo(
    () => items.filter((item) => item.locationCode === locationCode),
    [items, locationCode],
  )

  if (isPending) {
    return (
      <div className="flex gap-2">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
      </div>
    )
  }

  if (isError) {
    return <p className="text-sm text-destructive">Lokasyon listesi yüklenemedi.</p>
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      <Select
        value={locationCode !== undefined ? String(locationCode) : undefined}
        onValueChange={(value) => {
          const nextLocationCode = Number(value)
          const firstLanguage = items.find((item) => item.locationCode === nextLocationCode)?.languageCode
          onChange({ locationCode: nextLocationCode, languageCode: firstLanguage })
        }}
      >
        <SelectTrigger>
          <SelectValue placeholder="Lokasyon seçin" />
        </SelectTrigger>
        <SelectContent>
          {locations.map((location) => (
            <SelectItem key={location.code} value={String(location.code)}>
              {location.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={languageCode}
        disabled={locationCode === undefined}
        onValueChange={(value) => onChange({ locationCode, languageCode: value })}
      >
        <SelectTrigger>
          <SelectValue placeholder="Dil seçin" />
        </SelectTrigger>
        <SelectContent>
          {languageOptions.map((option) => (
            <SelectItem key={option.languageCode} value={option.languageCode}>
              {option.languageName}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
