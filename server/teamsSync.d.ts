export type TeamsReaction = { reactionType?: string }
export type TeamsBody = { content?: string }
export type TeamsReply = { id?: string; body?: TeamsBody; reactions?: TeamsReaction[] }
export type TeamsChannelMessage = {
  id?: string
  subject?: string
  webUrl?: string
  body?: TeamsBody
  from?: { user?: { displayName?: string } }
  reactions?: TeamsReaction[]
  replies?: TeamsReply[]
}

export type TeamsSyncConfig = {
  tenantId: string
  clientId: string
  clientSecret: string
  teamId: string
  channelId: string
  limit?: number
}

export function stripHtml(input?: string): string
export function parseLaunchThreadBody(content?: string): {
  label: string
  author: string
  title: string
  releaseDate: string
  format: '연재' | '단행'
  platform: string
}
export function parseTeamsReplySignals(replies?: TeamsReply[]): {
  bibliographicReady: boolean
  manuscriptReady: boolean
  coverReady: boolean
  productionStarted: boolean
  registered: boolean
  approvalPending: boolean
  completed: boolean
  thumbsUpComplete: boolean
}
export function mapTeamsThreadToLaunchRecord(message: TeamsChannelMessage): {
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
  note: string
}
export function buildTeamsSyncSummary(messages?: TeamsChannelMessage[]): {
  records: ReturnType<typeof mapTeamsThreadToLaunchRecord>[]
  skipped: number
  fetched: number
}
export function syncTeamsLaunchThreads(config: TeamsSyncConfig): Promise<{
  records: ReturnType<typeof mapTeamsThreadToLaunchRecord>[]
  skipped: number
  fetched: number
}>
