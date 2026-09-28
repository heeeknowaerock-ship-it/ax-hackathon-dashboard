import { describe, expect, it } from 'vitest'

import {
  buildSyncSnapshot,
  formatSyncRunSummary,
  formatSyncTimestamp,
  type SyncRunSummary,
} from './syncMeta'

describe('sync metadata helpers', () => {
  it('formats the latest successful sync timestamp in a stable UTC text', () => {
    expect(formatSyncTimestamp('2026-08-19T06:07:08.000Z')).toBe('2026-08-19 06:07 UTC')
    expect(formatSyncTimestamp(null)).toBe('아직 동기화 이력이 없습니다')
    expect(formatSyncTimestamp('invalid')).toBe('시각 확인 불가')
  })

  it('formats sync result counts into a compact summary', () => {
    const summary: SyncRunSummary = {
      lastSyncedAt: '2026-08-19T06:07:08.000Z',
      applied: 12,
      skipped: 3,
      fetched: 20,
    }

    expect(formatSyncRunSummary(summary)).toBe('최근 결과 · 반영 12건 · 제외 3건 · 확인 20건')
  })

  it('builds a sync snapshot from the teams sync response', () => {
    const snapshot = buildSyncSnapshot({
      fetched: 20,
      records: new Array(12).fill({}),
      skipped: 3,
    })

    expect(snapshot.applied).toBe(12)
    expect(snapshot.skipped).toBe(3)
    expect(snapshot.fetched).toBe(20)
    expect(snapshot.lastSyncedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })
})
