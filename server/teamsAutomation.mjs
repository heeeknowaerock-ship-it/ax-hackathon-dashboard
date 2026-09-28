import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

import { syncTeamsLaunchThreads } from './teamsSync.mjs'

const SERVER_DIR = dirname(fileURLToPath(import.meta.url))
const STATE_PATH = resolve(SERVER_DIR, '.teams-automation-state.json')

const DEFAULT_TEAMS_CONFIG = {
  tenantId: '',
  clientId: '',
  clientSecret: '',
  teamId: '',
  channelId: '',
  limit: 50,
}

const DEFAULT_AUTOMATION_STATE = {
  enabled: false,
  webhookUrl: '',
  intervalMinutes: 30,
  leadBusinessDays: 3,
  teamsConfig: DEFAULT_TEAMS_CONFIG,
  lastRunAt: null,
  lastRunStatus: 'idle',
  lastRunMessage: '자동 알림이 아직 실행되지 않았습니다.',
  lastSentAt: null,
  lastSentCount: 0,
  lastSentFingerprint: '',
}

let automationState = { ...DEFAULT_AUTOMATION_STATE }
let automationTimer = null
let inFlightRun = null

function trimString(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function clampNumber(value, min, max, fallback) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, Math.trunc(parsed)))
}

function normalizeTeamsConfig(input = {}, previous = DEFAULT_TEAMS_CONFIG) {
  const next = {
    tenantId: trimString(input.tenantId) || previous.tenantId || '',
    clientId: trimString(input.clientId) || previous.clientId || '',
    clientSecret: trimString(input.clientSecret) || previous.clientSecret || '',
    teamId: trimString(input.teamId) || previous.teamId || '',
    channelId: trimString(input.channelId) || previous.channelId || '',
    limit: clampNumber(input.limit, 1, 200, previous.limit || DEFAULT_TEAMS_CONFIG.limit),
  }

  return next
}

function normalizeAutomationState(input = {}, previous = DEFAULT_AUTOMATION_STATE) {
  const base = {
    ...DEFAULT_AUTOMATION_STATE,
    ...previous,
  }

  return {
    ...base,
    enabled: Boolean(input.enabled ?? base.enabled),
    webhookUrl: trimString(input.webhookUrl) || base.webhookUrl || '',
    intervalMinutes: clampNumber(input.intervalMinutes, 5, 1440, base.intervalMinutes),
    leadBusinessDays: clampNumber(input.leadBusinessDays, 1, 10, base.leadBusinessDays),
    teamsConfig: normalizeTeamsConfig(input.teamsConfig ?? {}, base.teamsConfig),
    lastRunAt: input.lastRunAt ?? base.lastRunAt,
    lastRunStatus: trimString(input.lastRunStatus) || base.lastRunStatus,
    lastRunMessage: trimString(input.lastRunMessage) || base.lastRunMessage,
    lastSentAt: input.lastSentAt ?? base.lastSentAt,
    lastSentCount: clampNumber(input.lastSentCount, 0, 99999, base.lastSentCount),
    lastSentFingerprint: trimString(input.lastSentFingerprint) || base.lastSentFingerprint || '',
  }
}

function toSafeAutomationState(state = automationState) {
  return {
    enabled: state.enabled,
    webhookUrl: '',
    hasWebhookUrl: Boolean(state.webhookUrl),
    intervalMinutes: state.intervalMinutes,
    leadBusinessDays: state.leadBusinessDays,
    teamsConfig: {
      ...state.teamsConfig,
      clientSecret: '',
    },
    hasClientSecret: Boolean(state.teamsConfig?.clientSecret),
    lastRunAt: state.lastRunAt,
    lastRunStatus: state.lastRunStatus,
    lastRunMessage: state.lastRunMessage,
    lastSentAt: state.lastSentAt,
    lastSentCount: state.lastSentCount,
  }
}

export function buildPersistedAutomationState(state = automationState) {
  return {
    ...state,
    webhookUrl: '',
    teamsConfig: {
      ...state.teamsConfig,
      clientSecret: '',
    },
  }
}

async function persistAutomationState() {
  await mkdir(dirname(STATE_PATH), { recursive: true })
  await writeFile(STATE_PATH, JSON.stringify(buildPersistedAutomationState(), null, 2), 'utf-8')
}

