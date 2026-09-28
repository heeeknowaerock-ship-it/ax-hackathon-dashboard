export type LaunchStatus =
  | '일정 미확정'
  | '서지정보 대기중'
  | '원고 대기중'
  | '표지 대기중'
  | '제작 가능'
  | '제작 진행중'
  | '등록 완료'
  | '등록 후 승인 대기중'
  | '완료'

export type LaunchRecord = {
  id: string
  label: string
  assignee: string
  author: string
  title: string
  format: '연재' | '단행'
  platform: string
  releaseDate: string
  bibliographicReady: boolean
  manuscriptReady: boolean
  coverReady: boolean
  productionStarted: boolean
  registered: boolean
  approvalPending: boolean
  completed: boolean
  thumbsUpComplete: boolean
  launchThreadUrl: string
  note?: string
}

export type LaunchRow = LaunchRecord & {
  registrationDeadline: string
  status: LaunchStatus
  businessDaysLeft: number | null
  reminderNeeded: boolean
}

export type DashboardSummary = {
  rows: LaunchRow[]
  reminderTargets: LaunchRow[]
  statusCounts: Record<LaunchStatus, number>
}

export type ReminderGroup = {
  assignee: string
  count: number
  titles: string[]
  minBusinessDaysLeft: number | null
}

export type ReminderPolicy = {
  leadBusinessDays: number
}

export const DEFAULT_REMINDER_POLICY: ReminderPolicy = {
  leadBusinessDays: 3,
}

export function normalizeReminderPolicy(policy: Partial<ReminderPolicy> | null | undefined): ReminderPolicy {
  const requestedLeadDays = Number(policy?.leadBusinessDays)
  const leadBusinessDays = Number.isFinite(requestedLeadDays)
    ? requestedLeadDays
    : DEFAULT_REMINDER_POLICY.leadBusinessDays

  return {
    ...DEFAULT_REMINDER_POLICY,
    ...policy,
    leadBusinessDays: Math.min(10, Math.max(1, leadBusinessDays)),
  }
}

const STATUS_ORDER: LaunchStatus[] = [
  '일정 미확정',
  '서지정보 대기중',
  '원고 대기중',
  '표지 대기중',
  '제작 가능',
  '제작 진행중',
  '등록 완료',
  '등록 후 승인 대기중',
  '완료',
]

function parseIsoDate(value: string): Date | null {
  if (!value) return null

  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return null

  const date = new Date(Date.UTC(year, month - 1, day))
  if (Number.isNaN(date.getTime())) return null
  return date
}

