function trimString(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeLimit(value, fallback = 50) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(200, Math.max(1, Math.trunc(parsed)))
}

export function getMissingTeamsConfigKeys(config = {}) {
  return ['tenantId', 'clientId', 'clientSecret', 'teamId', 'channelId'].filter(
    (key) => !trimString(config[key]),
  )
}

export function resolveTeamsRuntimeConfig(environment = process.env, request = {}) {
  const environmentLimit = normalizeLimit(environment.TEAMS_SYNC_LIMIT, 50)

  return {
    teamsConfig: {
      tenantId: trimString(environment.TEAMS_TENANT_ID),
      clientId: trimString(environment.TEAMS_CLIENT_ID),
      clientSecret: trimString(environment.TEAMS_CLIENT_SECRET),
      teamId: trimString(environment.TEAMS_TEAM_ID),
      channelId: trimString(environment.TEAMS_CHANNEL_ID),
      limit: normalizeLimit(request.limit, environmentLimit),
    },
    webhookUrl: trimString(environment.TEAMS_WEBHOOK_URL),
  }
}

export function toSafeRuntimeStatus(runtime) {
  const missing = getMissingTeamsConfigKeys(runtime?.teamsConfig)

  return {
    configured: missing.length === 0,
    hasClientSecret: Boolean(runtime?.teamsConfig?.clientSecret),
    hasWebhookUrl: Boolean(runtime?.webhookUrl),
    missing,
    limit: normalizeLimit(runtime?.teamsConfig?.limit, 50),
  }
}