async function loadAutomationState() {
  try {
    const raw = await readFile(STATE_PATH, 'utf-8')
    const parsed = JSON.parse(raw)
    automationState = normalizeAutomationState({
      ...parsed,
      webhookUrl: '',
      teamsConfig: {
        ...parsed.teamsConfig,
        clientSecret: '',
      },
    })
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      automationState = { ...DEFAULT_AUTOMATION_STATE }
      return
    }

    automationState = {
      ...DEFAULT_AUTOMATION_STATE,
      lastRunStatus: 'error',
      lastRunMessage: '자동 알림 상태 파일을 읽지 못해 기본값으로 복구했습니다.',
      lastRunAt: new Date().toISOString(),
    }
  }
}

function clearAutomationTimer() {
  if (automationTimer) {
    clearInterval(automationTimer)
    automationTimer = null
  }
}

function scheduleAutomationTimer() {
  clearAutomationTimer()

  if (!automationState.enabled) return

  automationTimer = setInterval(() => {
    void runTeamsReminderAutomation({ force: false, trigger: 'scheduled' })
  }, automationState.intervalMinutes * 60_000)
}

function requireConfiguredKeys(state, { includeWebhook = true } = {}) {
  const missing = []
  const teamsConfig = state.teamsConfig ?? DEFAULT_TEAMS_CONFIG

  if (!teamsConfig.tenantId) missing.push('tenantId')
  if (!teamsConfig.clientId) missing.push('clientId')
  if (!teamsConfig.clientSecret) missing.push('clientSecret')
  if (!teamsConfig.teamId) missing.push('teamId')
  if (!teamsConfig.channelId) missing.push('channelId')
  if (includeWebhook && !state.webhookUrl) missing.push('webhookUrl')

  if (missing.length > 0) {
    throw new Error(`자동 알림 필수 설정이 비어 있습니다: ${missing.join(', ')}`)
  }
}

function parseIsoDate(value) {
  if (!value) return null
  const [year, month, day] = String(value).split('-').map(Number)
  if (!year || !month || !day) return null
  const date = new Date(Date.UTC(year, month - 1, day))
  return Number.isNaN(date.getTime()) ? null : date
}

