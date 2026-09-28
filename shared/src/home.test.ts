import assert from "node:assert/strict";
import test from "node:test";
import { homePhase, nudgePresentation } from "./home";
import { validateNewMedia } from "./media";

test("home before connection offers no member state", () => {
  assert.deepEqual(
    homePhase({
      hasChallenge: false,
      hasOtherMember: false,
      meCompleted: false,
      otherCompleted: false,
    }),
    { phase: "disconnected" },
  );
});

test("neither done keeps complete and nudge available", () => {
  assert.equal(
    homePhase({
      hasChallenge: true,
      hasOtherMember: true,
      meCompleted: false,
      otherCompleted: false,
    }).phase,
    "neither",
  );
  assert.deepEqual(
    nudgePresentation({ hasOtherMember: true, otherCompleted: false, alreadyNudged: false }),
    { visible: true, enabled: true, label: "찌르기" },
  );
});

test("only me done still nudges until the other person finishes", () => {
  assert.equal(
    homePhase({
      hasChallenge: true,
      hasOtherMember: true,
      meCompleted: true,
      otherCompleted: false,
    }).phase,
    "only_me",
  );
});

test("both done hides the nudge and shows the mutual banner", () => {
  const phase = homePhase({
    hasChallenge: true,
    hasOtherMember: true,
    meCompleted: true,
    otherCompleted: true,
  });
  assert.deepEqual(phase, { phase: "both", banner: "오늘은 둘 다 성공" });
  assert.equal(
    nudgePresentation({ hasOtherMember: true, otherCompleted: true, alreadyNudged: false }),
    null,
  );
});

test("an existing nudge disables the button with fixed copy", () => {
  assert.deepEqual(
    nudgePresentation({ hasOtherMember: true, otherCompleted: false, alreadyNudged: true }),
    { visible: true, enabled: false, label: "오늘 찌르었어요" },
  );
});

test("media rules reject a fourth item, oversize files, long video, and unknown duration", () => {
  assert.equal(validateNewMedia({ kind: "image", sizeBytes: 100, durationSeconds: null, existingCount: 3 }).ok, false);
  assert.equal(
    validateNewMedia({ kind: "image", sizeBytes: 8 * 1024 * 1024 + 1, durationSeconds: null, existingCount: 0 }).ok,
    false,
  );
  const longVideo = validateNewMedia({
    kind: "video",
    sizeBytes: 1000,
    durationSeconds: 10.1,
    existingCount: 0,
  });
  assert.equal(longVideo.ok, false);
  if (!longVideo.ok) assert.equal(longVideo.code, "video_too_long");
  const unknown = validateNewMedia({
    kind: "video",
    sizeBytes: 1000,
    durationSeconds: null,
    existingCount: 0,
  });
  assert.equal(unknown.ok, false);
  if (!unknown.ok) assert.equal(unknown.code, "video_duration_unknown");
  assert.equal(validateNewMedia({ kind: "video", sizeBytes: 1000, durationSeconds: 10, existingCount: 2 }).ok, true);
});
