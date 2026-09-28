# Teams 연동 안내

## 1. 현재 구현 범위

- Microsoft Graph 앱 자격증명으로 Teams 채널 메시지와 답글을 읽습니다.
- 채널 안에서 론칭 준비 타래를 찾아 작품 정보와 진행 신호를 변환합니다.
- 등록 마감 위험 건을 Teams Workflow/Webhook으로 자동 발송할 수 있습니다.
- Client Secret과 Workflow URL은 브라우저가 아닌 서버 환경변수에서만 관리합니다.

## 2. Microsoft Graph 앱 권한

기존 Entra 앱에 다음 **Application permissions**와 관리자 동의가 필요합니다.

- `ChannelMessage.Read.All`
- `Team.ReadBasic.All`
- `Channel.ReadBasic.All`

## 3. 테스트 대상

- 팀: `콘텐츠유통팀`
- 채널: `[콘-서][01] 론칭 준비 타래`
- Tenant ID: `c3fec124-ad4c-44f4-817b-049339aa4172`
- Client ID: `ed4ba29a-14aa-4e50-b3cd-d90e95f81cf9`
- Team ID: `70da08bc-c3a7-4b84-aac6-695fc70a410a`
- Channel ID: `19:117b7d0f20a74fe19e02c67cf7501ef7@thread.skype`

위 식별자는 비밀번호가 아닙니다. Client Secret Value와 Workflow URL은 문서나 Git에 기록하지 않습니다.

## 4. 서버 환경설정

프로젝트 루트에서 예시 파일을 복사합니다.

```bash
cp .env.example .env.local
```

`.env.local`에 다음 변수를 사용합니다.

```dotenv
TEAMS_TENANT_ID=...
TEAMS_CLIENT_ID=...
TEAMS_CLIENT_SECRET=실제_Secret_Value
TEAMS_TEAM_ID=...
TEAMS_CHANNEL_ID=...
TEAMS_SYNC_LIMIT=50
TEAMS_WEBHOOK_URL=
TEAMS_SYNC_PORT=8787
```

현재 `.env.example`과 로컬 `.env.local`에는 확인된 Tenant ID, Client ID, Team ID, Channel ID가 미리 반영되어 있습니다. 사용자는 로컬 `.env.local`의 `TEAMS_CLIENT_SECRET=` 뒤에 실제 Secret Value만 입력합니다.

주의사항:

- Secret ID가 아니라 Secret **Value**를 입력합니다.
- `.env.local`은 Git에서 제외됩니다.
- Client Secret과 Workflow URL을 대시보드 화면이나 Discord에 입력하지 않습니다.
- 자동화 상태 파일에도 두 비밀값을 저장하지 않습니다.

## 5. 실행 방법

### 백엔드

```bash
cd /home/viewcommz/hackathon-dashboard
npm install
npm run server
```

`npm run server`는 `.env.local`을 자동으로 읽습니다. 기본 주소는 `http://127.0.0.1:8787`입니다.

환경설정 상태 확인:

```bash
curl http://127.0.0.1:8787/api/teams/health
```

`configuration.configured`가 `true`이면 Graph 조회에 필요한 값이 모두 설정된 상태입니다.

### 프론트엔드

별도 터미널에서 실행합니다.

```bash
cd /home/viewcommz/hackathon-dashboard
npm run dev
```

대시보드에서는 조회 개수, 자동 발송 사용 여부, 실행 주기, 리마인드 기준만 조절합니다. 비밀값 입력란은 없습니다.

## 6. 파싱 규칙 예시

### 본문

```text
레이블: @에이블
작가: 홍길동
제목: 새벽 끝의 로맨스
출간 일정: 2026.08.27
구분: 연재
출간 플랫폼: 카카오페이지
```

### 답글

```text
서지정보, 표지 완입니다.
원고 완입니다!
등록 완료했습니다.
승인 대기 부탁드립니다.
```

메시지 또는 답글의 `like` 반응은 완료 신호로 처리합니다.

## 7. 자동 알림

- `.env.local`의 `TEAMS_WEBHOOK_URL`에 테스트 채널 Workflow URL을 입력합니다.
- 대시보드에서 자동 발송 사용 여부와 실행 주기를 저장합니다.
- 서버는 설정 주기마다 Teams를 읽고 위험 건을 선별합니다.
- 같은 대상 목록은 중복 발송을 생략합니다.
- `지금 1회 발송`으로 테스트할 수 있습니다.
- 현재 메시지의 담당자 이름은 일반 텍스트이며 실제 `@멘션` 구현은 후속 작업입니다.

## 8. 운영 전 확인

1. Client Secret 입력 후 health의 `configured=true` 확인
2. 테스트 채널 타래 조회 성공 확인
3. 테스트 채널 Workflow URL 설정
4. 가상 D-3 작품 1건 발송 확인
5. 반복 실행 중복 방지 확인
6. 등록 완료 작품 제외 확인
7. 담당자 계정 매핑과 실제 `@멘션` 구현
8. 상시 실행 백엔드와 영구 상태 저장소 확정
