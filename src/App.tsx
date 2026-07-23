import { useEffect, useState, type CSSProperties } from 'react'
import './App.css'

type Team = {
  teamLabel: string
  teamName: string
  colorName: string
  foodName: string
  accentColor: string
  developer: string
  distribution: string
  contentBase: string[]
}

type TeamResult = {
  teams: Team[]
  attempts: number
}

type PresentationSlot = {
  order: number
  teamName: string
  members: string[]
}

type DashboardResult = {
  teams: Team[]
  presentationOrder: PresentationSlot[]
  explanation: string[]
}

type FormState = {
  teamCount: number
  minTotalTeamSize: number
  seed: number
  developers: string
  distributionMembers: string
  contentBaseMembers: string
  excludedMembers: string
  separateMembers: string
  restrictedDevelopers: string
  restrictedContentBase: string
}

const DEFAULT_FORM: FormState = {
  teamCount: 5,
  minTotalTeamSize: 4,
  seed: 31,
  developers: '그레이, 폴리, 루소, 찬, 키티',
  distributionMembers: '랄드, 희디, 데이지, 조이, 라토',
  contentBaseMembers:
    '디디, 아이비, 엘리, 에밀리, 에냐, 지니, 릴리, 제이, 휘, 케빈, 카이트',
  excludedMembers: '둘리',
  separateMembers: '라토, 랄드, 그레이, 키티\n카이트, 케빈, 휘',
  restrictedDevelopers: '루소, 폴리, 찬',
  restrictedContentBase: '휘, 케빈, 카이트',
}

const STORAGE_KEY = 'ax-hackathon-dashboard-state'

const TEAM_COLOR_CANDIDATES = [
  { name: '빨강', hex: '#e85d5d' },
  { name: '주황', hex: '#f39a4a' },
  { name: '노랑', hex: '#e3bf2f' },
  { name: '초록', hex: '#4fb56a' },
  { name: '민트', hex: '#55c7a5' },
  { name: '하늘', hex: '#54a7ff' },
  { name: '파랑', hex: '#4661d6' },
  { name: '남색', hex: '#314a9f' },
  { name: '보라', hex: '#8f63db' },
  { name: '분홍', hex: '#f06d9b' },
  { name: '갈색', hex: '#9b6b43' },
  { name: '회색', hex: '#7d8798' },
]

const TEAM_FOOD_CANDIDATES = [
  '김치볶음밥',
  '고르곤졸라',
  '로제파스타',
  '치즈돈까스',
  '불고기버거',
  '떡볶이',
  '크림리조또',
  '바질피자',
  '초코도넛',
  '유부초밥',
  '마라샹궈',
  '샤인머스캣케이크',
]

function parseNames(raw: string): string[] {
  return raw
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function parseSeparateGroups(raw: string): string[][] {
  return raw
    .split(/\n+/)
    .map((group) => group.split(',').map((item) => item.trim()).filter(Boolean))
    .filter((group) => group.length > 0)
}

function uniqueNames(names: string[]): string[] {
  return [...new Set(names)]
}

function createRng(seed: number) {
  let state = seed >>> 0

  return () => {
    state += 0x6d2b79f5
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const clone = [...items]
  for (let i = clone.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1))
    ;[clone[i], clone[j]] = [clone[j], clone[i]]
  }
  return clone
}

function scoreCounts(counts: number[]) {
  const max = Math.max(...counts)
  const min = Math.min(...counts)
  const average = counts.reduce((sum, count) => sum + count, 0) / counts.length
  const variance = counts.reduce((sum, count) => sum + (count - average) ** 2, 0)

  return {
    imbalance: max - min,
    variance,
    totalPenalty: (max - min) * 100 + variance,
  }
}

function buildRandomTeamNames(teamCount: number, seed: number) {
  const namingRandom = createRng(seed ^ 0x9e3779b9)
  const colors = shuffle(TEAM_COLOR_CANDIDATES, namingRandom)
  const foods = shuffle(TEAM_FOOD_CANDIDATES, namingRandom)

  return Array.from({ length: teamCount }, (_, index) => {
    const color = colors[index % colors.length]
    const food = foods[index % foods.length]
    return {
      teamLabel: `Team ${index + 1}`,
      teamName: `${color.name} ${food}팀`,
      colorName: color.name,
      foodName: food,
      accentColor: color.hex,
    }
  })
}

