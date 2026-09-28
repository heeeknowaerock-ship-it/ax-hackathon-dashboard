import { useEffect, useMemo, useState } from 'react'
import './App.css'
import {
  DEFAULT_REMINDER_POLICY,
  buildAllReminderMessages,
  buildAssigneeReminderMessage,
  buildReminderMessage,
  formatDisplayDate,
  getTodayIsoDate,
  groupReminderTargetsByAssignee,
  normalizeReminderPolicy,
  summarizeLaunches,
  type LaunchRecord,
  type LaunchStatus,
  type ReminderPolicy,
} from './launchDashboard'
import {
  getTeamsAutomation,
  getTeamsHealth,
  runTeamsAutomation,
  saveTeamsAutomation,
  syncTeamsThreads,
  type TeamsAutomationRunResponse,
  type TeamsAutomationState,
  type TeamsSyncConfig,
  type TeamsSyncResponse,
} from './teamsApi'
import { buildSyncSnapshot, formatSyncRunSummary, formatSyncTimestamp, type SyncRunSummary } from './syncMeta'

type FilterMode = '전체' | '리마인드 필요' | '완료 제외'
type SyncStatus = 'idle' | 'loading' | 'success' | 'error'
type BackendStatus = '확인 중' | '연결됨' | '미연결'

type EditableBooleanKey =
  | 'bibliographicReady'
  | 'manuscriptReady'
  | 'coverReady'
  | 'productionStarted'
  | 'registered'
  | 'approvalPending'
  | 'thumbsUpComplete'
  | 'completed'

const STORAGE_KEY = 'launch-thread-dashboard-v1'
const TEAMS_CONFIG_KEY = 'launch-thread-teams-config-v1'
const REMINDER_POLICY_KEY = 'launch-thread-reminder-policy-v1'
const SYNC_SUMMARY_KEY = 'launch-thread-sync-summary-v1'

const SAMPLE_RECORDS: LaunchRecord[] = [
  {
    id: 'launch-001',
    label: '에이블',
    assignee: '조이',
    author: '유연 작가',
    title: '새벽 끝의 로맨스',
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
    launchThreadUrl: 'https://teams.example.com/thread/launch-001',
    note: '원고만 들어오면 바로 제작 가능',
  },
  {
    id: 'launch-002',
    label: '원티드',
    assignee: '라토',
    author: '백운 작가',
    title: '검은 봉인의 귀환',
    format: '단행',
    platform: '리디',
    releaseDate: '2026-08-25',
    bibliographicReady: true,
    manuscriptReady: true,
    coverReady: true,
    productionStarted: true,
    registered: true,
    approvalPending: true,
    completed: false,
    thumbsUpComplete: false,
    launchThreadUrl: 'https://teams.example.com/thread/launch-002',
    note: '등록 완료, 승인 대기',
  },
  {
    id: 'launch-003',
    label: '비올렛',
    assignee: '희디',
    author: '은설 작가',
    title: '마지막 성좌의 밤',
    format: '연재',
    platform: '네이버 시리즈',
    releaseDate: '2026-08-29',
    bibliographicReady: false,
    manuscriptReady: false,
    coverReady: false,
    productionStarted: false,
    registered: false,
    approvalPending: false,
    completed: false,
    thumbsUpComplete: false,
    launchThreadUrl: 'https://teams.example.com/thread/launch-003',
    note: '초기 등록 정보 정리 필요',
  },
  {
    id: 'launch-004',
    label: '에이블',
    assignee: '데이지',
    author: '하린 작가',
    title: '푸른 여름의 오해',
    format: '단행',
    platform: '밀리의서재',
    releaseDate: '2026-09-02',
    bibliographicReady: true,
    manuscriptReady: true,
    coverReady: true,
    productionStarted: true,
    registered: true,
    approvalPending: false,
    completed: true,
    thumbsUpComplete: true,
    launchThreadUrl: 'https://teams.example.com/thread/launch-004',
    note: '완료 따봉 반영',
  },
]

