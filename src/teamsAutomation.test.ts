import { describe, expect, it } from 'vitest'

// @ts-ignore Vitest imports the Node ESM server module directly for automation tests.
import { buildAutomationReminderText, selectReminderRows } from '../server/teamsAutomation.mjs'

describe('teams automation reminders', () => {
  const records = [
    {
      id: 'launch-1',
      label: '에이블',
      assignee: '조이',
      author: '테스트 작가',
      title: 'D-1 원고 대기 작품',
      format: '연재',
      platform: '카카오페이지',
      releaseDate: '2026-08-29',
      bibliographicReady: true,
      manuscriptReady: false,
      coverReady: true,
      productionStarted: false,
      registered: false,
      approvalPending: false,
      completed: false,
      thumbsUpComplete: false,
      launchThreadUrl: 'https://teams.example/thread/1',
    },
    {
      id: 'launch-2',
      label: '원티드',
      assignee: '라토',
      author: '등록 작가',
      title: '등록 완료 작품',
      format: '단행',
      platform: '리디',
      releaseDate: '2026-08-29',
      bibliographicReady: true,
      manuscriptReady: true,
      coverReady: true,
      productionStarted: true,
      registered: true,
      approvalPending: false,
      completed: false,
      thumbsUpComplete: false,
      launchThreadUrl: 'https://teams.example/thread/2',
    },
    {
      id: 'launch-3',
      label: '비올렛',
      assignee: '희디',
      author: '테스트 작가',
      title: 'D-2 서지 대기 작품',
      format: '연재',
      platform: '네이버 시리즈',
      releaseDate: '2026-09-01',
      bibliographicReady: false,
      manuscriptReady: false,
      coverReady: false,
      productionStarted: false,
      registered: false,
      approvalPending: false,
      completed: false,
      thumbsUpComplete: false,
      launchThreadUrl: 'https://teams.example/thread/3',
    },
  ]

  it('selects only unresolved reminder targets within the configured business-day window', () => {
    const rows = selectReminderRows(records, '2026-08-19', 3)

    expect(rows).toHaveLength(2)
    expect(rows[0]?.title).toBe('D-1 원고 대기 작품')
    expect(rows[0]?.status).toBe('원고 대기중')
    expect(rows[1]?.title).toBe('D-2 서지 대기 작품')
    expect(rows[1]?.status).toBe('서지정보 대기중')
  })

  it('builds a grouped Teams reminder digest text', () => {
    const message = buildAutomationReminderText(records, {
      today: '2026-08-19',
      leadBusinessDays: 3,
    })

    expect(message).toContain('[전체 론칭 리마인드 자동발송]')
    expect(message).toContain('총 2건 · 담당자 2명')
    expect(message).toContain('담당자: 조이')
    expect(message).toContain('현재 단계: 원고 대기중')
    expect(message).toContain('담당자: 희디')
    expect(message).toContain('현재 단계: 서지정보 대기중')
    expect(message).not.toContain('등록 완료 작품')
  })

  it('returns a calm no-target message when nothing needs a reminder', () => {
    const message = buildAutomationReminderText(
      [
        {
          ...records[1],
          registered: true,
        },
      ],
      {
        today: '2026-08-19',
        leadBusinessDays: 3,
      },
    )

    expect(message).toContain('현재 기준으로 자동 알림 대상 작품이 없습니다.')
  })
})
