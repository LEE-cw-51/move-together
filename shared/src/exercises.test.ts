import assert from "node:assert/strict";
import test from "node:test";
import { normalizeCustomLabel, parseWorkoutSelection, workoutLabels } from "./exercises";

test("custom labels are trimmed and limited to 10 characters", () => {
  assert.equal(normalizeCustomLabel("  필라테스  "), "필라테스");
  assert.equal(normalizeCustomLabel("클라  이밍"), "클라 이밍");
  assert.equal(normalizeCustomLabel(""), null);
  assert.equal(normalizeCustomLabel("가".repeat(11)), null);
  assert.equal(normalizeCustomLabel(3), null);
});

test("a workout may be built-in only, custom only, or both, but not empty", () => {
  assert.deepEqual(parseWorkoutSelection(["run"], undefined), { ok: true, types: ["run"], customLabels: [] });
  assert.deepEqual(parseWorkoutSelection([], ["필라테스"]), { ok: true, types: [], customLabels: ["필라테스"] });
  assert.deepEqual(parseWorkoutSelection(["yoga"], ["클라이밍", "클라이밍"]), {
    ok: true,
    types: ["yoga"],
    customLabels: ["클라이밍"],
  });
  const empty = parseWorkoutSelection([], []);
  assert.equal(empty.ok, false);
  assert.equal(!empty.ok && empty.code, "exercise_type_required");
  const badCustom = parseWorkoutSelection(["run"], ["가".repeat(11)]);
  assert.equal(!badCustom.ok && badCustom.code, "invalid_custom_exercise");
  const badType = parseWorkoutSelection(["dance"], []);
  assert.equal(!badType.ok && badType.code, "invalid_exercise_type");
});

test("workout labels list built-in names before custom ones", () => {
  assert.equal(workoutLabels(["run", "yoga"], ["필라테스"]), "러닝, 요가, 필라테스");
});
