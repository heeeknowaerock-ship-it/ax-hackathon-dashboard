export type TeamsSyncConfig = {
  tenantId: string
  clientId: string
  clientSecret: string
  teamId: string
  channelId: string
  limit: number
}

export type TeamsAutomationState = {
  enabled: boolean
  webhookUrl: string
  hasWebhookUrl: boolean
  intervalMinutes: number
  leadBusinessDays: number
  teamsConfig: TeamsSyncConfig
  hasClientSecret: boolean
  lastRunAt: string | null
  lastRunStatus: string
  lastRunMessage: string
  lastSentAt: string | null
  lastSentCount: number
}

export type TeamsSyncResponse = {
  ok: boolean
  records: unknown[]
  skipped: number
  fetched: number
}

export type TeamsAutomationResponse = {
  ok: boolean
  automation: TeamsAutomationState
  message: string
}

export type TeamsAutomationRunResponse = {
  ok: boolean
  automation: TeamsAutomationState
  records: unknown[]
  fetched: number
  skipped: number
  reminderCount: number
  sent: boolean
  skippedBecauseUnchanged: boolean
  message: string
}

const API_BASE = import.meta.env.VITE_TEAMS_SYNC_URL ?? 'http://127.0.0.1:8787'

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })

  const data = (await response.json()) as T & { error?: string }

  if (!response.ok) {
    throw new Error(data.error || 'Teams 연동 요청에 실패했습니다.')
  }

  return data
}

export async function getTeamsHealth(): Promise<{ ok: boolean; service: string; port: number }> {
  return fetchJson('/api/teams/health', { method: 'GET' })
}

export async function getTeamsAutomation(): Promise<{ ok: boolean; automation: TeamsAutomationState }> {
  return fetchJson('/api/teams/automation', { method: 'GET' })
}

export async function syncTeamsThreads(config: TeamsSyncConfig): Promise<TeamsSyncResponse> {
  return fetchJson('/api/teams/sync', {
    method: 'POST',
    body: JSON.stringify(config),
  })
}

export async function saveTeamsAutomation(payload: {
  enabled: boolean
  intervalMinutes: number
  leadBusinessDays: number
  teamsConfig: TeamsSyncConfig
}): Promise<TeamsAutomationResponse> {
  return fetchJson('/api/teams/automation', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function runTeamsAutomation(payload: { force?: boolean } = {}): Promise<TeamsAutomationRunResponse> {
  return fetchJson('/api/teams/automation/run', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}