function formatIsoDate(date) {
  const year = date.getUTCFullYear()
  const month = `${date.getUTCMonth() + 1}`.padStart(2, '0')
  const day = `${date.getUTCDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

function isBusinessDay(date) {
  const day = date.getUTCDay()
  return day !== 0 && day !== 6
}

function shiftBusinessDays(input, delta) {
  const start = parseIsoDate(input)
  if (!start) return ''

  const direction = delta >= 0 ? 1 : -1
  const date = new Date(start)
  let remaining = Math.abs(delta)

  while (remaining > 0) {
    date.setUTCDate(date.getUTCDate() + direction)
    if (isBusinessDay(date)) {
      remaining -= 1
    }
  }

  return formatIsoDate(date)
}

function calculateRegistrationDeadline(releaseDate, leadBusinessDays = 7) {
  if (!releaseDate) return ''
  return shiftBusinessDays(releaseDate, -leadBusinessDays)
}

function getBusinessDaysUntil(fromDate, toDate) {
  const from = parseIsoDate(fromDate)
  const to = parseIsoDate(toDate)
  if (!from || !to) return null

  if (formatIsoDate(from) === formatIsoDate(to)) return 0

  const direction = from < to ? 1 : -1
  const cursor = new Date(from)
  let days = 0

  while (formatIsoDate(cursor) !== formatIsoDate(to)) {
    cursor.setUTCDate(cursor.getUTCDate() + direction)
    if (isBusinessDay(cursor)) {
      days += direction
    }
  }

  return days
}

function deriveLaunchStatus(record) {
  if (record.thumbsUpComplete || record.completed) return '완료'
  if (!record.releaseDate) return '일정 미확정'
  if (!record.bibliographicReady) return '서지정보 대기중'
  if (!record.manuscriptReady) return '원고 대기중'
  if (!record.coverReady) return '표지 대기중'
  if (record.approvalPending) return '등록 후 승인 대기중'
  if (record.registered) return '등록 완료'
  if (record.productionStarted) return '제작 진행중'
  return '제작 가능'
}

export function selectReminderRows(records = [], today, leadBusinessDays = 3) {
  return records
    .map((record) => {
      const registrationDeadline = calculateRegistrationDeadline(record.releaseDate)
      const businessDaysLeft = registrationDeadline ? getBusinessDaysUntil(today, registrationDeadline) : null
      const status = deriveLaunchStatus(record)
      const reminderNeeded =
        !record.registered &&
        !record.thumbsUpComplete &&
        !record.completed &&
        Boolean(record.releaseDate) &&
        businessDaysLeft !== null &&
        businessDaysLeft <= leadBusinessDays

      return {
        ...record,
        registrationDeadline,
        businessDaysLeft,
        status,
        reminderNeeded,
      }
    })
    .filter((row) => row.reminderNeeded)
    .sort((left, right) => {
      const leftDays = left.businessDaysLeft ?? Number.POSITIVE_INFINITY
      const rightDays = right.businessDaysLeft ?? Number.POSITIVE_INFINITY
      return leftDays - rightDays
    })
}

function formatDisplayDate(value) {
  const date = parseIsoDate(value)
  if (!date) return '미정'
  return `${date.getUTCMonth() + 1}/${date.getUTCDate()}`
}

function groupRowsByAssignee(rows) {
  const grouped = new Map()

  for (const row of rows) {
    const assignee = row.assignee || '담당자 미지정'
    const current = grouped.get(assignee) ?? []
    current.push(row)
    grouped.set(assignee, current)
  }

  return [...grouped.entries()]
    .map(([assignee, items]) => ({
      assignee,
      items: [...items].sort((left, right) => {
        const leftDays = left.businessDaysLeft ?? Number.POSITIVE_INFINITY
        const rightDays = right.businessDaysLeft ?? Number.POSITIVE_INFINITY
        return leftDays - rightDays
      }),
    }))
    .sort((left, right) => {
      const leftDays = left.items[0]?.businessDaysLeft ?? Number.POSITIVE_INFINITY
      const rightDays = right.items[0]?.businessDaysLeft ?? Number.POSITIVE_INFINITY
      if (leftDays !== rightDays) return leftDays - rightDays
      return left.assignee.localeCompare(right.assignee, 'ko')
    })
}

export function buildAutomationReminderText(records = [], { today, leadBusinessDays = 3 } = {}) {
  const baseDate = today || formatIsoDate(new Date())
  const rows = selectReminderRows(records, baseDate, leadBusinessDays)
  const groups = groupRowsByAssignee(rows)

  if (rows.length === 0) {
    return [
      '[전체 론칭 리마인드 자동발송]',
      `기준일: ${baseDate}`,
      `리마인드 기준: 등록 마감 ${leadBusinessDays}영업일 이내`,
      '',
      '현재 기준으로 자동 알림 대상 작품이 없습니다.',
    ].join('\n')
  }

  const sections = groups.flatMap((group, groupIndex) => {
    const lines = [
      `담당자: ${group.assignee}`,
      `총 ${group.items.length}건`,
      '',
      ...group.items.flatMap((row, itemIndex) => {
        const businessDaysText = row.businessDaysLeft === null ? '계산 불가' : `${row.businessDaysLeft}일`
        return [
          `${itemIndex + 1}. ${row.title}`,
          `- 레이블/플랫폼: ${row.label} / ${row.platform}`,
          `- 현재 단계: ${row.status}`,
          `- 출간일/등록 마감: ${formatDisplayDate(row.releaseDate)} / ${formatDisplayDate(row.registrationDeadline)}`,
          `- 남은 영업일: ${businessDaysText}`,
          `- 타래: ${row.launchThreadUrl}`,
        ]
      }),
    ]

    return groupIndex === 0 ? lines : ['', ...lines]
  })

  return [
    '[전체 론칭 리마인드 자동발송]',
    `기준일: ${baseDate}`,
    `리마인드 기준: 등록 마감 ${leadBusinessDays}영업일 이내`,
    `총 ${rows.length}건 · 담당자 ${groups.length}명`,
    '',
    ...sections,
  ].join('\n')
}

function buildReminderFingerprint(rows) {
  const payload = rows.map((row) => ({
    id: row.id,
    title: row.title,
    assignee: row.assignee,
    status: row.status,
    businessDaysLeft: row.businessDaysLeft,
    registrationDeadline: row.registrationDeadline,
  }))

  return createHash('sha256').update(JSON.stringify(payload)).digest('hex')
}

async function postTeamsWebhook(webhookUrl, message) {
  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({ text: message }),
  })

  const bodyText = await response.text()
  if (!response.ok) {
    const preview = bodyText ? ` ${bodyText.slice(0, 200)}` : ''
    throw new Error(`Teams 웹훅 발송에 실패했습니다. (${response.status})${preview}`)
  }

  return bodyText
}

export async function initializeTeamsAutomation(runtime = {}) {
  await loadAutomationState()
  automationState = normalizeAutomationState(
    {
      ...automationState,
      webhookUrl: runtime.webhookUrl || '',
      teamsConfig: normalizeTeamsConfig(runtime.teamsConfig ?? {}, automationState.teamsConfig),
    },
    automationState,
  )
  scheduleAutomationTimer()
  return toSafeAutomationState()
}

export function getTeamsAutomationState() {
  return toSafeAutomationState()
}

export async function updateTeamsAutomationConfig(input = {}) {
  const nextState = normalizeAutomationState(
    {
      ...automationState,
      ...input,
      teamsConfig: normalizeTeamsConfig(input.teamsConfig ?? {}, automationState.teamsConfig),
    },
    automationState,
  )

  if (nextState.enabled) {
    requireConfiguredKeys(nextState)
  }

  automationState = nextState
  await persistAutomationState()
  scheduleAutomationTimer()
  return toSafeAutomationState()
}

export async function runTeamsReminderAutomation({ force = false, trigger = 'manual' } = {}) {
  if (inFlightRun) return inFlightRun

  inFlightRun = (async () => {
    try {
      requireConfiguredKeys(automationState)

      const baseDate = formatIsoDate(new Date())
      const syncResult = await syncTeamsLaunchThreads(automationState.teamsConfig)
      const rows = selectReminderRows(syncResult.records ?? [], baseDate, automationState.leadBusinessDays)
      const fingerprint = buildReminderFingerprint(rows)

      let sent = false
      let skippedBecauseUnchanged = false
      let message = `리마인드 대상 ${rows.length}건을 확인했습니다.`

      if (rows.length === 0) {
        automationState = normalizeAutomationState(
          {
            ...automationState,
            lastRunAt: new Date().toISOString(),
            lastRunStatus: 'no_targets',
            lastRunMessage: `${trigger === 'scheduled' ? '예약 실행' : '수동 실행'} 결과 현재 자동 알림 대상이 없습니다.`,
          },
          automationState,
        )
      } else if (!force && fingerprint === automationState.lastSentFingerprint) {
        skippedBecauseUnchanged = true
        message = '이전 자동 발송 이후 변동된 리마인드 대상이 없어 발송을 생략했습니다.'
        automationState = normalizeAutomationState(
          {
            ...automationState,
            lastRunAt: new Date().toISOString(),
            lastRunStatus: 'unchanged',
            lastRunMessage: message,
          },
          automationState,
        )
      } else {
        const reminderText = buildAutomationReminderText(syncResult.records ?? [], {
          today: baseDate,
          leadBusinessDays: automationState.leadBusinessDays,
        })
        await postTeamsWebhook(automationState.webhookUrl, reminderText)
        sent = true
        message = `리마인드 ${rows.length}건을 Teams로 발송했습니다.`
        automationState = normalizeAutomationState(
          {
            ...automationState,
            lastRunAt: new Date().toISOString(),
            lastRunStatus: 'sent',
            lastRunMessage: message,
            lastSentAt: new Date().toISOString(),
            lastSentCount: rows.length,
            lastSentFingerprint: fingerprint,
          },
          automationState,
        )
      }

      await persistAutomationState()

      return {
        ok: true,
        sent,
        skippedBecauseUnchanged,
        reminderCount: rows.length,
        fetched: syncResult.fetched,
        skipped: syncResult.skipped,
        records: syncResult.records,
        automation: toSafeAutomationState(),
        message,
      }
    } catch (error) {
      automationState = normalizeAutomationState(
        {
          ...automationState,
          lastRunAt: new Date().toISOString(),
          lastRunStatus: 'error',
          lastRunMessage: error instanceof Error ? error.message : 'Teams 자동 알림 실행에 실패했습니다.',
        },
        automationState,
      )
      await persistAutomationState()
      throw error
    } finally {
      inFlightRun = null
    }
  })()

  return inFlightRun
}
