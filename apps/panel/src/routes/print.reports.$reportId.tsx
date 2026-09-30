import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts'
import type { ReportDataResponseDto } from '@/api/endpoints.schemas'

export const Route = createFileRoute('/print/reports/$reportId')({
  validateSearch: (search: Record<string, unknown>) => ({ token: String(search.token ?? '') }),
  component: PrintReportPage,
})

const METRIC_LABELS: Record<string, string> = {
  clicks: 'Tıklama',
  impressions: 'Gösterim',
  ctr: 'CTR',
  position: 'Ort. pozisyon',
  organicSessions: 'Organik oturum',
  organicKeyEvents: 'Anahtar olay',
}

function formatMetric(key: string, value: number): string {
  if (key === 'ctr') return `${(value * 100).toFixed(1)}%`
  if (key === 'position') return value.toFixed(1)
  return Math.round(value).toLocaleString('tr-TR')
}

function PrintReportPage() {
  const { reportId } = Route.useParams()
  const { token } = Route.useSearch()
  const [data, setData] = useState<ReportDataResponseDto | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/v1/reports/${reportId}/data?token=${encodeURIComponent(token)}`)
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        return (await response.json()) as ReportDataResponseDto
      })
      .then((result) => {
        if (!cancelled) setData(result)
      })
      .catch(() => {
        if (!cancelled) setError('Rapor verisi yüklenemedi.')
      })
    return () => {
      cancelled = true
    }
  }, [reportId, token])

  // Grafikler isAnimationActive=false ile senkron çizilir; layout'un
  // (ResponsiveContainer ölçümü) oturması için bir sonraki frame'e bırakılır.
  useEffect(() => {
    if (!data) return
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => setReady(true))
    })
    return () => cancelAnimationFrame(raf)
  }, [data])

  if (error) {
    return <div style={{ padding: 24, fontFamily: 'sans-serif' }}>{error}</div>
  }
  if (!data) {
    return <div style={{ padding: 24, fontFamily: 'sans-serif' }}>Yükleniyor…</div>
  }

  const branding = data.branding as { logoUrl?: string; color?: string }
  const brandColor = typeof branding.color === 'string' ? branding.color : '#111827'

  return (
    <div
      data-report-ready={ready ? 'true' : undefined}
      style={{ fontFamily: 'sans-serif', color: '#111827', padding: '16mm', maxWidth: '210mm', margin: '0 auto' }}
    >
      <style>{`
        @page { size: A4; margin: 0; }
        html, body { margin: 0; padding: 0; }
        * { box-sizing: border-box; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; }
        th, td { text-align: left; padding: 4px 8px; border-bottom: 1px solid #e5e7eb; }
        h2 { font-size: 16px; margin: 24px 0 8px; border-top: 2px solid ${brandColor}; padding-top: 8px; }
        .section { page-break-inside: avoid; }
      `}</style>

      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `4px solid ${brandColor}`, paddingBottom: 12 }}>
        <div>
          {branding.logoUrl && (
            <img src={branding.logoUrl} alt={data.clientName} style={{ maxHeight: 48, marginBottom: 8 }} />
          )}
          <h1 style={{ fontSize: 22, margin: 0 }}>{data.clientName}</h1>
          <p style={{ margin: '4px 0 0', color: '#6b7280' }}>{data.projectName}</p>
        </div>
        <div style={{ textAlign: 'right', color: '#6b7280', fontSize: 13 }}>
          <p style={{ margin: 0 }}>
            {data.periodStart} – {data.periodEnd}
          </p>
          <p style={{ margin: 0 }}>Oluşturulma: {new Date(data.generatedAt).toLocaleString('tr-TR')}</p>
        </div>
      </header>

      <section className="section">
        <h2>Dönem özeti</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          {(Object.keys(METRIC_LABELS) as (keyof typeof METRIC_LABELS)[]).map((key) => {
            const current = data.period[key as keyof typeof data.period] as number
            const previous = data.previousPeriod[key as keyof typeof data.previousPeriod] as number
            const delta = current - previous
            return (
              <div key={key} style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 10 }}>
                <p style={{ margin: 0, fontSize: 11, color: '#6b7280' }}>{METRIC_LABELS[key]}</p>
                <p style={{ margin: '4px 0 0', fontSize: 18, fontWeight: 600 }}>{formatMetric(key, current)}</p>
                <p style={{ margin: 0, fontSize: 11, color: delta >= 0 ? '#16a34a' : '#dc2626' }}>
                  önceki dönem: {formatMetric(key, previous)} ({delta >= 0 ? '+' : ''}
                  {formatMetric(key, delta)})
                </p>
              </div>
            )
          })}
        </div>
      </section>

      <section className="section">
        <h2>GSC trendi</h2>
        <LineChart width={700} height={220} data={data.gscTrend} margin={{ left: 8, right: 8 }}>
          <CartesianGrid vertical={false} stroke="#e5e7eb" />
          <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
          <YAxis yAxisId="clicks" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={36} />
          <Line yAxisId="clicks" dataKey="clicks" stroke={brandColor} strokeWidth={2} dot={false} isAnimationActive={false} />
        </LineChart>
      </section>

      <section className="section">
        <h2>Keyword pozisyon dağılımı</h2>
        <BarChart
          width={700}
          height={200}
          data={[
            { bucket: 'Top 3', count: data.keywordDistribution.top3 },
            { bucket: '4–10', count: data.keywordDistribution.top10 },
            { bucket: '11–20', count: data.keywordDistribution.top20 },
            { bucket: '21–100', count: data.keywordDistribution.top100 },
            { bucket: '100+', count: data.keywordDistribution.beyond },
          ]}
          margin={{ left: 8, right: 8 }}
        >
          <CartesianGrid vertical={false} stroke="#e5e7eb" />
          <XAxis dataKey="bucket" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={28} allowDecimals={false} />
          <Bar dataKey="count" fill={brandColor} isAnimationActive={false} />
        </BarChart>
      </section>

      <section className="section" style={{ display: 'flex', gap: 24 }}>
        <div style={{ flex: 1 }}>
          <h2>En çok yükselenler</h2>
          <table>
            <thead>
              <tr>
                <th>Keyword</th>
                <th>Pozisyon</th>
                <th>Değişim</th>
              </tr>
            </thead>
            <tbody>
              {data.topGainers.map((item) => (
                <tr key={item.trackedKeywordId}>
                  <td>{item.keyword}</td>
                  <td>{item.position ?? '—'}</td>
                  <td style={{ color: '#16a34a' }}>{item.change30d}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ flex: 1 }}>
          <h2>En çok düşenler</h2>
          <table>
            <thead>
              <tr>
                <th>Keyword</th>
                <th>Pozisyon</th>
                <th>Değişim</th>
              </tr>
            </thead>
            <tbody>
              {data.topLosers.map((item) => (
                <tr key={item.trackedKeywordId}>
                  <td>{item.keyword}</td>
                  <td>{item.position ?? '—'}</td>
                  <td style={{ color: '#dc2626' }}>+{item.change30d}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="section">
        <h2>En çok trafik alan sayfalar</h2>
        <table>
          <thead>
            <tr>
              <th>Sayfa</th>
              <th>Tıklama</th>
              <th>Gösterim</th>
              <th>CTR</th>
              <th>Pozisyon</th>
            </tr>
          </thead>
          <tbody>
            {data.topPages.map((page) => (
              <tr key={page.page}>
                <td>{page.page}</td>
                <td>{Math.round(page.clicks)}</td>
                <td>{Math.round(page.impressions)}</td>
                <td>{(page.ctr * 100).toFixed(1)}%</td>
                <td>{page.position.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {data.analystNote && (
        <section className="section">
          <h2>Analist notu</h2>
          <p style={{ whiteSpace: 'pre-wrap', fontSize: 13 }}>{data.analystNote}</p>
        </section>
      )}
    </div>
  )
}
