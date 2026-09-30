import { authSession } from '@/lib/http/auth-session'

/**
 * PDF indirme, orval'ın `customFetch`'i üzerinden yapılmaz: o mutator
 * gövdeyi her zaman `text()` ile okur, ikili bir PDF'i bozar. Aynı
 * Authorization/X-Org-Id header'larıyla ham `fetch` kullanılır.
 */
export async function downloadReport(projectId: string, reportId: string, filenameHint: string): Promise<void> {
  const headers = new Headers()
  const token = authSession.getAccessToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  const orgId = authSession.getActiveOrgId()
  if (orgId) headers.set('X-Org-Id', orgId)

  const response = await fetch(`/api/v1/projects/${projectId}/reports/${reportId}/download`, { headers })
  if (!response.ok) {
    throw new Error('Rapor indirilemedi')
  }
  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filenameHint
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