function assignRandomTeamNames(teams: Team[], seed: number): Team[] {
  const generatedNames = buildRandomTeamNames(teams.length, seed)
  return teams.map((team, index) => ({
    ...team,
    ...generatedNames[index],
  }))
}

function getTeamMembers(team: Team) {
  return [team.developer, team.distribution, ...team.contentBase]
}

function hasGroupConflict(members: string[], separateGroups: string[][]) {
  return separateGroups.some((group) => members.filter((member) => group.includes(member)).length > 1)
}

function validateTeam(team: Team, separateGroups: string[][], minTotalTeamSize: number) {
  if (hasGroupConflict(getTeamMembers(team), separateGroups)) {
    return `분리 대상 인원이 같은 팀에 배정되었습니다: ${team.teamName}`
  }

  if (getTeamMembers(team).length < minTotalTeamSize) {
    return `최소 팀 인원 ${minTotalTeamSize}명을 만족하지 못했습니다: ${team.teamName}`
  }

  return null
}

function buildTeams(form: FormState): DashboardResult {
  const teamCount = Number(form.teamCount)
  const minTotalTeamSize = Number(form.minTotalTeamSize)
  const seed = Number(form.seed)

  const excludedMembers = new Set(parseNames(form.excludedMembers))
  const developers = uniqueNames(parseNames(form.developers)).filter((name) => !excludedMembers.has(name))
  const distributionMembers = uniqueNames(parseNames(form.distributionMembers)).filter(
    (name) => !excludedMembers.has(name),
  )
  const contentBaseMembers = uniqueNames(parseNames(form.contentBaseMembers)).filter(
    (name) => !excludedMembers.has(name),
  )
  const separateGroups = parseSeparateGroups(form.separateMembers)
  const restrictedDevelopers = new Set(parseNames(form.restrictedDevelopers))
  const restrictedContentBase = new Set(parseNames(form.restrictedContentBase))

  const duplicateAcrossRoles = [
    ...developers.filter((name) => distributionMembers.includes(name) || contentBaseMembers.includes(name)),
    ...distributionMembers.filter((name) => contentBaseMembers.includes(name)),
  ]
  const uniqueDuplicateAcrossRoles = uniqueNames(duplicateAcrossRoles)
  if (uniqueDuplicateAcrossRoles.length > 0) {
    throw new Error(
      `한 사람이 여러 역할 목록에 동시에 들어가 있습니다: ${uniqueDuplicateAcrossRoles.join(', ')}`,
    )
  }

  if (developers.length < teamCount) {
    throw new Error(`개발자가 ${teamCount}명 이상 필요합니다. 현재 ${developers.length}명입니다.`)
  }

  if (distributionMembers.length < teamCount) {
    throw new Error(`콘텐츠유통팀 인원이 ${teamCount}명 이상 필요합니다. 현재 ${distributionMembers.length}명입니다.`)
  }

  const minContentBasePerTeam = Math.max(minTotalTeamSize - 2, 0)
  const requiredContentBaseTotal = minContentBasePerTeam * teamCount
  if (contentBaseMembers.length < requiredContentBaseTotal) {
    throw new Error(
      `최소 팀 인원 ${minTotalTeamSize}명을 맞추려면 콘본이 최소 ${requiredContentBaseTotal}명 필요하지만 현재 ${contentBaseMembers.length}명입니다.`,
    )
  }

  const specialMembers = contentBaseMembers.filter((member) => restrictedContentBase.has(member))
  const nonSpecialMembers = contentBaseMembers.filter((member) => !restrictedContentBase.has(member))
  if (specialMembers.length > 0 && restrictedDevelopers.size === 0) {
    throw new Error('전용 배치 콘본이 있는데 허용 개발자 팀이 비어 있습니다.')
  }

  const random = createRng(seed)
  let bestResult: TeamResult | null = null

  for (let attempt = 0; attempt < 250; attempt += 1) {
    const shuffledDevelopers = shuffle(developers, random).slice(0, teamCount)
    const shuffledDistribution = shuffle(distributionMembers, random).slice(0, teamCount)

    const pairings: Array<{ developer: string; distribution: string }> = []
    const usedDistribution = new Set<string>()

    const pairBacktrack = (index: number): boolean => {
      if (index === shuffledDevelopers.length) {
        return true
      }

      const developer = shuffledDevelopers[index]
      const candidates = shuffle(shuffledDistribution, random)

      for (const distribution of candidates) {
        if (usedDistribution.has(distribution)) continue

        if (hasGroupConflict([developer, distribution], separateGroups)) continue

        usedDistribution.add(distribution)
        pairings.push({ developer, distribution })
        if (pairBacktrack(index + 1)) return true
        pairings.pop()
        usedDistribution.delete(distribution)
      }

      return false
    }

    if (!pairBacktrack(0)) {
      continue
    }

    const baseTargets = Array.from({ length: teamCount }, () => minContentBasePerTeam)
    const remainingSlots = contentBaseMembers.length - baseTargets.reduce((sum, value) => sum + value, 0)
    for (let i = 0; i < remainingSlots; i += 1) {
      baseTargets[i % teamCount] += 1
    }

    const teams = pairings.map<Team>((pairing, index) => ({
      teamLabel: `Team ${index + 1}`,
      teamName: `Team ${index + 1}`,
      colorName: '',
      foodName: '',
      accentColor: '#dbe6f7',
      developer: pairing.developer,
      distribution: pairing.distribution,
      contentBase: [],
    }))

    const specialTeamIndexes = teams
      .map((team, index) => ({ team, index }))
      .filter(({ team }) => restrictedDevelopers.has(team.developer))
      .map(({ index }) => index)

    if (specialMembers.length > specialTeamIndexes.length * Math.max(...baseTargets)) {
      continue
    }

    const assignments = teams.map(() => [] as string[])
    const counts = teams.map(() => 0)

    const orderedMembers = [
      ...shuffle(specialMembers, random),
      ...shuffle(nonSpecialMembers, random),
    ]

    let validAssignment = false

    const contentBacktrack = (memberIndex: number): boolean => {
      if (memberIndex === orderedMembers.length) {
        const scored = scoreCounts(counts)
        const candidateTeams = teams.map((team, index) => ({
          ...team,
          contentBase: [...assignments[index]].sort((a, b) => a.localeCompare(b, 'ko')),
        }))

        const validationError = candidateTeams
          .map((team) => validateTeam(team, separateGroups, minTotalTeamSize))
          .find(Boolean)
        if (validationError) return false

        const candidateResult = {
          teams: candidateTeams,
          attempts: attempt + 1,
        }

        if (!bestResult) {
          bestResult = candidateResult
        } else {
          const currentScore = scoreCounts(bestResult.teams.map((team) => team.contentBase.length))
          if (scored.totalPenalty < currentScore.totalPenalty) {
            bestResult = candidateResult
          }
        }

        validAssignment = true
        return true
      }

      const member = orderedMembers[memberIndex]
      const candidateIndexes = teams
        .map((team, index) => ({ team, index }))
        .filter(({ team, index }) => {
          if (restrictedContentBase.has(member) && !restrictedDevelopers.has(team.developer)) {
            return false
          }

          if (
            hasGroupConflict(
              [team.developer, team.distribution, ...assignments[index], member],
              separateGroups,
            )
          ) {
            return false
          }

          if (counts[index] >= baseTargets[index]) return false
          return true
        })
        .sort((left, right) => counts[left.index] - counts[right.index])
        .map(({ index }) => index)

      for (const teamIndex of shuffle(candidateIndexes, random)) {
        assignments[teamIndex].push(member)
        counts[teamIndex] += 1

        const remainingMembers = orderedMembers.length - memberIndex - 1
        const remainingCapacity = baseTargets.reduce((sum, target, index) => sum + (target - counts[index]), 0)
        if (remainingCapacity < remainingMembers) {
          assignments[teamIndex].pop()
          counts[teamIndex] -= 1
          continue
        }

        const restrictedRemaining = orderedMembers
          .slice(memberIndex + 1)
          .filter((name) => restrictedContentBase.has(name)).length
        const restrictedCapacity = specialTeamIndexes.reduce(
          (sum, index) => sum + (baseTargets[index] - counts[index]),
          0,
        )

        if (restrictedCapacity < restrictedRemaining) {
          assignments[teamIndex].pop()
          counts[teamIndex] -= 1
          continue
        }

        if (contentBacktrack(memberIndex + 1)) {
          if (bestResult && scoreCounts(bestResult.teams.map((team) => team.contentBase.length)).imbalance === 0) {
            return true
          }
        }

        assignments[teamIndex].pop()
        counts[teamIndex] -= 1
      }

      return false
    }

    contentBacktrack(0)

    if (validAssignment && bestResult !== null) {
      const currentBest: TeamResult = bestResult
      const currentScore = scoreCounts(currentBest.teams.map((team) => team.contentBase.length))
      if (currentScore.imbalance <= 1) break
    }
  }

  if (bestResult === null) {
    throw new Error('조건을 만족하는 팀 편성 결과를 찾지 못했습니다. 제약을 조금 완화해 주세요.')
  }

  const finalResult: TeamResult = bestResult
  const teams = assignRandomTeamNames(finalResult.teams, seed)
  const presentationOrder = recommendPresentationOrder(teams, restrictedDevelopers, restrictedContentBase)

  return {
    teams,
    presentationOrder,
    explanation: [
      `시드값 ${seed} 기준으로 생성한 결과입니다.`,
      `팀 수는 ${teamCount}팀, 최소 팀 인원은 ${minTotalTeamSize}명으로 적용했습니다.`,
      `${[...restrictedContentBase].join(', ')} 은(는) ${[...restrictedDevelopers].join(', ')} 팀에만 배정되도록 반영했습니다.`,
      `팀명은 색 + 음식 조합 후보에서 랜덤 배정했습니다.`,
      `${finalResult.attempts}회 탐색 안에 조건을 만족하는 조합을 찾았습니다.`,
    ],
  }
}

