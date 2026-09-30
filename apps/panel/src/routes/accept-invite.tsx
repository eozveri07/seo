import { zodResolver } from '@hookform/resolvers/zod'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { authControllerLogin, authControllerRegisterInvited } from '@/api/auth/auth'
import type { InvitationPreviewResponseDto, OrgRole, UserResponseDto } from '@/api/endpoints.schemas'
import { invitationsControllerAccept, invitationsControllerPreview } from '@/api/invitations/invitations'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { LoadingState } from '@/components/common/state-views'
import { useAuth } from '@/lib/auth/auth-context'
import { useOrg } from '@/lib/auth/org-context'

export const Route = createFileRoute('/accept-invite')({
  validateSearch: (search: Record<string, unknown>) => ({ token: String(search.token ?? '') }),
  component: AcceptInvitePage,
})

const roleLabels: Record<OrgRole, string> = {
  owner: 'Sahip',
  admin: 'Yönetici',
  analyst: 'Analist',
  client_viewer: 'Müşteri görüntüleyici',
}

function AcceptInvitePage() {
  const { token } = Route.useSearch()
  const { status, setSession } = useAuth()
  const { switchOrg, refetch: refetchOrgs } = useOrg()
  const navigate = useNavigate()

  const [preview, setPreview] = useState<InvitationPreviewResponseDto | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function loadPreview() {
      if (!token) {
        setPreviewError('Davet bağlantısı eksik ya da geçersiz.')
        setLoadingPreview(false)
        return
      }
      setLoadingPreview(true)
      try {
        const response = await invitationsControllerPreview({ token })
        if (cancelled) return
        if (response.status === 200) {
          setPreview(response.data)
        } else if (response.status === 410) {
          setPreviewError('Bu davetin süresi dolmuş.')
        } else if (response.status === 409) {
          setPreviewError('Bu davet zaten kullanılmış.')
        } else {
          setPreviewError('Davet bulunamadı.')
        }
      } catch {
        if (!cancelled) setPreviewError('Davet bilgisi alınamadı, tekrar deneyin.')
      } finally {
        if (!cancelled) setLoadingPreview(false)
      }
    }

    void loadPreview()
    return () => {
      cancelled = true
    }
  }, [token])

  async function acceptForExistingUser() {
    const response = await invitationsControllerAccept({ token }).catch(() => null)
    if (!response || response.status !== 200) {
      setPreviewError('Davet kabul edilemedi, tekrar deneyin.')
      return
    }
    switchOrg(response.data.organizationId)
    refetchOrgs()
    void navigate({ to: '/' })
  }

  if (loadingPreview) {
    return (
      <div className="mx-auto flex min-h-svh max-w-md items-center justify-center p-4">
        <LoadingState rows={2} />
      </div>
    )
  }

  if (previewError || !preview) {
    return (
      <div className="flex min-h-svh items-center justify-center p-4">
        <Card className="w-full max-w-sm border-destructive">
          <CardHeader>
            <CardTitle>Davet geçersiz</CardTitle>
            <CardDescription>{previewError ?? 'Davet bulunamadı.'}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex min-h-svh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{preview.organizationName}</CardTitle>
          <CardDescription>
            {preview.email} adresine {roleLabels[preview.role]} rolüyle davet edildiniz.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {preview.userExists ? (
            status === 'authenticated' ? (
              <Button className="w-full" onClick={() => void acceptForExistingUser()}>
                Daveti kabul et
              </Button>
            ) : (
              <ExistingUserLoginForm
                email={preview.email}
                onLoggedIn={(accessToken, user) => {
                  setSession(accessToken, user)
                  void acceptForExistingUser()
                }}
              />
            )
          ) : (
            <NewUserForm
              token={token}
              onRegistered={(accessToken, user) => {
                setSession(accessToken, user)
                void navigate({ to: '/' })
              }}
            />
          )}
        </CardContent>
      </Card>
    </div>
  )
}

const loginSchema = z.object({
  password: z.string().min(1, 'Şifre gerekli'),
})

function ExistingUserLoginForm({
  email,
  onLoggedIn,
}: {
  email: string
  onLoggedIn: (accessToken: string, user: UserResponseDto) => void
}) {
  const form = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: { password: '' },
  })
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(values: z.infer<typeof loginSchema>) {
    setError(null)
    const response = await authControllerLogin({ email, password: values.password }).catch(() => null)
    if (!response || response.status !== 200) {
      setError('E-posta veya şifre hatalı.')
      return
    }
    onLoggedIn(response.data.accessToken, response.data.user)
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">Bu e-posta ile zaten bir hesabınız var. Devam etmek için giriş yapın.</p>
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Şifre</FormLabel>
              <FormControl>
                <Input type="password" autoComplete="current-password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={form.formState.isSubmitting}>
          Giriş yap ve katıl
        </Button>
      </form>
    </Form>
  )
}

const registerSchema = z.object({
  name: z.string().min(1, 'Ad gerekli').max(200),
  password: z.string().min(8, 'En az 8 karakter').max(256),
})

function NewUserForm({
  token,
  onRegistered,
}: {
  token: string
  onRegistered: (accessToken: string, user: UserResponseDto) => void
}) {
  const form = useForm<z.infer<typeof registerSchema>>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: '', password: '' },
  })
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(values: z.infer<typeof registerSchema>) {
    setError(null)
    const response = await authControllerRegisterInvited({ token, ...values }).catch(() => null)
    if (!response) {
      setError('Sunucuya ulaşılamadı, tekrar deneyin.')
      return
    }
    if (response.status === 410) {
      setError('Bu davetin süresi dolmuş.')
      return
    }
    if (response.status === 409) {
      setError('Bu e-posta ile zaten bir hesap var.')
      return
    }
    if (response.status !== 201) {
      setError('Hesap oluşturulamadı, tekrar deneyin.')
      return
    }
    onRegistered(response.data.accessToken, response.data.user)
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">Katılmak için adınızı ve bir şifre belirleyin.</p>
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Ad Soyad</FormLabel>
              <FormControl>
                <Input autoComplete="name" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Şifre</FormLabel>
              <FormControl>
                <Input type="password" autoComplete="new-password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={form.formState.isSubmitting}>
          Hesap oluştur ve katıl
        </Button>
      </form>
    </Form>
  )
}
