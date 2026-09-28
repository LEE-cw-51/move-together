import assert from "node:assert/strict";
import test from "node:test";
import { previousSeoulDate, shiftSeoulDate } from "./dates";
import { computeJointStreak } from "./streak";

const mon = "2026-09-21";
const tue = "2026-09-22";
const wed = "2026-09-23";
const thu = "2026-09-24";

test("previous Seoul date crosses month boundaries", () => {
  assert.equal(previousSeoulDate("2026-03-01"), "2026-02-28");
  assert.equal(shiftSeoulDate("2026-12-31", 1), "2027-01-01");
});

test("Monday and Tuesday mutual, Wednesday afternoon only one person: streak 2 and today in progress", () => {
  const result = computeJointStreak({
    memberIds: ["a", "b"],
    completedDatesByMember: {
      a: [mon, tue, wed],
      b: [mon, tue],
    },
    today: wed,
  });
  assert.equal(result.streak, 2);
  assert.equal(result.todayMutual, false);
  assert.equal(result.todayInProgress, true);
});

test("Wednesday never becomes mutual, so Thursday morning streak is 0", () => {
  const result = computeJointStreak({
    memberIds: ["a", "b"],
    completedDatesByMember: {
      a: [mon, tue, wed],
      b: [mon, tue],
    },
    today: thu,
  });
  assert.equal(result.streak, 0);
  assert.equal(result.todayMutual, false);
  assert.equal(result.todayInProgress, true);
});

test("both finish Thursday after a failed Wednesday: streak restarts at 1", () => {
  const result = computeJointStreak({
    memberIds: ["a", "b"],
    completedDatesByMember: {
      a: [mon, tue, wed, thu],
      b: [mon, tue, thu],
    },
    today: thu,
  });
  assert.equal(result.streak, 1);
  assert.equal(result.todayMutual, true);
  assert.equal(result.todayInProgress, false);
});

test("both complete today after Monday and Tuesday: streak includes today", () => {
  const result = computeJointStreak({
    memberIds: ["a", "b"],
    completedDatesByMember: {
      a: [mon, tue, wed],
      b: [mon, tue, wed],
    },
    today: wed,
  });
  assert.equal(result.streak, 3);
  assert.equal(result.todayMutual, true);
});

test("yesterday failed and today is not mutual yet: streak is 0", () => {
  const result = computeJointStreak({
    memberIds: ["a", "b"],
    completedDatesByMember: {
      a: [mon, tue],
      b: [mon],
    },
    today: wed,
  });
  assert.equal(result.streak, 0);
  assert.equal(result.todayMutual, false);
});

test("single member still requires every member, so that member's days count", () => {
  const result = computeJointStreak({
    memberIds: ["solo"],
    completedDatesByMember: {
      solo: [mon, tue],
    },
    today: wed,
  });
  assert.equal(result.streak, 2);
  assert.equal(result.todayInProgress, true);
});

test("a missing member blocks the day even if others finished", () => {
  const result = computeJointStreak({
    memberIds: ["a", "b", "c"],
    completedDatesByMember: {
      a: [mon],
      b: [mon],
      c: [],
    },
    today: tue,
  });
  assert.equal(result.streak, 0);
});

test("no members cannot form a success day", () => {
  const result = computeJointStreak({
    memberIds: [],
    completedDatesByMember: {},
    today: mon,
  });
  assert.equal(result.streak, 0);
  assert.equal(result.todayMutual, false);
});
