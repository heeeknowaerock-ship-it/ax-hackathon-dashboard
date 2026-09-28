export type SyncRunSummary = {
  lastSyncedAt: string | null
  applied: number
  skipped: number
  fetched: number
}

export function formatSyncTimestamp(value: string | null): string {
  if (!value) return '아직 동기화 이력이 없습니다'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '시각 확인 불가'

  const year = date.getUTCFullYear()
  const month = `${date.getUTCMonth() + 1}`.padStart(2, '0')
  const day = `${date.getUTCDate()}`.padStart(2, '0')
  const hours = `${date.getUTCHours()}`.padStart(2, '0')
  const minutes = `${date.getUTCMinutes()}`.padStart(2, '0')

  return `${year}-${month}-${day} ${hours}:${minutes} UTC`
}

export function formatSyncRunSummary(summary: SyncRunSummary): string {
  return `최근 결과 · 반영 ${summary.applied}건 · 제외 ${summary.skipped}건 · 확인 ${summary.fetched}건`
}

export function buildSyncSnapshot(input: {
  fetched: number
  records: unknown[]
  skipped: number
}): SyncRunSummary {
  return {
    lastSyncedAt: new Date().toISOString(),
    applied: input.records.length,
    skipped: input.skipped,
    fetched: input.fetched,
  }
}
