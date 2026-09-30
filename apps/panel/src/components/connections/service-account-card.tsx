import { CheckIcon, CopyIcon } from 'lucide-react'
import { useState } from 'react'
import { useConnectionControllerGetServiceAccount } from '@/api/connections/connections'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'

export function ServiceAccountCard() {
  const { data, isPending, isError } = useConnectionControllerGetServiceAccount()
  const [copied, setCopied] = useState(false)

  const email = data?.status === 200 ? data.data.email : null

  async function copyEmail() {
    if (!email) return
    await navigator.clipboard.writeText(email)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Service account</CardTitle>
        <CardDescription>
          GSC ve GA4 üzerinde bu adrese görüntüleyici erişimi verin, ardından aşağıdan bağlanın.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isPending && <Skeleton className="h-9 w-full" />}
        {!isPending && isError && <p className="text-sm text-destructive">Service account adresi alınamadı.</p>}
        {!isPending && email && (
          <div className="flex gap-2">
            <Input value={email} readOnly />
            <Button type="button" variant="outline" size="icon" onClick={() => void copyEmail()} aria-label="Kopyala">
              {copied ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
