import { zodResolver } from '@hookform/resolvers/zod'
import { createFileRoute, Navigate, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { organizationsControllerCreate } from '@/api/organizations/organizations'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/lib/auth/auth-context'
import { useOrg } from '@/lib/auth/org-context'

export const Route = createFileRoute('/organizations/new')({
  component: NewOrganizationPage,
})

const schema = z.object({
  name: z.string().min(1, 'Organizasyon adı gerekli').max(200),
  slug: z
    .string()
    .max(60)
    .regex(/^[a-z0-9-]*$/, 'Küçük harf, rakam ve tire kullanın')
    .optional()
    .or(z.literal('')),
})

type FormValues = z.infer<typeof schema>

function NewOrganizationPage() {
  const { status } = useAuth()
  const { orgs, isLoading, switchOrg, refetch } = useOrg()
  const navigate = useNavigate()
  const [serverError, setServerError] = useState<string | null>(null)

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', slug: '' },
  })

  if (status === 'checking' || isLoading) {
    return null
  }
  if (status === 'unauthenticated') {
    return <Navigate to="/login" />
  }
  if (orgs.length > 0) {
    return <Navigate to="/" search={{ clientId: undefined }} />
  }

  async function onSubmit(values: FormValues) {
    setServerError(null)
    const response = await organizationsControllerCreate({
      name: values.name,
      slug: values.slug ? values.slug : undefined,
    }).catch(() => null)
    if (!response) {
      setServerError('Sunucuya ulaşılamadı, tekrar deneyin.')
      return
    }
    if (response.status === 409) {
      setServerError('Bu slug zaten kullanılıyor, başka bir isim deneyin.')
      return
    }
    await refetch()
    switchOrg(response.data.id)
    void navigate({ to: '/', search: { clientId: undefined } })
  }

  return (
    <div className="flex min-h-svh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Organizasyon oluştur</CardTitle>
          <CardDescription>Devam etmek için bir organizasyon oluşturun.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ad</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="slug"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Slug (opsiyonel)</FormLabel>
                    <FormControl>
                      <Input placeholder="verilmezse addan üretilir" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {serverError && <p className="text-sm text-destructive">{serverError}</p>}
              <Button type="submit" disabled={form.formState.isSubmitting} className="mt-2">
                Oluştur
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  )
}
