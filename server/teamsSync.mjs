const GRAPH_BASE_URL = 'https://graph.microsoft.com/v1.0'

/**
 * @typedef {{ reactionType?: string }} TeamsReaction
 * @typedef {{ displayName?: string }} TeamsUserInfo
 * @typedef {{ user?: TeamsUserInfo }} TeamsFrom
 * @typedef {{ content?: string }} TeamsBody
 * @typedef {{ id?: string, body?: TeamsBody, reactions?: TeamsReaction[] }} TeamsReply
 * @typedef {{
 *   id?: string,
 *   subject?: string,
 *   webUrl?: string,
 *   body?: TeamsBody,
 *   from?: TeamsFrom,
 *   reactions?: TeamsReaction[],
 *   replies?: TeamsReply[]
 * }} TeamsChannelMessage
 */

/**
 * @typedef {{
 *   tenantId: string,
 *   clientId: string,
 *   clientSecret: string,
 *   teamId: string,
 *   channelId: string,
 *   limit?: number
 * }} TeamsSyncConfig
 */

const FIELD_ALIASES = {
  label: ['레이블', '라벨'],
  author: ['작가', '작가명'],
  title: ['제목', '작품명'],
  releaseDate: ['출간 일정', '출간일정', '출간일', '출간 예정일', '출간예정일', '론칭 일정', '론칭일정'],
  format: ['구분', '형태', '연재/단행'],
  platform: ['출간 플랫폼', '플랫폼', '유통 플랫폼', '출간처'],
}

function decodeHtmlEntities(text) {
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
}

function toStructuredPlainText(input = '') {
  return decodeHtmlEntities(
    input
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<\/div>/gi, '\n')
      .replace(/<\/li>/gi, '\n')
      .replace(/<\/(tr|table|ul|ol|section|article|header)>/gi, '\n')
      .replace(/<\/(td|th)>/gi, ' | ')
      .replace(/<[^>]+>/g, ' '),
  )
}

