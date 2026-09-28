import { describe, expect, it } from 'vitest'

import {
  DEFAULT_REMINDER_POLICY,
  buildAssigneeReminderMessage,
  buildAllReminderMessages,
  buildReminderMessage,
  calculateRegistrationDeadline,
  deriveLaunchStatus,
  getBusinessDaysUntil,
  groupReminderTargetsByAssignee,
  normalizeReminderPolicy,
  summarizeLaunches,
  type LaunchRecord,
  type ReminderPolicy,
} from './launchDashboard'

describe('launch dashboard core logic', () => {
  it('calculates the registration deadline as 7 business days before release', () => {
    expect(calculateRegistrationDeadline('2026-08-17')).toBe('2026-08-06')
  })

  it('marks the first missing prerequisite as the current waiting stage', () => {
    const record: LaunchRecord = {
      id: 'launch-1',
      label: '에이블',
      assignee: '조이',
      author: '테스트 작가',
      title: '테스트 작품',
      format: '연재',
      platform: '카카오페이지',
      releaseDate: '2026-08-20',
      bibliographicReady: true,
      manuscriptReady: false,
      coverReady: true,
      productionStarted: false,
      registered: false,
      approvalPending: false,
      completed: false,
      thumbsUpComplete: false,
      launchThreadUrl: 'https://teams.example/thread/1',
    }

    expect(deriveLaunchStatus(record)).toBe('원고 대기중')
  })

  it('treats thumbs-up completion as done even when other flags exist', () => {
    const record: LaunchRecord = {
      id: 'launch-2',
      label: '원티드',
      assignee: '조이',
      author: '테스트 작가',
      title: '완료 작품',
      format: '단행',
      platform: '리디',
      releaseDate: '2026-08-20',
      bibliographicReady: true,
      manuscriptReady: true,
      coverReady: true,
      productionStarted: true,
      registered: true,
      approvalPending: true,
      completed: true,
      thumbsUpComplete: true,
      launchThreadUrl: 'https://teams.example/thread/2',
    }

    expect(deriveLaunchStatus(record)).toBe('완료')
  })

  it('counts business days until the registration deadline', () => {
    expect(getBusinessDaysUntil('2026-08-17', '2026-08-20')).toBe(3)
  })

  it('summarizes reminder targets when the deadline is within 3 business days and registration is still incomplete', () => {
    const records: LaunchRecord[] = [
      {
        id: 'launch-3',
        label: '비올렛',
        assignee: '조이',
        author: '테스트 작가',
        title: '리마인드 대상',
        format: '연재',
        platform: '카카오페이지',
        releaseDate: '2026-08-27',
        bibliographicReady: true,
        manuscriptReady: false,
        coverReady: true,
        productionStarted: false,
        registered: false,
        approvalPending: false,
        completed: false,
        thumbsUpComplete: false,
        launchThreadUrl: 'https://teams.example/thread/3',
      },
      {
        id: 'launch-4',
        label: '에이블',
        assignee: '조이',
        author: '등록 작가',
        title: '등록 완료 작품',
        format: '단행',
        platform: '리디',
        releaseDate: '2026-08-27',
        bibliographicReady: true,
        manuscriptReady: true,
        coverReady: true,
        productionStarted: true,
        registered: true,
        approvalPending: false,
        completed: false,
        thumbsUpComplete: false,
        launchThreadUrl: 'https://teams.example/thread/4',
      },
      {
        id: 'launch-5',
        label: '에이블',
        assignee: '조이',
        author: '완료 작가',
        title: '완료된 작품',
        format: '단행',
        platform: '리디',
        releaseDate: '2026-08-27',
        bibliographicReady: true,
        manuscriptReady: true,
        coverReady: true,
        productionStarted: true,
        registered: true,
        approvalPending: false,
        completed: true,
        thumbsUpComplete: true,
        launchThreadUrl: 'https://teams.example/thread/5',
      },
    ]

    const summary = summarizeLaunches(records, '2026-08-17')

    expect(summary.reminderTargets).toHaveLength(1)
    expect(summary.reminderTargets[0]?.title).toBe('리마인드 대상')
    expect(summary.statusCounts['원고 대기중']).toBe(1)
    expect(summary.statusCounts['등록 완료']).toBe(1)
    expect(summary.statusCounts['완료']).toBe(1)
  })

  it('respects a custom reminder lead time when summarizing targets', () => {
    const policy: ReminderPolicy = { leadBusinessDays: 1 }
    const records: LaunchRecord[] = [
      {
        id: 'launch-6',
        label: '에이블',
        assignee: '조이',
        author: '테스트 작가',
        title: 'D-1 대상',
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
        launchThreadUrl: 'https://teams.example/thread/6',
      },
      {
        id: 'launch-7',
        label: '비올렛',
        assignee: '조이',
        author: '테스트 작가',
        title: 'D-2 비대상',
        format: '연재',
        platform: '카카오페이지',
        releaseDate: '2026-09-01',
        bibliographicReady: true,
        manuscriptReady: false,
        coverReady: true,
        productionStarted: false,
        registered: false,
        approvalPending: false,
        completed: false,
        thumbsUpComplete: false,
        launchThreadUrl: 'https://teams.example/thread/7',
      },
    ]

    const summary = summarizeLaunches(records, '2026-08-19', policy)

    expect(summary.reminderTargets).toHaveLength(1)
    expect(summary.reminderTargets[0]?.title).toBe('D-1 대상')
  })

  it('normalizes reminder policy to the supported range and falls back to defaults', () => {
    expect(DEFAULT_REMINDER_POLICY).toEqual({ leadBusinessDays: 3 })
    expect(normalizeReminderPolicy({ leadBusinessDays: 0 })).toEqual({ leadBusinessDays: 1 })
    expect(normalizeReminderPolicy({ leadBusinessDays: 11 })).toEqual({ leadBusinessDays: 10 })
    expect(normalizeReminderPolicy({ leadBusinessDays: Number.NaN })).toEqual({ leadBusinessDays: 3 })
    expect(normalizeReminderPolicy({})).toEqual({ leadBusinessDays: 3 })
  })

  it('groups reminder targets by assignee and sorts urgent items first', () => {
    const summary = summarizeLaunches(
      [
        {
          id: 'launch-9',
          label: '에이블',
          assignee: '조이',
          author: '작가 A',
          title: 'D-1 작품',
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
          launchThreadUrl: 'https://teams.example/thread/9',
        },
        {
          id: 'launch-10',
          label: '비올렛',
          assignee: '희디',
          author: '작가 B',
          title: 'D-2 작품',
          format: '연재',
          platform: '네이버 시리즈',
          releaseDate: '2026-09-01',
          bibliographicReady: true,
          manuscriptReady: false,
          coverReady: true,
          productionStarted: false,
          registered: false,
          approvalPending: false,
          completed: false,
          thumbsUpComplete: false,
          launchThreadUrl: 'https://teams.example/thread/10',
        },
        {
          id: 'launch-11',
          label: '원티드',
          assignee: '조이',
          author: '작가 C',
          title: 'D-0 작품',
          format: '단행',
          platform: '리디',
          releaseDate: '2026-08-28',
          bibliographicReady: true,
          manuscriptReady: true,
          coverReady: true,
          productionStarted: true,
          registered: false,
          approvalPending: false,
          completed: false,
          thumbsUpComplete: false,
          launchThreadUrl: 'https://teams.example/thread/11',
        },
      ],
      '2026-08-19',
      { leadBusinessDays: 3 },
    )

    const groups = groupReminderTargetsByAssignee(summary.reminderTargets)

    expect(groups).toHaveLength(2)
    expect(groups[0]).toMatchObject({ assignee: '조이', count: 2, titles: ['D-0 작품', 'D-1 작품'] })
    expect(groups[1]).toMatchObject({ assignee: '희디', count: 1, titles: ['D-2 작품'] })
  })

  it('builds a bundled reminder message for a single assignee group', () => {
    const summary = summarizeLaunches(
      [
        {
          id: 'launch-12',
          label: '에이블',
          assignee: '조이',
          author: '작가 A',
          title: '첫 번째 작품',
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
          launchThreadUrl: 'https://teams.example/thread/12',
        },
        {
          id: 'launch-13',
          label: '원티드',
          assignee: '조이',
          author: '작가 B',
          title: '두 번째 작품',
          format: '단행',
          platform: '리디',
          releaseDate: '2026-08-28',
          bibliographicReady: true,
          manuscriptReady: true,
          coverReady: true,
          productionStarted: true,
          registered: false,
          approvalPending: false,
          completed: false,
          thumbsUpComplete: false,
          launchThreadUrl: 'https://teams.example/thread/13',
        },
      ],
      '2026-08-19',
      { leadBusinessDays: 3 },
    )

    const groups = groupReminderTargetsByAssignee(summary.reminderTargets)
    const message = buildAssigneeReminderMessage(groups[0]!, summary.reminderTargets)

    expect(message).toContain('[담당자별 론칭 리마인드]')
    expect(message).toContain('담당자: 조이')
    expect(message).toContain('총 2건')
    expect(message).toContain('1. 두 번째 작품')
    expect(message).toContain('남은 영업일: 0일')
    expect(message).toContain('2. 첫 번째 작품')
    expect(message).toContain('남은 영업일: 1일')
  })

  it('builds one bulk reminder message that groups all assignees in urgency order', () => {
    const summary = summarizeLaunches(
      [
        {
          id: 'launch-14',
          label: '에이블',
          assignee: '조이',
          author: '작가 A',
          title: '조이 긴급 작품',
          format: '연재',
          platform: '카카오페이지',
          releaseDate: '2026-08-28',
          bibliographicReady: true,
          manuscriptReady: false,
          coverReady: true,
          productionStarted: false,
          registered: false,
          approvalPending: false,
          completed: false,
          thumbsUpComplete: false,
          launchThreadUrl: 'https://teams.example/thread/14',
        },
        {
          id: 'launch-15',
          label: '비올렛',
          assignee: '희디',
          author: '작가 B',
          title: '희디 작품',
          format: '연재',
          platform: '네이버 시리즈',
          releaseDate: '2026-09-01',
          bibliographicReady: true,
          manuscriptReady: false,
          coverReady: true,
          productionStarted: false,
          registered: false,
          approvalPending: false,
          completed: false,
          thumbsUpComplete: false,
          launchThreadUrl: 'https://teams.example/thread/15',
        },
        {
          id: 'launch-16',
          label: '원티드',
          assignee: '조이',
          author: '작가 C',
          title: '조이 후순위 작품',
          format: '단행',
          platform: '리디',
          releaseDate: '2026-08-29',
          bibliographicReady: true,
          manuscriptReady: true,
          coverReady: true,
          productionStarted: true,
          registered: false,
          approvalPending: false,
          completed: false,
          thumbsUpComplete: false,
          launchThreadUrl: 'https://teams.example/thread/16',
        },
      ],
      '2026-08-19',
      { leadBusinessDays: 3 },
    )

    const message = buildAllReminderMessages(summary.reminderTargets)

    expect(message).toContain('[전체 론칭 리마인드]')
    expect(message).toContain('총 3건 · 담당자 2명')
    expect(message).toContain('담당자: 조이')
    expect(message).toContain('1. 조이 긴급 작품')
    expect(message).toContain('2. 조이 후순위 작품')
    expect(message).toContain('담당자: 희디')
    expect(message.indexOf('담당자: 조이')).toBeLessThan(message.indexOf('담당자: 희디'))
  })

  it('builds a reminder message with the current blocking stage', () => {
    const record: LaunchRecord = {
      id: 'launch-8',
      label: '원티드',
      assignee: '조이',
      author: '테스트 작가',
      title: '알림 작품',
      format: '연재',
      platform: '카카오페이지',
      releaseDate: '2026-08-27',
      bibliographicReady: true,
      manuscriptReady: false,
      coverReady: true,
      productionStarted: false,
      registered: false,
      approvalPending: false,
      completed: false,
      thumbsUpComplete: false,
      launchThreadUrl: 'https://teams.example/thread/8',
    }

    const message = buildReminderMessage(record, '2026-08-17')

    expect(message).toContain('알림 작품')
    expect(message).toContain('현재 단계: 원고 대기중')
    expect(message).toContain('남은 영업일: 1일')
  })
})
