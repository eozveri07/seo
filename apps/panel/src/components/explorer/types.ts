import type { GscPageRowDto, GscQueryRowDto } from '@/api/endpoints.schemas'

export type ExplorerRow = {
  key: string
  label: string
  clicks: number
  impressions: number
  ctr: number
  position: number
}

export function queryRowToExplorerRow(row: GscQueryRowDto): ExplorerRow {
  return { key: row.queryHash, label: row.query, clicks: row.clicks, impressions: row.impressions, ctr: row.ctr, position: row.position }
}

export function pageRowToExplorerRow(row: GscPageRowDto): ExplorerRow {
  return { key: row.pageHash, label: row.page, clicks: row.clicks, impressions: row.impressions, ctr: row.ctr, position: row.position }
}
