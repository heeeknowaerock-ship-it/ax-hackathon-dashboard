import { createServer } from 'node:http'

import {
  getTeamsAutomationState,
  initializeTeamsAutomation,
  runTeamsReminderAutomation,
  updateTeamsAutomationConfig,
} from './teamsAutomation.mjs'
import {
  getMissingTeamsConfigKeys,
  resolveTeamsRuntimeConfig,
  toSafeRuntimeStatus,
} from './teamsRuntimeConfig.mjs'
import { syncTeamsLaunchThreads } from './teamsSync.mjs'

const PORT = Number(process.env.TEAMS_SYNC_PORT || 8787)
const runtimeConfig = resolveTeamsRuntimeConfig(process.env)

function setCorsHeaders(response) {
  response.setHeader('Access-Control-Allow-Origin', '*')
  response.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type')
}

function sendJson(response, statusCode, payload) {
  setCorsHeaders(response)
  response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify(payload))
}

function collectJsonBody(request) {
  return new Promise((resolve, reject) => {
    let raw = ''

    request.on('data', (chunk) => {
      raw += chunk
      if (raw.length > 1_000_000) {
        reject(new Error('요청 본문이 너무 큽니다.'))
        request.destroy()
      }
    })

    request.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {})
      } catch {
        reject(new Error('JSON 요청 본문을 읽을 수 없습니다.'))
      }
    })

    request.on('error', reject)
  })
}

function validateConfig(config) {
  const missing = getMissingTeamsConfigKeys(config)

  if (missing.length > 0) {
    throw new Error(`필수 Teams 설정이 비어 있습니다: ${missing.join(', ')}`)
  }
}

await initializeTeamsAutomation(runtimeConfig)

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host}`)

  if (request.method === 'OPTIONS') {
    setCorsHeaders(response)
    response.writeHead(204)
    response.end()
    return
  }

  if (request.method === 'GET' && url.pathname === '/api/teams/health') {
    sendJson(response, 200, {
      ok: true,
      service: 'teams-sync-automation',
      port: PORT,
      configuration: toSafeRuntimeStatus(runtimeConfig),
    })
    return
  }

  if (request.method === 'POST' && url.pathname === '/api/teams/sync') {
    try {
      const requestConfig = await collectJsonBody(request)
      const resolved = resolveTeamsRuntimeConfig(process.env, requestConfig)
      validateConfig(resolved.teamsConfig)
      const summary = await syncTeamsLaunchThreads(resolved.teamsConfig)
      sendJson(response, 200, {
        ok: true,
        ...summary,
      })
    } catch (error) {
      sendJson(response, 400, {
        ok: false,
        error: error instanceof Error ? error.message : 'Teams 동기화에 실패했습니다.',
      })
    }
    return
  }

  if (request.method === 'GET' && url.pathname === '/api/teams/automation') {
    sendJson(response, 200, {
      ok: true,
      automation: getTeamsAutomationState(),
    })
    return
  }

  if (request.method === 'POST' && url.pathname === '/api/teams/automation') {
    try {
      const config = await collectJsonBody(request)
      const resolved = resolveTeamsRuntimeConfig(process.env, config?.teamsConfig ?? {})
      const automation = await updateTeamsAutomationConfig({
        enabled: Boolean(config?.enabled),
        intervalMinutes: config?.intervalMinutes,
        leadBusinessDays: config?.leadBusinessDays,
        webhookUrl: resolved.webhookUrl,
        teamsConfig: resolved.teamsConfig,
      })
      sendJson(response, 200, {
        ok: true,
        automation,
        message: automation.enabled
          ? 'Teams 자동 알림 설정을 저장하고 예약 실행을 시작했습니다.'
          : 'Teams 자동 알림 설정을 저장했습니다. 자동 발송은 꺼져 있습니다.',
      })
    } catch (error) {
      sendJson(response, 400, {
        ok: false,
        error: error instanceof Error ? error.message : 'Teams 자동 알림 설정 저장에 실패했습니다.',
      })
    }
    return
  }

  if (request.method === 'POST' && url.pathname === '/api/teams/automation/run') {
    try {
      const payload = await collectJsonBody(request)
      const result = await runTeamsReminderAutomation({
        force: Boolean(payload?.force),
        trigger: 'manual',
      })
      sendJson(response, 200, result)
    } catch (error) {
      sendJson(response, 400, {
        ok: false,
        error: error instanceof Error ? error.message : 'Teams 자동 알림 실행에 실패했습니다.',
      })
    }
    return
  }

  sendJson(response, 404, {
    ok: false,
    error: '요청한 API 경로를 찾을 수 없습니다.',
  })
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Teams sync server listening on http://127.0.0.1:${PORT}`)
})
