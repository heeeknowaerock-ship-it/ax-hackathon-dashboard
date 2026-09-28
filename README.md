# 론칭 타래 현황 대시보드

Microsoft Teams의 론칭 타래를 읽어 작품별 준비 상태와 등록 마감 위험 건을 확인하고, Teams 채널에 리마인드를 발송하는 내부 운영 대시보드입니다.

## 주요 기능

1. Teams 채널의 론칭 타래와 답글 조회
2. 작품명·작가명·레이블·출간일·플랫폼 파싱
3. 서지·원고·표지·제작·등록·승인 상태 반영
4. 출간일 기준 등록 마감일 자동 계산
5. 등록 마감 임박 미등록 작품 자동 선별
6. 담당자별 리마인드 문구 생성 및 복사
7. Teams Workflow/Incoming Webhook을 통한 자동 알림 발송
8. 동일한 대상 목록의 반복 발송 방지

## 프로젝트 구성

```text
src/
  App.tsx                    대시보드 화면과 사용자 동작
  launchDashboard.ts        마감일·상태·리마인드 계산
  teamsApi.ts                프론트엔드 Teams API 클라이언트
  syncMeta.ts                동기화 결과 메타데이터
  *.test.ts                  Vitest 테스트
server/
  teamsServer.mjs            로컬 Teams API 서버
  teamsSync.mjs              Microsoft Graph 조회와 타래 파싱
  teamsAutomation.mjs        예약 실행·웹훅 발송·중복 방지
TEAMS_SETUP.md               Teams 연동 설정 안내
```

## 로컬 실행

### 1. 패키지 설치

```bash
npm install
```

### 2. 서버 환경설정 준비

```bash
cp .env.example .env.local
```

`.env.local`의 `TEAMS_CLIENT_SECRET`에만 실제 Secret Value를 입력합니다. Teams Workflow를 만든 뒤에는 `TEAMS_WEBHOOK_URL`도 같은 파일에 입력합니다. 이 파일은 Git에 포함되지 않습니다.

### 3. Teams 동기화·자동 알림 서버 실행

```bash
npm run server
```

기본 주소는 `http://127.0.0.1:8787`입니다.

### 4. 프론트엔드 실행

별도 터미널에서 실행합니다.

```bash
npm run dev
```

Vite가 출력하는 로컬 주소로 접속합니다.

## 검증

```bash
npm test
npm run lint
npm run build
```

## Teams 연동에 필요한 값

### Microsoft Graph 읽기

- Tenant ID
- Client ID
- Client Secret
- Team ID
- Channel ID

### 알림 발송

- Teams Workflow 또는 Incoming Webhook URL

자세한 앱 권한과 입력 순서는 [`TEAMS_SETUP.md`](./TEAMS_SETUP.md)를 참고합니다.

## 보안 주의사항

- Client Secret과 Webhook URL을 Git에 커밋하지 않습니다.
- 비밀값은 Git에서 제외된 서버 전용 `.env.local`에만 저장합니다.
- 브라우저는 Client Secret과 Webhook URL을 입력하거나 전달하지 않습니다.
- 자동화 상태 파일 `server/.teams-automation-state.json`에는 비밀값을 기록하지 않습니다.

## 현재 운영상 제한

- 자동 알림은 `npm run server` 프로세스가 실행 중일 때만 동작합니다.
- 현재 자동 알림은 담당자 이름을 텍스트로 표시하며, 실제 Teams `@멘션`은 별도 사용자 ID 매핑과 메시지 형식 구현이 필요합니다.
- 정적 Vercel 프론트엔드만 배포하면 로컬 백엔드와 예약 실행이 자동으로 배포되지 않습니다.
- 서버 상태는 로컬 파일 기반이므로 다중 서버 또는 서버리스 환경에서는 영구 저장소로 교체해야 합니다.

## 배포 전 확인사항

1. 테스트 채널에서 Teams 읽기 성공 확인
2. 가상 작품 1건으로 웹훅 발송 확인
3. 반복 실행 시 중복 발송 방지 확인
4. 등록 완료 작품이 알림 대상에서 제외되는지 확인
5. 비밀정보가 Git 변경사항에 포함되지 않았는지 확인
6. 항상 실행되는 백엔드와 영구 저장 방식 확정