const STATUS_OPTIONS: Array<'전체' | LaunchStatus> = [
  '전체',
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

const FILTER_OPTIONS: FilterMode[] = ['전체', '리마인드 필요', '완료 제외']

const DEFAULT_TEAMS_CONFIG: TeamsSyncConfig = {
  tenantId: '',
  clientId: '',
  clientSecret: '',
  teamId: '',
  channelId: '',
  limit: 50,
}

const DEFAULT_AUTOMATION_STATE: TeamsAutomationState = {
  enabled: false,
  webhookUrl: '',
  hasWebhookUrl: false,
  intervalMinutes: 30,
  leadBusinessDays: 3,
  teamsConfig: DEFAULT_TEAMS_CONFIG,
  hasClientSecret: false,
  lastRunAt: null,
  lastRunStatus: 'idle',
  lastRunMessage: '자동 알림이 아직 실행되지 않았습니다.',
  lastSentAt: null,
  lastSentCount: 0,
}

function readStoredRecords(): LaunchRecord[] {
  if (typeof window === 'undefined') return SAMPLE_RECORDS

  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) return SAMPLE_RECORDS

  try {
    const parsed = JSON.parse(raw) as LaunchRecord[]
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : SAMPLE_RECORDS
  } catch {
    return SAMPLE_RECORDS
  }
}

function readStoredTeamsConfig(): TeamsSyncConfig {
  if (typeof window === 'undefined') return DEFAULT_TEAMS_CONFIG

  const raw = window.localStorage.getItem(TEAMS_CONFIG_KEY)
  if (!raw) return DEFAULT_TEAMS_CONFIG

  try {
    const parsed = JSON.parse(raw) as Partial<TeamsSyncConfig>
    return {
      ...DEFAULT_TEAMS_CONFIG,
      ...parsed,
      clientSecret: '',
    }
  } catch {
    return DEFAULT_TEAMS_CONFIG
  }
}

function persistTeamsConfig(config: TeamsSyncConfig) {
  const { clientSecret: _clientSecret, ...safeConfig } = config
  window.localStorage.setItem(TEAMS_CONFIG_KEY, JSON.stringify(safeConfig))
}

function readStoredReminderPolicy(): ReminderPolicy {
  if (typeof window === 'undefined') return DEFAULT_REMINDER_POLICY

  const raw = window.localStorage.getItem(REMINDER_POLICY_KEY)
  if (!raw) return DEFAULT_REMINDER_POLICY

  try {
    const parsed = JSON.parse(raw) as Partial<ReminderPolicy>
    return normalizeReminderPolicy(parsed)
  } catch {
    return DEFAULT_REMINDER_POLICY
  }
}

function persistReminderPolicy(policy: ReminderPolicy) {
  window.localStorage.setItem(REMINDER_POLICY_KEY, JSON.stringify(policy))
}

function readStoredSyncSummary(): SyncRunSummary | null {
  if (typeof window === 'undefined') return null

  const raw = window.localStorage.getItem(SYNC_SUMMARY_KEY)
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as Partial<SyncRunSummary>
    if (typeof parsed.applied !== 'number' || typeof parsed.skipped !== 'number' || typeof parsed.fetched !== 'number') {
      return null
    }

    return {
      lastSyncedAt: typeof parsed.lastSyncedAt === 'string' ? parsed.lastSyncedAt : null,
      applied: parsed.applied,
      skipped: parsed.skipped,
      fetched: parsed.fetched,
    }
  } catch {
    return null
  }
}

function persistSyncSummary(summary: SyncRunSummary | null) {
  if (!summary) {
    window.localStorage.removeItem(SYNC_SUMMARY_KEY)
    return
  }

  window.localStorage.setItem(SYNC_SUMMARY_KEY, JSON.stringify(summary))
}

function statusTone(status: LaunchStatus) {
  switch (status) {
    case '완료':
      return 'green'
    case '등록 후 승인 대기중':
    case '등록 완료':
    case '제작 진행중':
    case '제작 가능':
      return 'blue'
    case '서지정보 대기중':
    case '원고 대기중':
    case '표지 대기중':
      return 'amber'
    default:
      return 'slate'
  }
}