function formatIsoDate(date: Date): string {
  const year = date.getUTCFullYear()
  const month = `${date.getUTCMonth() + 1}`.padStart(2, '0')
  const day = `${date.getUTCDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

function isBusinessDay(date: Date): boolean {
  const day = date.getUTCDay()
  return day !== 0 && day !== 6
}

function shiftBusinessDays(input: string, delta: number): string {
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

export function calculateRegistrationDeadline(releaseDate: string, leadBusinessDays = 7): string {
  if (!releaseDate) return ''
  return shiftBusinessDays(releaseDate, -leadBusinessDays)
}

export function deriveLaunchStatus(record: LaunchRecord): LaunchStatus {
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

export function getBusinessDaysUntil(fromDate: string, toDate: string): number | null {
  const from = parseIsoDate(fromDate)
  const to = parseIsoDate(toDate)
  if (!from || !to) return null

  if (formatIsoDate(from) === formatIsoDate(to)) {
    return 0
  }

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

export function needsReminder(
  record: LaunchRecord,
  today: string,
  policy: ReminderPolicy = DEFAULT_REMINDER_POLICY,
): boolean {
  if (record.registered || record.thumbsUpComplete || record.completed || !record.releaseDate) return false

  const deadline = calculateRegistrationDeadline(record.releaseDate)
  const remaining = getBusinessDaysUntil(today, deadline)

  return remaining !== null && remaining <= policy.leadBusinessDays
}

export function toLaunchRow(
  record: LaunchRecord,
  today: string,
  policy: ReminderPolicy = DEFAULT_REMINDER_POLICY,
): LaunchRow {
  const registrationDeadline = calculateRegistrationDeadline(record.releaseDate)
  const businessDaysLeft = registrationDeadline ? getBusinessDaysUntil(today, registrationDeadline) : null
  const status = deriveLaunchStatus(record)

  return {
    ...record,
    registrationDeadline,
    status,
    businessDaysLeft,
    reminderNeeded: needsReminder(record, today, policy),
  }
}

function createStatusCounts(): Record<LaunchStatus, number> {
  return STATUS_ORDER.reduce(
    (counts, status) => {
      counts[status] = 0
      return counts
    },
    {} as Record<LaunchStatus, number>,
  )
}

export function summarizeLaunches(
  records: LaunchRecord[],
  today: string,
  policy: ReminderPolicy = DEFAULT_REMINDER_POLICY,
): DashboardSummary {
  const rows = records.map((record) => toLaunchRow(record, today, policy))
  const statusCounts = createStatusCounts()

  for (const row of rows) {
    statusCounts[row.status] += 1
  }

  const reminderTargets = rows
    .filter((row) => row.reminderNeeded)
    .sort((left, right) => {
      const leftDays = left.businessDaysLeft ?? Number.POSITIVE_INFINITY
      const rightDays = right.businessDaysLeft ?? Number.POSITIVE_INFINITY
      return leftDays - rightDays
    })

  return { rows, reminderTargets, statusCounts }
}

export function groupReminderTargetsByAssignee(rows: LaunchRow[]): ReminderGroup[] {
  const grouped = new Map<string, ReminderGroup>()

  for (const row of rows) {
    const assignee = row.assignee || '담당자 미지정'
    const current = grouped.get(assignee)

    if (!current) {
      grouped.set(assignee, {
        assignee,
        count: 1,
        titles: [row.title],
        minBusinessDaysLeft: row.businessDaysLeft,
      })
      continue
    }

    current.count += 1
    current.titles.push(row.title)
    current.minBusinessDaysLeft =
      current.minBusinessDaysLeft === null
        ? row.businessDaysLeft
        : row.businessDaysLeft === null
          ? current.minBusinessDaysLeft
          : Math.min(current.minBusinessDaysLeft, row.businessDaysLeft)
  }

  return [...grouped.values()]
    .map((group) => ({
      ...group,
      titles: [...group.titles],
    }))
    .sort((left, right) => {
      const leftDays = left.minBusinessDaysLeft ?? Number.POSITIVE_INFINITY
      const rightDays = right.minBusinessDaysLeft ?? Number.POSITIVE_INFINITY

      if (leftDays !== rightDays) return leftDays - rightDays
      if (left.count !== right.count) return right.count - left.count
      return left.assignee.localeCompare(right.assignee, 'ko')
    })
    .map((group) => ({
      ...group,
      titles: [...group.titles],
    }))
}

export function buildAssigneeReminderMessage(group: ReminderGroup, rows: LaunchRow[]): string {
  const groupedRows = rows
    .filter((row) => (row.assignee || '담당자 미지정') === group.assignee)
    .sort((left, right) => {
      const leftDays = left.businessDaysLeft ?? Number.POSITIVE_INFINITY
      const rightDays = right.businessDaysLeft ?? Number.POSITIVE_INFINITY
      return leftDays - rightDays
    })

  const lines = groupedRows.flatMap((row, index) => {
    const businessDaysText = row.businessDaysLeft === null ? '계산 불가' : `${row.businessDaysLeft}일`

    return [
      `${index + 1}. ${row.title}`,
      `- 레이블/플랫폼: ${row.label} / ${row.platform}`,
      `- 현재 단계: ${row.status}`,
      `- 남은 영업일: ${businessDaysText}`,
      `- 타래: ${row.launchThreadUrl}`,
    ]
  })

  return [
    '[담당자별 론칭 리마인드]',
    `담당자: ${group.assignee}`,
    `총 ${group.count}건`,
    '',
    ...lines,
  ].join('\n')
}

export function buildAllReminderMessages(rows: LaunchRow[]): string {
  const groups = groupReminderTargetsByAssignee(rows)
  const sections = groups.map((group) => buildAssigneeReminderMessage(group, rows).replace('[담당자별 론칭 리마인드]\n', ''))

  return [
    '[전체 론칭 리마인드]',
    `총 ${rows.length}건 · 담당자 ${groups.length}명`,
    '',
    ...sections.flatMap((section, index) => (index === 0 ? [section] : ['', section])),
  ].join('\n')
}

export function buildReminderMessage(record: LaunchRecord, today: string): string {
  const row = toLaunchRow(record, today)
  const businessDaysText = row.businessDaysLeft === null ? '계산 불가' : `${row.businessDaysLeft}일`

  return [
    '[론칭 리마인드]',
    `작품명: ${row.title}`,
    `레이블: ${row.label}`,
    `플랫폼: ${row.platform}`,
    `등록 마감일: ${row.registrationDeadline || '미정'}`,
    `현재 단계: ${row.status}`,
    `남은 영업일: ${businessDaysText}`,
    `타래: ${row.launchThreadUrl}`,
  ].join('\n')
}

export function formatDisplayDate(value: string): string {
  const date = parseIsoDate(value)
  if (!date) return '미정'
  return `${date.getUTCMonth() + 1}/${date.getUTCDate()}`
}

export function getStatusOrderIndex(status: LaunchStatus): number {
  return STATUS_ORDER.indexOf(status)
}

export function getTodayIsoDate(): string {
  return formatIsoDate(new Date())
}
