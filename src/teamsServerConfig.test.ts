import { describe, expect, it } from 'vitest'

// @ts-ignore Vitest imports the Node ESM server module directly.
import { getMissingTeamsConfigKeys, resolveTeamsRuntimeConfig, toSafeRuntimeStatus } from '../server/teamsRuntimeConfig.mjs'

const completeEnvironment = {
  TEAMS_TENANT_ID: 'tenant-from-server',
  TEAMS_CLIENT_ID: 'client-from-server',
  TEAMS_CLIENT_SECRET: 'secret-from-server',
  TEAMS_TEAM_ID: 'team-from-server',
  TEAMS_CHANNEL_ID: 'channel-from-server',
  TEAMS_WEBHOOK_URL: 'https://example.invalid/private-webhook',
  TEAMS_SYNC_LIMIT: '75',
}

describe('Teams server runtime configuration', () => {
  it('reads Teams credentials and webhook only from server environment variables', () => {
    const runtime = resolveTeamsRuntimeConfig(completeEnvironment, {
      tenantId: 'browser-tenant',
      clientId: 'browser-client',
      clientSecret: 'browser-secret',
      teamId: 'browser-team',
      channelId: 'browser-channel',
      webhookUrl: 'https://browser.invalid/webhook',
      limit: 20,
    })

    expect(runtime.teamsConfig).toEqual({
      tenantId: 'tenant-from-server',
      clientId: 'client-from-server',
      clientSecret: 'secret-from-server',
      teamId: 'team-from-server',
      channelId: 'channel-from-server',
      limit: 20,
    })
    expect(runtime.webhookUrl).toBe('https://example.invalid/private-webhook')
  })

  it('reports missing server settings without exposing secret values', () => {
    const runtime = resolveTeamsRuntimeConfig({
      TEAMS_TENANT_ID: 'tenant',
      TEAMS_CLIENT_ID: 'client',
    })

    expect(getMissingTeamsConfigKeys(runtime.teamsConfig)).toEqual([
      'clientSecret',
      'teamId',
      'channelId',
    ])

    const safe = toSafeRuntimeStatus(runtime)
    expect(safe).toEqual({
      configured: false,
      hasClientSecret: false,
      hasWebhookUrl: false,
      missing: ['clientSecret', 'teamId', 'channelId'],
      limit: 50,
    })
    expect(JSON.stringify(safe)).not.toContain('secret-from-server')
  })

  it('clamps the browser-provided sync limit while keeping credentials server-side', () => {
    expect(resolveTeamsRuntimeConfig(completeEnvironment, { limit: 0 }).teamsConfig.limit).toBe(1)
    expect(resolveTeamsRuntimeConfig(completeEnvironment, { limit: 999 }).teamsConfig.limit).toBe(200)
    expect(resolveTeamsRuntimeConfig(completeEnvironment, { limit: Number.NaN }).teamsConfig.limit).toBe(75)
  })
})