function App() {
  const [records, setRecords] = useState<LaunchRecord[]>(() => readStoredRecords())
  const [today, setToday] = useState(getTodayIsoDate())
  const [labelFilter, setLabelFilter] = useState('전체')
  const [statusFilter, setStatusFilter] = useState<'전체' | LaunchStatus>('전체')
  const [modeFilter, setModeFilter] = useState<FilterMode>('전체')
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null)
  const [copiedBundleAssignee, setCopiedBundleAssignee] = useState<string | null>(null)
  const [copiedAllReminderBundles, setCopiedAllReminderBundles] = useState(false)
  const [teamsConfig, setTeamsConfig] = useState<TeamsSyncConfig>(() => readStoredTeamsConfig())
  const [reminderPolicy, setReminderPolicy] = useState<ReminderPolicy>(() => readStoredReminderPolicy())
  const [syncSummary, setSyncSummary] = useState<SyncRunSummary | null>(() => readStoredSyncSummary())
  const [backendStatus, setBackendStatus] = useState<BackendStatus>('확인 중')
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle')
  const [syncMessage, setSyncMessage] = useState(
    'Teams 동기화로 론칭 타래 현황을 현재 표로 가져올 수 있습니다.',
  )
  const [automationState, setAutomationState] = useState<TeamsAutomationState>(DEFAULT_AUTOMATION_STATE)
  const [automationStatus, setAutomationStatus] = useState<SyncStatus>('idle')
  const [automationMessage, setAutomationMessage] = useState('Teams 자동 알림은 아직 설정되지 않았습니다.')

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records))
  }, [records])

  useEffect(() => {
    persistTeamsConfig(teamsConfig)
  }, [teamsConfig])

  useEffect(() => {
    persistReminderPolicy(reminderPolicy)
  }, [reminderPolicy])

  useEffect(() => {
    persistSyncSummary(syncSummary)
  }, [syncSummary])

  useEffect(() => {
    void (async () => {
      try {
        await getTeamsHealth()
        setBackendStatus('연결됨')
      } catch {
        setBackendStatus('미연결')
      }

      try {
        const result = await getTeamsAutomation()
        setAutomationState(result.automation)
        setAutomationMessage(result.automation.lastRunMessage)
        setReminderPolicy((current) =>
          normalizeReminderPolicy({
            ...current,
            leadBusinessDays: result.automation.leadBusinessDays,
          }),
        )
        setTeamsConfig((current) => ({
          ...current,
          ...result.automation.teamsConfig,
          clientSecret: current.clientSecret,
        }))
      } catch {
        setAutomationMessage('자동 알림 설정 정보를 아직 불러오지 못했습니다.')
      }
    })()
  }, [])

  const summary = useMemo(
    () => summarizeLaunches(records, today, reminderPolicy),
    [records, reminderPolicy, today],
  )
  const reminderGroups = useMemo(
    () => groupReminderTargetsByAssignee(summary.reminderTargets),
    [summary.reminderTargets],
  )

  const availableLabels = useMemo(
    () => ['전체', ...new Set(records.map((record) => record.label))],
    [records],
  )

  const filteredRows = useMemo(() => {
    return summary.rows.filter((row) => {
      if (labelFilter !== '전체' && row.label !== labelFilter) return false
      if (statusFilter !== '전체' && row.status !== statusFilter) return false
      if (modeFilter === '리마인드 필요' && !row.reminderNeeded) return false
      if (modeFilter === '완료 제외' && row.status === '완료') return false
      return true
    })
  }, [labelFilter, modeFilter, statusFilter, summary.rows])

  const updateRecord = <K extends keyof LaunchRecord>(id: string, key: K, value: LaunchRecord[K]) => {
    setRecords((current) =>
      current.map((record) => (record.id === id ? { ...record, [key]: value } : record)),
    )
  }

  const updateTeamsConfig = <K extends keyof TeamsSyncConfig>(key: K, value: TeamsSyncConfig[K]) => {
    setTeamsConfig((current) => ({ ...current, [key]: value }))
  }

  const updateReminderPolicy = <K extends keyof ReminderPolicy>(key: K, value: ReminderPolicy[K]) => {
    setReminderPolicy((current) => normalizeReminderPolicy({ ...current, [key]: value }))
  }

  const updateAutomationField = <K extends keyof TeamsAutomationState>(key: K, value: TeamsAutomationState[K]) => {
    setAutomationState((current) => ({ ...current, [key]: value }))
  }

  const applyAutomationState = (nextState: TeamsAutomationState) => {
    setAutomationState(nextState)
    setReminderPolicy((current) =>
      normalizeReminderPolicy({
        ...current,
        leadBusinessDays: nextState.leadBusinessDays,
      }),
    )
  }

  const toggleBoolean = (id: string, key: EditableBooleanKey) => {
    setRecords((current) =>
      current.map((record) =>
        record.id === id ? { ...record, [key]: !record[key] } : record,
      ),
    )
  }

  const copyReminder = async (id: string) => {
    const record = records.find((item) => item.id === id)
    if (!record) return

    await navigator.clipboard.writeText(buildReminderMessage(record, today))
    setCopiedMessageId(id)
    window.setTimeout(() => setCopiedMessageId((current) => (current === id ? null : current)), 1800)
  }

  const copyAssigneeReminderBundle = async (assignee: string) => {
    const group = reminderGroups.find((item) => item.assignee === assignee)
    if (!group) return

    await navigator.clipboard.writeText(buildAssigneeReminderMessage(group, summary.reminderTargets))
    setCopiedBundleAssignee(assignee)
    window.setTimeout(
      () => setCopiedBundleAssignee((current) => (current === assignee ? null : current)),
      1800,
    )
  }

  const copyAllReminderBundles = async () => {
    if (summary.reminderTargets.length === 0) return

    await navigator.clipboard.writeText(buildAllReminderMessages(summary.reminderTargets))
    setCopiedAllReminderBundles(true)
    window.setTimeout(() => setCopiedAllReminderBundles(false), 1800)
  }

  const runTeamsSync = async () => {
    setSyncStatus('loading')
    setSyncMessage('Teams 동기화를 실행해 론칭 타래와 답글을 불러오는 중입니다...')

    try {
      const result: TeamsSyncResponse = await syncTeamsThreads(teamsConfig)
      const nextSyncSummary = buildSyncSnapshot(result)
      setRecords(result.records as LaunchRecord[])
      setSyncSummary(nextSyncSummary)
      setSyncStatus('success')
      setSyncMessage(formatSyncRunSummary(nextSyncSummary))
    } catch (error) {
      setSyncStatus('error')
      setSyncMessage(error instanceof Error ? error.message : 'Teams 동기화에 실패했습니다.')
    }
  }

  const saveAutomationConfig = async () => {
    setAutomationStatus('loading')
    setAutomationMessage('Teams 자동 알림 설정을 저장하는 중입니다...')

    try {
      const result = await saveTeamsAutomation({
        enabled: automationState.enabled,
        intervalMinutes: automationState.intervalMinutes,
        leadBusinessDays: reminderPolicy.leadBusinessDays,
        teamsConfig,
      })
      applyAutomationState(result.automation)
      setAutomationStatus('success')
      setAutomationMessage(result.message)
    } catch (error) {
      setAutomationStatus('error')
      setAutomationMessage(error instanceof Error ? error.message : '자동 알림 설정 저장에 실패했습니다.')
    }
  }

  const runAutomationNow = async () => {
    setAutomationStatus('loading')
    setAutomationMessage('Teams 자동 알림을 즉시 1회 실행하는 중입니다...')

    try {
      const result: TeamsAutomationRunResponse = await runTeamsAutomation({ force: true })
      const nextSyncSummary = buildSyncSnapshot(result)
      setRecords(result.records as LaunchRecord[])
      setSyncSummary(nextSyncSummary)
      applyAutomationState(result.automation)
      setAutomationStatus('success')
      setAutomationMessage(result.message)
    } catch (error) {
      setAutomationStatus('error')
      setAutomationMessage(error instanceof Error ? error.message : '자동 알림 실행에 실패했습니다.')
    }
  }

  return (
    <div className="launch-app">
      <header className="hero-card">
        <div>
          <p className="eyebrow">AX 해커톤 · 론칭 운영 1차</p>
          <h1>론칭 타래 현황 대시보드</h1>
          <p className="hero-copy">
            Teams 론칭 타래를 읽어와 작품 일정·준비물·리마인드 대상을 한 화면에서 보고,
            위험 건은 Teams 채널로 자동 발송까지 이어지게 만든 운영 대시보드입니다.
          </p>
          <div className="hero-meta">
            <label>
              기준일
              <input type="date" value={today} onChange={(event) => setToday(event.target.value)} />
            </label>
            <button className="secondary-button" onClick={() => setRecords(SAMPLE_RECORDS)} type="button">
              샘플 데이터로 초기화
            </button>
          </div>
        </div>
        <div className="hero-metrics">
          <article className="metric-card accent">
            <span>전체 작품</span>
            <strong>{summary.rows.length}</strong>
          </article>
          <article className="metric-card danger">
            <span>{reminderPolicy.leadBusinessDays}영업일 이내 리마인드</span>
            <strong>{summary.reminderTargets.length}</strong>
          </article>
          <article className="metric-card">
            <span>완료</span>
            <strong>{summary.statusCounts['완료']}</strong>
          </article>
          <article className="metric-card">
            <span>승인 대기</span>
            <strong>{summary.statusCounts['등록 후 승인 대기중']}</strong>
          </article>
        </div>
      </header>

      <section className="content-grid">
        <section className="panel panel-full readonly-panel">
          <div className="panel-header compact">
            <div>
              <h2>오늘 구현 범위</h2>
              <p>Teams 론칭 타래를 읽어와 현황판에 반영하고, 위험 건을 Teams 채널로 자동 알림 발송하는 흐름까지 한 번에 다룹니다.</p>
            </div>
          </div>
          <div className="readonly-bullets">
            <span>가능: 타래 본문 읽기</span>
            <span>가능: 답글/이모지 기반 상태 파악</span>
            <span>가능: 마감 임박 현황 표시</span>
            <span>가능: Teams 웹훅 자동 알림 발송</span>
          </div>
        </section>

        <section className="panel panel-full settings-panel">
          <div className="panel-header compact">
            <div>
              <h2>리마인드 설정</h2>
              <p>지금은 로컬 저장 기준이지만, 몇 영업일 전부터 위험 건으로 볼지 바로 조절할 수 있게 열어뒀습니다.</p>
            </div>
          </div>
          <div className="settings-grid-inline">
            <label>
              리마인드 시작 기준
              <select
                value={reminderPolicy.leadBusinessDays}
                onChange={(event) => updateReminderPolicy('leadBusinessDays', Number(event.target.value) || 3)}
              >
                {Array.from({ length: 10 }, (_, index) => index + 1).map((days) => (
                  <option key={days} value={days}>
                    마감 {days}영업일 전부터
                  </option>
                ))}
              </select>
            </label>
            <div className="policy-summary-card">
              <strong>현재 기준</strong>
              <span>등록 완료가 되지 않았고</span>
              <span>등록 마감까지 {reminderPolicy.leadBusinessDays}영업일 이하인 작품</span>
            </div>
          </div>
        </section>

        <div className="panel panel-primary">
          <div className="panel-header">
            <div>
              <h2>위험 건 현황</h2>
              <p>
                등록 마감일까지 {reminderPolicy.leadBusinessDays}영업일 이하인데 아직 등록 완료가 되지 않은 작품만
                따로 보여줍니다.
              </p>
            </div>
          </div>

          <div className="alert-stack">
            {summary.reminderTargets.length === 0 ? (
              <div className="empty-state">현재 기준일 기준으로 리마인드 대상이 없습니다.</div>
            ) : (
              summary.reminderTargets.map((row) => (
                <article className="alert-card" key={row.id}>
                  <div className="alert-card-head">
                    <div>
                      <p className="alert-title">{row.title}</p>
                      <p className="alert-subtitle">
                        {row.label} · {row.platform} · {row.assignee}
                      </p>
                    </div>
                    <span className={`status-pill ${statusTone(row.status)}`}>{row.status}</span>
                  </div>
                  <dl className="alert-grid">
                    <div>
                      <dt>출간일</dt>
                      <dd>{formatDisplayDate(row.releaseDate)}</dd>
                    </div>
                    <div>
                      <dt>등록 마감일</dt>
                      <dd>{formatDisplayDate(row.registrationDeadline)}</dd>
                    </div>
                    <div>
                      <dt>남은 영업일</dt>
                      <dd>{row.businessDaysLeft ?? '미정'}</dd>
                    </div>
                    <div>
                      <dt>차단 단계</dt>
                      <dd>{row.status}</dd>
                    </div>
                  </dl>
                  <div className="button-row">
                    <a className="link-button" href={row.launchThreadUrl} rel="noreferrer" target="_blank">
                      타래 열기
                    </a>
                    <button className="secondary-button" onClick={() => copyReminder(row.id)} type="button">
                      {copiedMessageId === row.id ? '알림 문구 복사됨' : '알림 문구 복사'}
                    </button>
                  </div>
                </article>
              ))
            )}
          </div>
        </div>

        <aside className="panel panel-side">
          <div className="panel-header compact">
            <div>
              <h2>상태 요약</h2>
              <p>병목이 어디에 몰리는지 바로 볼 수 있게 상태별 건수를 나눴습니다.</p>
            </div>
          </div>
          <div className="status-summary-list">
            {Object.entries(summary.statusCounts).map(([status, count]) => (
              <div className="status-summary-item" key={status}>
                <span className={`status-pill ${statusTone(status as LaunchStatus)}`}>{status}</span>
                <strong>{count}</strong>
              </div>
            ))}
          </div>
        </aside>

        <aside className="panel panel-side">
          <div className="panel-header compact">
            <div>
              <h2>담당자별 리마인드</h2>
              <p>누가 먼저 챙겨야 하는지 담당자 기준으로 급한 순서대로 묶어 보여줍니다.</p>
            </div>
            <button
              className="secondary-button reminder-bulk-button"
              disabled={reminderGroups.length === 0}
              onClick={copyAllReminderBundles}
              type="button"
            >
              {copiedAllReminderBundles ? '전체 리마인드 복사됨' : '전체 리마인드 복사'}
            </button>
          </div>
          <div className="status-summary-list">
            {reminderGroups.length === 0 ? (
              <div className="empty-state">현재 기준일 기준으로 담당자 리마인드 대상이 없습니다.</div>
            ) : (
              reminderGroups.map((group) => (
                <div className="reminder-group-card" key={group.assignee}>
                  <div className="reminder-group-head">
                    <strong>{group.assignee}</strong>
                    <span className="mini-pill danger">{group.count}건</span>
                  </div>
                  <p>
                    가장 급한 건 {group.minBusinessDaysLeft ?? '미정'}영업일 · {group.titles.join(' / ')}
                  </p>
                  <button
                    className="secondary-button reminder-bundle-button"
                    onClick={() => copyAssigneeReminderBundle(group.assignee)}
                    type="button"
                  >
                    {copiedBundleAssignee === group.assignee ? '담당자 묶음 문구 복사됨' : '담당자 묶음 문구 복사'}
                  </button>
                </div>
              ))
            )}
          </div>
        </aside>

        <section className="panel panel-full">
          <div className="panel-header">
            <div>
              <h2>Teams 연동 설정</h2>
              <p>Microsoft Graph 자격증명은 브라우저가 아니라 서버의 안전한 환경변수에서만 관리합니다.</p>
            </div>
            <span className={`mini-pill ${backendStatus === '연결됨' ? 'safe' : 'danger'}`}>
              동기화 서버 {backendStatus}
            </span>
          </div>

          <div className="teams-grid">
            <div className="sync-meta-card">
              <strong>서버 자격증명</strong>
              <span>
                {automationState.hasClientSecret
                  ? '서버에 안전하게 설정됨'
                  : '서버 환경설정 필요'}
              </span>
            </div>
            <label>
              조회 개수
              <input
                type="number"
                min={1}
                max={200}
                value={teamsConfig.limit}
                onChange={(event) => updateTeamsConfig('limit', Number(event.target.value) || 50)}
              />
            </label>
          </div>

          <div className="teams-actions">
            <button className="link-button" disabled={syncStatus === 'loading'} onClick={runTeamsSync} type="button">
              {syncStatus === 'loading' ? 'Teams 읽는 중...' : 'Teams 현황 불러오기'}
            </button>
            <p className={`sync-message ${syncStatus}`}>{syncMessage}</p>
          </div>

          <div className="sync-meta-grid">
            <div className="sync-meta-card">
              <strong>마지막 동기화</strong>
              <span>{formatSyncTimestamp(syncSummary?.lastSyncedAt ?? null)}</span>
            </div>
            <div className="sync-meta-card">
              <strong>최근 반영 결과</strong>
              <span>
                {syncSummary ? formatSyncRunSummary(syncSummary) : '아직 동기화 결과가 없습니다'}
              </span>
            </div>
          </div>
        </section>

        <section className="panel panel-full automation-panel">
          <div className="panel-header">
            <div>
              <h2>Teams 자동 알림 발송</h2>
              <p>위험 건을 Teams 채널 웹훅으로 자동 발송합니다. 같은 대상이면 중복 발송을 자동으로 건너뜁니다.</p>
            </div>
            <span className={`mini-pill ${automationState.enabled ? 'safe' : 'danger'}`}>
              자동 발송 {automationState.enabled ? '켜짐' : '꺼짐'}
            </span>
          </div>

          <div className="teams-grid automation-grid">
            <div className="sync-meta-card">
              <strong>Teams Workflow</strong>
              <span>
                {automationState.hasWebhookUrl
                  ? '서버에 안전하게 설정됨'
                  : '서버 환경설정 필요'}
              </span>
            </div>
            <label>
              자동 발송 사용
              <select
                value={automationState.enabled ? '켜기' : '끄기'}
                onChange={(event) => updateAutomationField('enabled', event.target.value === '켜기')}
              >
                <option value="끄기">끄기</option>
                <option value="켜기">켜기</option>
              </select>
            </label>
            <label>
              실행 주기(분)
              <input
                type="number"
                min={5}
                max={1440}
                value={automationState.intervalMinutes}
                onChange={(event) => updateAutomationField('intervalMinutes', Number(event.target.value) || 30)}
              />
            </label>
            <label>
              리마인드 기준
              <select
                value={reminderPolicy.leadBusinessDays}
                onChange={(event) => {
                  const nextLeadDays = Number(event.target.value) || 3
                  updateReminderPolicy('leadBusinessDays', nextLeadDays)
                  updateAutomationField('leadBusinessDays', nextLeadDays)
                }}
              >
                {Array.from({ length: 10 }, (_, index) => index + 1).map((days) => (
                  <option key={`automation-${days}`} value={days}>
                    등록 마감 {days}영업일 전부터
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="teams-actions automation-actions">
            <button className="link-button" disabled={automationStatus === 'loading'} onClick={saveAutomationConfig} type="button">
              {automationStatus === 'loading' ? '자동 알림 저장 중...' : '자동 알림 설정 저장'}
            </button>
            <button className="secondary-button" disabled={automationStatus === 'loading'} onClick={runAutomationNow} type="button">
              지금 1회 발송
            </button>
            <p className={`sync-message ${automationStatus}`}>{automationMessage}</p>
          </div>

          <div className="sync-meta-grid">
            <div className="sync-meta-card">
              <strong>최근 자동 실행</strong>
              <span>{formatSyncTimestamp(automationState.lastRunAt)}</span>
            </div>
            <div className="sync-meta-card">
              <strong>최근 발송 결과</strong>
              <span>{automationState.lastRunMessage}</span>
            </div>
            <div className="sync-meta-card">
              <strong>최근 실제 발송 시각</strong>
              <span>{formatSyncTimestamp(automationState.lastSentAt)}</span>
            </div>
            <div className="sync-meta-card">
              <strong>최근 발송 건수</strong>
              <span>{automationState.lastSentCount > 0 ? `${automationState.lastSentCount}건` : '아직 발송 없음'}</span>
            </div>
          </div>
        </section>

        <section className="panel panel-full">
          <div className="panel-header">
            <div>
              <h2>작품 일정 관리 표</h2>
              <p>체크박스를 바꾸면 현재 단계와 리마인드 대상이 즉시 다시 계산됩니다.</p>
            </div>
            <div className="filter-row">
              <label>
                레이블
                <select value={labelFilter} onChange={(event) => setLabelFilter(event.target.value)}>
                  {availableLabels.map((label) => (
                    <option key={label} value={label}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                상태
                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value as '전체' | LaunchStatus)}
                >
                  {STATUS_OPTIONS.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                보기
                <select
                  value={modeFilter}
                  onChange={(event) => setModeFilter(event.target.value as FilterMode)}
                >
                  {FILTER_OPTIONS.map((mode) => (
                    <option key={mode} value={mode}>
                      {mode}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <div className="table-wrap">
            <table className="launch-table">
              <thead>
                <tr>
                  <th>작품</th>
                  <th>기본 정보</th>
                  <th>일정</th>
                  <th>현재 단계</th>
                  <th>준비 체크</th>
                  <th>마감 체크</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <div className="title-cell">
                        <strong>{row.title}</strong>
                        <span>{row.author}</span>
                        <small>{row.note || '메모 없음'}</small>
                      </div>
                    </td>
                    <td>
                      <div className="meta-stack">
                        <span>{row.label}</span>
                        <span>{row.assignee || '담당자 미입력'}</span>
                        <span>
                          {row.platform} · {row.format}
                        </span>
                        <a href={row.launchThreadUrl} rel="noreferrer" target="_blank">
                          Teams 타래
                        </a>
                      </div>
                    </td>
                    <td>
                      <div className="date-stack">
                        <label>
                          출간일
                          <input
                            type="date"
                            value={row.releaseDate}
                            onChange={(event) => updateRecord(row.id, 'releaseDate', event.target.value)}
                          />
                        </label>
                        <div className="date-chip">등록 마감 {formatDisplayDate(row.registrationDeadline)}</div>
                        <div className={`deadline-chip ${row.reminderNeeded ? 'danger' : 'normal'}`}>
                          {row.businessDaysLeft === null ? '일정 미정' : `남은 영업일 ${row.businessDaysLeft}일`}
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="status-cell">
                        <span className={`status-pill ${statusTone(row.status)}`}>{row.status}</span>
                        <span className={`mini-pill ${row.reminderNeeded ? 'danger' : 'safe'}`}>
                          {row.reminderNeeded ? '리마인드 필요' : '정상'}
                        </span>
                      </div>
                    </td>
                    <td>
                      <div className="check-grid">
                        <label>
                          <input
                            checked={row.bibliographicReady}
                            onChange={() => toggleBoolean(row.id, 'bibliographicReady')}
                            type="checkbox"
                          />
                          서지
                        </label>
                        <label>
                          <input
                            checked={row.manuscriptReady}
                            onChange={() => toggleBoolean(row.id, 'manuscriptReady')}
                            type="checkbox"
                          />
                          원고
                        </label>
                        <label>
                          <input
                            checked={row.coverReady}
                            onChange={() => toggleBoolean(row.id, 'coverReady')}
                            type="checkbox"
                          />
                          표지
                        </label>
                        <label>
                          <input
                            checked={row.productionStarted}
                            onChange={() => toggleBoolean(row.id, 'productionStarted')}
                            type="checkbox"
                          />
                          제작 시작
                        </label>
                      </div>
                    </td>
                    <td>
                      <div className="check-grid">
                        <label>
                          <input
                            checked={row.registered}
                            onChange={() => toggleBoolean(row.id, 'registered')}
                            type="checkbox"
                          />
                          등록 완료
                        </label>
                        <label>
                          <input
                            checked={row.approvalPending}
                            onChange={() => toggleBoolean(row.id, 'approvalPending')}
                            type="checkbox"
                          />
                          승인 대기
                        </label>
                        <label>
                          <input
                            checked={row.completed}
                            onChange={() => toggleBoolean(row.id, 'completed')}
                            type="checkbox"
                          />
                          완료 처리
                        </label>
                        <label>
                          <input
                            checked={row.thumbsUpComplete}
                            onChange={() => toggleBoolean(row.id, 'thumbsUpComplete')}
                            type="checkbox"
                          />
                          따봉 완료
                        </label>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </section>
    </div>
  )
}

export default App