export function stripHtml(input = '') {
  return toStructuredPlainText(input)
    .replace(/[\t\r]+/g, ' ')
    .replace(/\u00a0/g, ' ')
    .replace(/[ ]*\|[ ]*/g, ' | ')
    .replace(/\n[ ]+/g, '\n')
    .replace(/[ ]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function cleanFieldValue(value = '') {
  return value.replace(/^[@#]\s*/, '').replace(/\s+/g, ' ').trim()
}

function normalizeFieldKey(value = '') {
  return value.replace(/[\s:：|-]/g, '').trim().toLowerCase()
}

function normalizeDate(value = '') {
  const cleaned = value.trim()
  if (!cleaned || /미정|추후|TBD/i.test(cleaned)) return ''

  const match = cleaned.match(/(20\d{2})[.\-/년\s]+(\d{1,2})[.\-/월\s]+(\d{1,2})/)
  if (match) {
    const [, year, month, day] = match
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  }

  const shortYearMatch = cleaned.match(/(?:^|\D)(\d{2})년\s*(\d{1,2})월\s*(\d{1,2})일?/)
  if (!shortYearMatch) return ''
  const [, year, month, day] = shortYearMatch
  return `20${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
}

function splitLines(text = '') {
  return stripHtml(text)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

function findFieldValue(lines, aliases) {
  const normalizedAliases = aliases.map(normalizeFieldKey)

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? ''
    const cleanedLine = cleanFieldValue(line)

    for (let aliasIndex = 0; aliasIndex < aliases.length; aliasIndex += 1) {
      const alias = aliases[aliasIndex]
      const normalizedAlias = normalizedAliases[aliasIndex]
      const colonPattern = new RegExp(`^${alias}\\s*[:：]\\s*(.+)$`)
      const colonMatched = cleanedLine.match(colonPattern)
      if (colonMatched) return colonMatched[1].trim()

      const pipeParts = cleanedLine
        .split('|')
        .map((part) => cleanFieldValue(part))
        .filter(Boolean)

      if (pipeParts.length >= 2 && normalizeFieldKey(pipeParts[0]) === normalizedAlias) {
        return pipeParts[1]
      }

      if (normalizeFieldKey(cleanedLine) === normalizedAlias) {
        const nextLine = cleanFieldValue(lines[index + 1] ?? '')
        if (nextLine && !normalizedAliases.includes(normalizeFieldKey(nextLine))) {
          return nextLine
        }
      }

      if (cleanedLine.startsWith(`${alias} `)) {
        return cleanedLine.slice(alias.length).trim()
      }
    }
  }

  return ''
}

function extractPlatformAndFormat(lines) {
  let platform = findFieldValue(lines, FIELD_ALIASES.platform)
  let format = findFieldValue(lines, FIELD_ALIASES.format)

  const combined = lines.find((line) => /플랫폼\s*\/\s*형태|형태\s*\/\s*플랫폼/.test(line))
  if (combined) {
    const combinedValue = combined.split(/[:：]/)[1] ?? ''
    const parts = combinedValue
      .split('/')
      .map((item) => item.trim())
      .filter(Boolean)

    for (const part of parts) {
      if (!format && /(연재|단행)/.test(part)) format = part
      else if (!platform) platform = part
    }
  }

  if (platform && /(연재|단행)/.test(platform) && !format) {
    format = platform.match(/연재|단행/)?.[0] ?? format
    platform = platform.replace(/연재|단행/g, '').replace(/[/|]/g, '').trim()
  }

  if (format && !/(연재|단행)/.test(format)) {
    const match = format.match(/연재|단행/)
    if (match) {
      format = match[0]
    }
  }

  return {
    platform: cleanFieldValue(platform),
    format: /(단행)/.test(format) ? '단행' : '연재',
  }
}

function parseNarrativeLaunchHeader(content = '') {
  const text = stripHtml(content)
  const titleMatch = text.match(/[<〈《『]([^>〉》』]+)[>〉》』]/)
  if (!titleMatch || titleMatch.index === undefined) {
    return { label: '', author: '', title: '', releaseDate: '', format: '연재', platform: '' }
  }

  const headerParts = text
    .slice(0, titleMatch.index)
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  const platformAlias = [
    ['카카오페이지', '카카오페이지'],
    ['네이버 시리즈', '네이버 시리즈'],
    ['네이버시리즈', '네이버 시리즈'],
    ['원스토어', '원스토어'],
    ['미스터블루', '미스터블루'],
    ['북큐브', '북큐브'],
    ['교보문고', '교보문고'],
    ['알라딘', '알라딘'],
    ['예스24', '예스24'],
    ['리다무', '리디'],
    ['카기무', '카카오페이지'],
    ['카카오', '카카오페이지'],
    ['시리즈', '네이버 시리즈'],
    ['리디', '리디'],
  ].find(([alias]) => text.includes(alias))
  const releaseDateMatch = text.match(
    /(?:출간\s*일정|출간일정|출간일|출간\s*예정일|론칭\s*일정|론칭일정)\s*[:：]\s*(.+)/,
  )

  return {
    label: cleanFieldValue(headerParts[0] ?? ''),
    author: cleanFieldValue(headerParts.slice(1).join(' ')),
    title: cleanFieldValue(titleMatch[1] ?? ''),
    releaseDate: normalizeDate(releaseDateMatch?.[1] ?? ''),
    format: /단행/.test(text) ? '단행' : '연재',
    platform: platformAlias?.[1] ?? '',
  }
}

export function parseLaunchThreadBody(content = '') {
  const lines = splitLines(content)
  const narrative = parseNarrativeLaunchHeader(content)
  const label = cleanFieldValue(findFieldValue(lines, FIELD_ALIASES.label)) || narrative.label
  const author = cleanFieldValue(findFieldValue(lines, FIELD_ALIASES.author)) || narrative.author
  const title = cleanFieldValue(findFieldValue(lines, FIELD_ALIASES.title)) || narrative.title
  const releaseDate = normalizeDate(findFieldValue(lines, FIELD_ALIASES.releaseDate)) || narrative.releaseDate
  const structured = extractPlatformAndFormat(lines)
  const platform = structured.platform || narrative.platform
  const hasStructuredFormat = Boolean(findFieldValue(lines, FIELD_ALIASES.format) || structured.platform)
  const format = hasStructuredFormat ? structured.format : narrative.format

  return {
    label,
    author,
    title,
    releaseDate,
    format,
    platform,
  }
}

function hasKeyword(text, keywords) {
  return keywords.some((keyword) => text.includes(keyword))
}

function hasLikeReaction(reactions = []) {
  return reactions.some((reaction) => ['like', 'thumbsUp', 'heart'].includes(reaction?.reactionType ?? ''))
}

export function parseTeamsReplySignals(replies = []) {
  const signals = {
    bibliographicReady: false,
    manuscriptReady: false,
    coverReady: false,
    productionStarted: false,
    registered: false,
    approvalPending: false,
    completed: false,
    thumbsUpComplete: false,
  }

  for (const reply of replies) {
    const text = stripHtml(reply?.body?.content ?? '')
    const normalized = text.replace(/\s+/g, '')

    if (hasKeyword(normalized, ['서지정보', '서지']) && hasKeyword(normalized, ['완', '완료', '전달', '도착'])) {
      signals.bibliographicReady = true
    }

    if (hasKeyword(normalized, ['원고', '완고']) && hasKeyword(normalized, ['완', '완료', '전달', '도착', '업로드', '처리'])) {
      signals.manuscriptReady = true
    }

    if (hasKeyword(normalized, ['표지']) && hasKeyword(normalized, ['완', '전달', '도착'])) {
      signals.coverReady = true
    }

    if (hasKeyword(normalized, ['제작시작', '제작진행', '제작들어갑니다', '제작착수'])) {
      signals.productionStarted = true
    }

    if (
      hasKeyword(normalized, ['등록완료', '등록했습니다', '등록했어요', '등록완'])
      || /등록요청.*(?:완|완료)/.test(normalized)
    ) {
      signals.registered = true
    }

    if (hasKeyword(normalized, ['승인대기', '승인요청', '검수대기'])) {
      signals.approvalPending = true
    }

    if (hasKeyword(normalized, ['론칭완료', '최종완료', '완료처리'])) {
      signals.completed = true
    }

    if (hasKeyword(normalized, ['따봉완료', '좋아요완료'])) {
      signals.thumbsUpComplete = true
    }

    if (hasLikeReaction(reply?.reactions)) {
      signals.thumbsUpComplete = true
      signals.completed = true
    }
  }

  return signals
}

function isLaunchThreadMessage(message) {
  const subject = message?.subject ?? ''
  const bodyText = stripHtml(message?.body?.content ?? '')
  const launchThreadPattern = /론칭\s*준비\s*타래|론칭\s*타래|출간\s*타래|\[론/
  return launchThreadPattern.test(subject) || launchThreadPattern.test(bodyText)
}

function buildFallbackTitle(message) {
  const subject = cleanFieldValue(message?.subject ?? '')
  if (subject) return subject
  return `Teams 타래 ${message?.id ?? ''}`.trim()
}

export function mapTeamsThreadToLaunchRecord(message) {
  const parsed = parseLaunchThreadBody(message?.body?.content ?? '')
  const replySignals = parseTeamsReplySignals(message?.replies ?? [])
  const thumbsUpComplete = hasLikeReaction(message?.reactions) || replySignals.thumbsUpComplete
  const completed = thumbsUpComplete || replySignals.completed
  const sender = message?.from?.user?.displayName ?? ''

  return {
    id: `teams-${message?.id ?? crypto.randomUUID()}`,
    label: parsed.label || '미분류',
    assignee: sender,
    author: parsed.author || '미입력',
    title: parsed.title || buildFallbackTitle(message),
    format: parsed.format === '단행' ? '단행' : '연재',
    platform: parsed.platform || '미입력',
    releaseDate: parsed.releaseDate,
    bibliographicReady: replySignals.bibliographicReady,
    manuscriptReady: replySignals.manuscriptReady,
    coverReady: replySignals.coverReady,
    productionStarted: replySignals.productionStarted,
    registered: replySignals.registered,
    approvalPending: replySignals.approvalPending,
    completed,
    thumbsUpComplete,
    launchThreadUrl: message?.webUrl ?? '',
    note: sender ? `Teams 작성자: ${sender}` : 'Teams 동기화',
  }
}

export function buildTeamsSyncSummary(messages = []) {
  const records = []
  let skipped = 0

  for (const message of messages) {
    if (!isLaunchThreadMessage(message)) {
      skipped += 1
      continue
    }

    records.push(mapTeamsThreadToLaunchRecord(message))
  }

  return {
    records,
    skipped,
    fetched: messages.length,
  }
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options)
  const text = await response.text()
  const data = text ? JSON.parse(text) : {}

  if (!response.ok) {
    const error = new Error(data.error_description || data.error?.message || response.statusText)
    error.status = response.status
    error.payload = data
    throw error
  }

  return data
}

async function fetchGraphToken(config) {
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials',
  })

  const tokenData = await fetchJson(
    `https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    },
  )

  return tokenData.access_token
}

async function fetchChannelMessages(config, token) {
  const params = new URLSearchParams({
    $top: `${config.limit ?? 50}`,
  })

  const response = await fetchJson(
    `${GRAPH_BASE_URL}/teams/${config.teamId}/channels/${config.channelId}/messages?${params.toString()}`,
    {
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/json',
      },
    },
  )

  return response.value ?? []
}

async function fetchMessageReplies(config, token, messageId) {
  const response = await fetchJson(
    `${GRAPH_BASE_URL}/teams/${config.teamId}/channels/${config.channelId}/messages/${messageId}/replies`,
    {
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/json',
      },
    },
  )

  return response.value ?? []
}

export async function syncTeamsLaunchThreads(config) {
  const token = await fetchGraphToken(config)
  const messages = await fetchChannelMessages(config, token)

  const hydratedMessages = await Promise.all(
    messages.map(async (message) => ({
      ...message,
      replies: await fetchMessageReplies(config, token, message.id),
    })),
  )

  return buildTeamsSyncSummary(hydratedMessages)
}