function recommendPresentationOrder(
  teams: Team[],
  restrictedDevelopers: Set<string>,
  restrictedContentBase: Set<string>,
): PresentationSlot[] {
  const enriched = teams.map((team) => ({
    ...team,
    totalMembers: [team.developer, team.distribution, ...team.contentBase].length,
    hasRestrictedDeveloper: restrictedDevelopers.has(team.developer),
    restrictedContentCount: team.contentBase.filter((member) => restrictedContentBase.has(member)).length,
  }))

  const openerCandidates = enriched
    .filter((team) => !team.hasRestrictedDeveloper)
    .sort((a, b) => a.totalMembers - b.totalMembers || a.teamName.localeCompare(b.teamName, 'ko'))
  const opener = openerCandidates[0] ?? [...enriched].sort((a, b) => a.totalMembers - b.totalMembers)[0]

  const closer = [...enriched]
    .sort(
      (a, b) =>
        b.totalMembers - a.totalMembers ||
        b.restrictedContentCount - a.restrictedContentCount ||
        a.teamName.localeCompare(b.teamName, 'ko'),
    )
    .find((team) => team.teamName !== opener.teamName) ?? opener

  const middle = enriched
    .filter((team) => team.teamName !== opener.teamName && team.teamName !== closer.teamName)
    .sort(
      (a, b) =>
        Number(b.hasRestrictedDeveloper) - Number(a.hasRestrictedDeveloper) ||
        a.totalMembers - b.totalMembers ||
        a.teamName.localeCompare(b.teamName, 'ko'),
    )

  const ordered = [opener, ...middle, closer]

  return ordered.map((team, index) => ({
    order: index + 1,
    teamName: team.teamName,
    members: [team.developer, team.distribution, ...team.contentBase],
  }))
}

