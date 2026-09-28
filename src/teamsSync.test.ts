import { describe, expect, it } from 'vitest'

// @ts-ignore Vitest imports the Node ESM server module directly for parser tests.
import {
  buildTeamsSyncSummary,
  mapTeamsThreadToLaunchRecord,
  parseLaunchThreadBody,
  parseTeamsReplySignals,
  type TeamsChannelMessage,
} from '../server/teamsSync.mjs'

describe('Teams launch thread sync', () => {
  it('parses launch metadata from the main Teams message body', () => {
    const parsed = parseLaunchThreadBody(`
      레이블: @에이블
      작가: 유연 작가
      제목: 새벽 끝의 로맨스
      출간 일정: 2026.08.27
      구분: 연재
      출간 플랫폼: 카카오페이지
    `)

    expect(parsed.label).toBe('에이블')
    expect(parsed.author).toBe('유연 작가')
    expect(parsed.title).toBe('새벽 끝의 로맨스')
    expect(parsed.releaseDate).toBe('2026-08-27')
    expect(parsed.format).toBe('연재')
    expect(parsed.platform).toBe('카카오페이지')
  })

  it('parses launch metadata from Teams rich-text table markup', () => {
    const parsed = parseLaunchThreadBody(`
      <div>안녕하세요.</div>
      <table>
        <tr><td>레이블</td><td>@에이블</td></tr>
        <tr><td>작가명</td><td>유연 작가</td></tr>
        <tr><td>작품명</td><td>새벽 끝의 로맨스</td></tr>
        <tr><td>출간일</td><td>2026-09-17</td></tr>
        <tr><td>출간 플랫폼</td><td>카카오페이지</td></tr>
        <tr><td>연재/단행</td><td>연재</td></tr>
      </table>
    `)

    expect(parsed.label).toBe('에이블')
    expect(parsed.author).toBe('유연 작가')
    expect(parsed.title).toBe('새벽 끝의 로맨스')
    expect(parsed.releaseDate).toBe('2026-09-17')
    expect(parsed.platform).toBe('카카오페이지')
    expect(parsed.format).toBe('연재')
  })

  it('parses launch metadata when labels and values are split across lines', () => {
    const parsed = parseLaunchThreadBody(`
      작품명
      마지막 성좌의 밤
      레이블
      @비올렛
      작가명
      은설 작가
      출간일
      2026.09.18
      출간 플랫폼
      네이버 시리즈
      연재/단행
      연재
    `)

    expect(parsed.title).toBe('마지막 성좌의 밤')
    expect(parsed.label).toBe('비올렛')
    expect(parsed.author).toBe('은설 작가')
    expect(parsed.releaseDate).toBe('2026-09-18')
    expect(parsed.platform).toBe('네이버 시리즈')
    expect(parsed.format).toBe('연재')
  })

  it('derives readiness flags from replies', () => {
    const signals = parseTeamsReplySignals([
      { body: { content: '서지정보, 표지 완입니다.' } },
      { body: { content: '원고 완입니다!' } },
      { body: { content: '등록 완료, 승인 대기 부탁드립니다.' } },
    ])

    expect(signals.bibliographicReady).toBe(true)
    expect(signals.coverReady).toBe(true)
    expect(signals.manuscriptReady).toBe(true)
    expect(signals.registered).toBe(true)
    expect(signals.approvalPending).toBe(true)
  })

  it('maps a Teams thread and like reaction into a completed launch record', () => {
    const message: TeamsChannelMessage = {
      id: 'message-1',
      subject: '[론-서][01] 론칭 준비 타래',
      webUrl: 'https://teams.example.com/thread/1',
      from: { user: { displayName: 'PD' } },
      body: {
        content: `
          레이블: @원티드
          작가: 백운 작가
          제목: 검은 봉인의 귀환
          출간 일정: 2026-08-25
          구분: 단행
          출간 플랫폼: 리디
        `,
      },
      reactions: [{ reactionType: 'like' }],
      replies: [
        { body: { content: '서지정보, 표지 완입니다.' } },
        { body: { content: '원고 완입니다!' } },
        { body: { content: '등록 완료했습니다.' } },
      ],
    }

    const record = mapTeamsThreadToLaunchRecord(message)

    expect(record.label).toBe('원티드')
    expect(record.assignee).toBe('PD')
    expect(record.title).toBe('검은 봉인의 귀환')
    expect(record.registered).toBe(true)
    expect(record.thumbsUpComplete).toBe(true)
    expect(record.completed).toBe(true)
    expect(record.launchThreadUrl).toBe('https://teams.example.com/thread/1')
  })

  it('builds a dashboard sync summary from multiple Teams threads', () => {
    const messages: TeamsChannelMessage[] = [
      {
        id: 'message-1',
        subject: '[론-서][01] 론칭 준비 타래',
        webUrl: 'https://teams.example.com/thread/1',
        from: { user: { displayName: 'PD 1' } },
        body: {
          content: `
            레이블: @에이블
            작가: 유연 작가
            제목: 새벽 끝의 로맨스
            출간 일정: 2026-08-27
            구분: 연재
            출간 플랫폼: 카카오페이지
          `,
        },
        reactions: [],
        replies: [{ body: { content: '서지정보, 표지 완입니다.' } }],
      },
      {
        id: 'message-2',
        subject: '[론-단][02] 론칭 준비 타래',
        webUrl: 'https://teams.example.com/thread/2',
        from: { user: { displayName: 'PD 2' } },
        body: {
          content: `
            레이블: @비올렛
            작가: 은설 작가
            제목: 마지막 성좌의 밤
            출간 일정: 미정
            구분: 연재
            출간 플랫폼: 네이버 시리즈
          `,
        },
        reactions: [],
        replies: [],
      },
    ]

    const summary = buildTeamsSyncSummary(messages)

    expect(summary.records).toHaveLength(2)
    expect(summary.skipped).toBe(0)
    expect(summary.records[0]?.bibliographicReady).toBe(true)
    expect(summary.records[1]?.releaseDate).toBe('')
  })
})
