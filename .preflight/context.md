# Codebase context
- Stack: Expo Router 6 (Expo 54, React Native 0.81) + Hono-style backend (backend/) + shared/ workspace.
- Routes today: app/(auth)/login, display-name; app/(main)/index (home), connect, notifications;
  app/workout/complete (exercise types + media on ONE screen), app/workout/[id] (record detail + reactions); app/invite/[code].
- Navigation: Stack only, no bottom tabs yet. Settings/sign-out live on home.
- Home state logic: shared/src/home.ts homePhase = disconnected | waiting_for_member | neither | only_me | only_other | both.
- Nudge: nudgePresentation → "찌르기" / "오늘 찌르었어요"(disabled), once per day.
- Exercise types (8): 러닝 헬스 걷기 자전거 수영 홈트 요가 기타 (shared/src/exercises.ts), multi-select.
- Media: optional, max 3, video ≤ 10s (features/media/validate.ts).
- Reactions: heart/muscle/fire/clap, toggle via POST /workouts/:id/reactions (not own record).
- Streak: challenge.streak = consecutive days both completed.
- Missing: no history/list endpoint → 기록 tab needs a backend list API.