function teamToBullet(team: Team) {
  return `- ${team.teamName} (${team.teamLabel} / ${team.colorName} + ${team.foodName}): ${[
    team.developer,
    team.distribution,
    ...team.contentBase,
  ].join(' / ')}`
}

function presentationToBullet(slot: PresentationSlot) {
  return `${slot.order}. ${slot.teamName} (${slot.members.join(' / ')})`
}

function App() {
  const [form, setForm] = useState<FormState>(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (!stored) return DEFAULT_FORM

    try {
      return { ...DEFAULT_FORM, ...JSON.parse(stored) }
    } catch {
      return DEFAULT_FORM
    }
  })
  const [result, setResult] = useState<DashboardResult | null>(null)
  const [error, setError] = useState<string>('')
  const [copied, setCopied] = useState<string>('')

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(form))
  }, [form])

  const handleChange = (key: keyof FormState, value: string) => {
    setForm((current) => ({
      ...current,
      [key]: key === 'teamCount' || key === 'minTotalTeamSize' || key === 'seed' ? Number(value) : value,
    }))
  }

  const handleGenerate = () => {
    try {
      const built = buildTeams(form)
      setResult(built)
      setError('')
    } catch (buildError) {
      setResult(null)
      setError(buildError instanceof Error ? buildError.message : '팀 편성 중 오류가 발생했습니다.')
    }
  }

  const handleReset = () => {
    setForm(DEFAULT_FORM)
    setResult(null)
    setError('')
    setCopied('')
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_FORM))
  }

  const copyText = async (label: string, text: string) => {
    await navigator.clipboard.writeText(text)
    setCopied(label)
    window.setTimeout(() => setCopied(''), 1800)
  }

  const shareText = result
    ? [
        '[AX 해커톤 팀 편성안]',
        '',
        '1. 팀 편성 결과',
        ...result.teams.map(teamToBullet),
        '',
        '2. 추천 발표 순서',
        ...result.presentationOrder.map(presentationToBullet),
      ].join('\n')
    : ''

  return (
    <div className="app-shell">
      <header className="hero-card">
        <div>
          <p className="eyebrow">AX Hackathon Dashboard</p>
          <h1>팀 자동편성 + 발표 순서 추천 대시보드</h1>
          <p className="hero-copy">
            개발자 1명, 콘텐츠유통팀 1명, 콘본 혼합 배치 규칙을 반영해서 바로 결과를 뽑고,
            스레드 공유용 문구까지 복사할 수 있게 만들었습니다.
          </p>
        </div>
        <div className="hero-metrics">
          <div className="metric-card">
            <span>팀 수</span>
            <strong>{form.teamCount}</strong>
          </div>
          <div className="metric-card">
            <span>최소 팀 인원</span>
            <strong>{form.minTotalTeamSize}</strong>
          </div>
          <div className="metric-card accent">
            <span>시드</span>
            <strong>{form.seed}</strong>
          </div>
        </div>
      </header>

      <main className="content-grid">
        <section className="panel panel-primary">
          <div className="panel-header">
            <div>
              <h2>편성 조건 입력</h2>
              <p>복붙 기준으로 콤마 또는 줄바꿈 모두 인식합니다.</p>
            </div>
            <div className="button-row">
              <button className="secondary-button" onClick={handleReset} type="button">
                기본값 복원
              </button>
              <button className="primary-button" onClick={handleGenerate} type="button">
                팀 편성 실행
              </button>
            </div>
          </div>

          <div className="settings-grid">
            <label>
              <span>팀 수</span>
              <input
                type="number"
                min={1}
                value={form.teamCount}
                onChange={(event) => handleChange('teamCount', event.target.value)}
              />
            </label>
            <label>
              <span>최소 팀 인원</span>
              <input
                type="number"
                min={3}
                value={form.minTotalTeamSize}
                onChange={(event) => handleChange('minTotalTeamSize', event.target.value)}
              />
            </label>
            <label>
              <span>시드</span>
              <input
                type="number"
                value={form.seed}
                onChange={(event) => handleChange('seed', event.target.value)}
              />
            </label>
          </div>

          <div className="textarea-stack">
            <label>
              <span>개발자 명단</span>
              <textarea
                rows={3}
                value={form.developers}
                onChange={(event) => handleChange('developers', event.target.value)}
              />
            </label>
            <label>
              <span>콘텐츠유통팀 명단</span>
              <textarea
                rows={3}
                value={form.distributionMembers}
                onChange={(event) => handleChange('distributionMembers', event.target.value)}
              />
            </label>
            <label>
              <span>콘텐츠본부 명단</span>
              <textarea
                rows={5}
                value={form.contentBaseMembers}
                onChange={(event) => handleChange('contentBaseMembers', event.target.value)}
              />
            </label>
          </div>
        </section>

        <section className="panel panel-side">
          <div className="panel-header compact">
            <div>
              <h2>제약 조건</h2>
              <p>특정 인원 분리, 특정 콘본 전용 팀 규칙을 여기서 제어합니다.</p>
            </div>
          </div>

          <div className="textarea-stack">
            <label>
              <span>제외 인원</span>
              <textarea
                rows={2}
                value={form.excludedMembers}
                onChange={(event) => handleChange('excludedMembers', event.target.value)}
              />
            </label>
            <label>
              <span>같은 팀 금지 인원 (줄바꿈마다 별도 그룹)</span>
              <textarea
                rows={3}
                value={form.separateMembers}
                onChange={(event) => handleChange('separateMembers', event.target.value)}
              />
            </label>
            <label>
              <span>전용 팀 허용 개발자</span>
              <textarea
                rows={3}
                value={form.restrictedDevelopers}
                onChange={(event) => handleChange('restrictedDevelopers', event.target.value)}
              />
            </label>
            <label>
              <span>위 개발자 팀에만 들어갈 수 있는 콘본</span>
              <textarea
                rows={3}
                value={form.restrictedContentBase}
                onChange={(event) => handleChange('restrictedContentBase', event.target.value)}
              />
            </label>
          </div>
        </section>

        <section className="panel panel-full result-panel">
          <div className="panel-header">
            <div>
              <h2>편성 결과</h2>
              <p>조건을 충족하는 팀 편성과 추천 발표 순서를 한 번에 확인합니다.</p>
            </div>
            <div className="button-row">
              <button
                className="secondary-button"
                onClick={() => copyText('팀 편성안', shareText)}
                type="button"
                disabled={!result}
              >
                스레드용 복사
              </button>
            </div>
          </div>

          {copied ? <div className="notice success">{copied} 복사 완료</div> : null}
          {error ? <div className="notice error">{error}</div> : null}

          {!result && !error ? (
            <div className="empty-state">
              <p>아직 결과가 없습니다. 오른쪽 상단의 “팀 편성 실행” 버튼을 눌러주세요.</p>
            </div>
          ) : null}

          {result ? (
            <div className="result-stack">
              <div className="explanation-list">
                {result.explanation.map((line) => (
                  <div className="explanation-item" key={line}>
                    {line}
                  </div>
                ))}
              </div>

              <div className="team-grid">
                {result.teams.map((team) => {
                  const members = [team.developer, team.distribution, ...team.contentBase]
                  return (
                    <article className="team-card" key={team.teamLabel} style={{ '--team-accent': team.accentColor } as CSSProperties}>
                      <div className="team-card-head">
                        <div>
                          <p className="team-label">{team.teamLabel}</p>
                          <h3>{team.teamName}</h3>
                        </div>
                        <span>{members.length}명</span>
                      </div>
                      <div className="team-name-meta">
                        <span>{team.colorName}</span>
                        <span>{team.foodName}</span>
                      </div>
                      <dl>
                        <div>
                          <dt>개발자</dt>
                          <dd>{team.developer}</dd>
                        </div>
                        <div>
                          <dt>콘텐츠유통팀</dt>
                          <dd>{team.distribution}</dd>
                        </div>
                        <div>
                          <dt>콘텐츠본부</dt>
                          <dd>{team.contentBase.join(', ')}</dd>
                        </div>
                      </dl>
                    </article>
                  )
                })}
              </div>

              <div className="presentation-card">
                <div className="presentation-head">
                  <h3>추천 발표 순서</h3>
                </div>
                <ol className="presentation-list">
                  {result.presentationOrder.map((slot) => (
                    <li key={slot.order}>
                      <div className="presentation-order">{slot.order}</div>
                      <div>
                        <strong>{slot.teamName}</strong>
                        <p>{slot.members.join(' / ')}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          ) : null}
        </section>
      </main>
    </div>
  )
}

export default App
