# 무브 투게더

두 사람이 연결되어, 오늘 서로 움직였는지만 확인하는 앱입니다. 거리, 시간, 칼로리, 순위는 다루지 않습니다. 화면 문구는 한국어이고, 상대는 항상 그 사람의 표시 이름으로 보여요.

오늘은 기기 시계가 아니라 서버의 **Asia/Seoul** 자정 기준입니다. 날짜 키는 `YYYY-MM-DD`입니다.

## 구성

- `app/`, `components/`, `features/`, `lib/` — Expo Router + React Native + TypeScript. iOS/Android 한 코드베이스입니다. 앱은 Postgres에 직접 연결하지 않습니다.
- `backend/` — 인증, 권한, 운동 기록, 미디어 메타데이터, 찌르기, 반응, 스트릭 조회, 알림, 푸시를 담당하는 TypeScript API입니다.
- `shared/` — 운동 종류, 스트릭 계산, 미디어 제한처럼 앱과 API가 함께 쓰는 규칙입니다.
- `db/migrations/` — Neon Postgres(또는 다른 Postgres)용 SQL입니다.

한 사람은 진행 중인 챌린지를 하나만 가질 수 있습니다. `member_limit` 기본값은 2이고, 세 번째 참여는 거절됩니다. 기본 챌린지 이름은 `우리의 운동`입니다.

## 실행

```bash
npm install
cp .env.example .env
# .env에 DATABASE_URL을 넣은 뒤
npm run migrate
npm run backend:dev
```

다른 터미널에서:

```bash
# 시뮬레이터는 localhost, 실기기는 컴퓨터의 LAN 주소
EXPO_PUBLIC_API_URL=http://localhost:8787 npm start
```

Expo Go(SDK 54)로 iOS/Android에서 엽니다. 전화번호 로그인이나 웹 앱이 본체가 아닙니다.

## 환경 변수

| 변수 | 설명 |
| --- | --- |
| `EXPO_PUBLIC_API_URL` | 앱이 호출하는 API 주소 |
| `DATABASE_URL` | Neon 등 Postgres 접속 문자열. 없으면 DB를 쓰는 API가 시작 시 분명한 오류로 멈춥니다 |
| `PORT` | API 포트. 기본 `8787` |
| `NODE_ENV` | `production`이면 매직 링크를 응답에 넣지 않습니다 |
| `PUBLIC_API_URL` | 로컬 개발 저장소의 파일 URL 앞에 붙는 주소 |
| `APP_SCHEME` | 매직 링크 스킴. 기본 `movetogether` |
| `RESEND_API_KEY` | 있으면 Resend로 로그인 메일을 보냅니다. 없으면 개발 모드에서 서버 로그에 링크를 남깁니다 |
| `EMAIL_FROM` | 메일 발신자 |
| `MAGIC_LINK_TTL_MINUTES` | 매직 링크 유효 시간. 기본 15 |
| `SESSION_TTL_DAYS` | 세션 유효 일수. 기본 30 |
| `INVITE_TTL_DAYS` | 초대 코드 유효 일수. 기본 7 |
| `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | 네 값이 모두 있으면 S3 호환 저장소(Cloudflare R2, Neon Object Storage)에 파일을 올립니다 |
| `S3_REGION` | 기본 `auto` |
| `S3_PUBLIC_BASE_URL` | 올린 파일의 공개 URL 접두사. 없으면 endpoint/bucket을 사용합니다 |
| `LOCAL_STORAGE_DIR` | 클라우드 설정이 없을 때의 로컬 파일 디렉터리. 기본 `backend/storage`. URL만 Postgres에 저장합니다 |
| `EXPO_ACCESS_TOKEN` | 있으면 Expo Push 요청에 붙입니다. 없어도 알림 행은 항상 저장합니다 |
| `CRON_SECRET` | `POST /internal/jobs/evening-reminders` 보호용. 없으면 그 경로는 503입니다 |

예시 값은 `.env.example`에 있습니다. `.env`는 커밋하지 않습니다.

## 마이그레이션

```bash
npm run migrate
```

`db/migrations`의 SQL을 파일 이름 순으로 적용하고 `schema_migrations`에 기록합니다.

## 개발용 매직 링크

이메일 제공자(`RESEND_API_KEY`)가 없으면 서버 로그에 `movetogether://auth/verify?token=...` 형태의 링크를 출력합니다. `NODE_ENV`가 `production`이 아닐 때는 API 응답의 `devToken`, `devMagicLink`로도 돌려주므로 로그인 화면의 **개발용으로 로그인**으로 들어올 수 있습니다.

`NODE_ENV=production`에서는 응답에 링크와 토큰을 넣지 않습니다. 메일을 보내지 못하면 502만 반환합니다.

세션 토큰은 앱의 `expo-secure-store`에 두고, API는 매 요청마다 검증합니다.

## 저녁 리마인더

`runEveningReminders`는 서울 날짜 기준으로, 오늘 운동을 마치지 않은 구성원에게 알림을 최대 한 번 만듭니다. 같은 날 다시 실행해도 중복되지 않습니다. 외부 크론 업체는 필요하지 않습니다. 나중에 호출할 엔드포인트:

```bash
curl -X POST http://localhost:8787/internal/jobs/evening-reminders \
  -H "Authorization: Bearer $CRON_SECRET"
```

## 테스트

```bash
npm test
```

스트릭 규칙은 `shared`의 순수 함수 테스트로 확인합니다. API 테스트는 임베디드 Postgres(PGlite)에 마이그레이션을 적용한 뒤 초대 1회성·만료, 세 번째 멤버 거절, 운동 종류 필수, 미디어 제한, 하루 한 번 찌르기, 비멤버 거부, 두 번째 완료에서만 함께 성공 알림, 수정 시 알림이 늘지 않음을 검사합니다.

`DATABASE_URL`이 있으면 `npm run migrate`로 같은 SQL을 Neon에 적용합니다. `TEST_DATABASE_URL`을 주면 API 테스트가 PGlite 대신 그 Postgres에서 실행됩니다.

## 범위 밖

운동 시간, 거리, 칼로리, GPS, 세트, 무게, 심박수, Apple Health/Google Fit, AI, 피드, 랭킹, 배지, 댓글, 찌르기 문구 수정, 동시에 여러 챌린지, 그룹 챌린지, 결제. 서버는 영상을 변환하거나 자르지 않습니다. 10초를 넘는 영상, 길이를 읽지 못한 영상, 사진 8MB 초과, 영상 15MB 초과, 기록당 4개째 미디어는 업로드 전에 거절합니다.

카메라, 푸시 수신, TestFlight 설치는 실기기에서 따로 확인해야 합니다.
