# Teams 연동 안내

## 1. 현재 구현 범위
- 이 버전은 **Teams 읽기 + 자동 알림 발송 1차 운영판**입니다.
- Microsoft Graph 앱 자격증명으로 Teams 채널 메시지를 읽어옵니다.
- 채널 안에서 **론칭 준비 타래** 형태의 메시지만 골라서 작품 표로 변환합니다.
- 본문에서 아래 항목을 파싱합니다.
  - 레이블
  - 작가
  - 제목
  - 출간 일정
  - 구분(연재/단행)
  - 출간 플랫폼
- 답글에서 아래 진행 신호를 읽습니다.
  - 서지정보 완
  - 원고 완
  - 표지 완
  - 제작 시작
  - 등록 완료
  - 승인 대기
- 메시지 또는 답글에 `like` 반응이 있으면 `따봉 완료`로 처리합니다.
- 위험 건은 **Teams 채널 웹훅**으로 자동 리마인드 발송할 수 있습니다.

## 2. Microsoft Graph 앱 등록에 필요한 권한
앱 등록 후 **Application permissions** 기준으로 아래 권한이 필요합니다.

- `ChannelMessage.Read.All`
- `Team.ReadBasic.All`
- `Channel.ReadBasic.All`

권한 추가 후 **Grant admin consent**까지 완료해야 합니다.

## 3. 필요한 값
대시보드의 **Teams 연동 설정** / **Teams 자동 알림 발송** 영역에 아래 값을 넣습니다.

### Teams 읽기용
- Tenant ID
- Client ID
- Client Secret
- Team ID
- Channel ID
- 조회 개수

### 자동 알림 발송용
- Teams Incoming Webhook 또는 Workflow Webhook URL
- 자동 발송 사용 여부
- 실행 주기(분)
- 리마인드 기준 영업일

## 4. 실행 방법
### 프론트
```bash
cd /home/viewcommz/hackathon-dashboard
npm install
npm run dev
```

### Teams 동기화/자동 알림 서버
```bash
cd /home/viewcommz/hackathon-dashboard
npm run server
```

기본 동기화 서버 주소는 `http://127.0.0.1:8787` 입니다.

## 5. 현재 파싱 규칙 예시
### 본문 예시
```text
레이블: @에이블
작가: 홍길동
제목: 새벽 끝의 로맨스
출간 일정: 2026.08.27
구분: 연재
출간 플랫폼: 카카오페이지
```

### 답글 예시
```text
서지정보, 표지 완입니다.
원고 완입니다!
등록 완료했습니다.
승인 대기 부탁드립니다.
```

## 6. 자동 알림 동작 방식
- 대시보드에서 **자동 알림 설정 저장**을 누르면 서버가 로컬 상태 파일에 설정을 저장합니다.
- **자동 발송 사용=켜기** 상태면 서버가 설정한 주기마다 Teams를 다시 읽고 위험 건만 추려 웹훅으로 보냅니다.
- 같은 작품/같은 단계 조합이면 중복 발송을 막기 위해 자동으로 생략합니다.
- **지금 1회 발송** 버튼으로 즉시 테스트할 수 있습니다.
- 서버는 `server/.teams-automation-state.json`에 자동 발송 설정과 최근 실행 결과를 기록합니다.

## 7. 참고 사항
- Client Secret은 브라우저 localStorage에 저장하지 않고, 서버 상태 파일에만 보관됩니다.
- 웹훅 URL도 자동 발송을 위해 서버 상태 파일에 보관됩니다.
- 서버가 꺼져 있으면 자동 발송도 함께 멈춥니다.
- 더 고도화하려면 향후 Teams 봇/Graph 쓰기 권한 방식으로 확장할 수 있습니다.
