export const EXERCISE_TYPES = [
  { code: "run", label: "러닝" },
  { code: "gym", label: "헬스" },
  { code: "walk", label: "걷기" },
  { code: "bike", label: "자전거" },
  { code: "swim", label: "수영" },
  { code: "home", label: "홈트" },
  { code: "yoga", label: "요가" },
  { code: "other", label: "기타" },
] as const;

export type ExerciseCode = (typeof EXERCISE_TYPES)[number]["code"];

const EXERCISE_CODES = new Set<string>(EXERCISE_TYPES.map((item) => item.code));

export function exerciseLabel(code: string): string {
  return EXERCISE_TYPES.find((item) => item.code === code)?.label ?? code;
}

export function exerciseLabels(codes: readonly string[]): string {
  return codes.map(exerciseLabel).join(" · ");
}

export type ExerciseParseResult =
  | { ok: true; types: ExerciseCode[] }
  | { ok: false; code: "exercise_type_required" | "invalid_exercise_type"; message: string };

export function parseExerciseTypes(input: unknown): ExerciseParseResult {
  if (!Array.isArray(input) || input.length === 0) {
    return {
      ok: false,
      code: "exercise_type_required",
      message: "운동 종류를 하나 이상 골라 주세요",
    };
  }
  const types: ExerciseCode[] = [];
  for (const item of input) {
    if (typeof item !== "string" || !EXERCISE_CODES.has(item)) {
      return {
        ok: false,
        code: "invalid_exercise_type",
        message: "알 수 없는 운동 종류가 있어요",
      };
    }
    const code = item as ExerciseCode;
    if (!types.includes(code)) {
      types.push(code);
    }
  }
  return { ok: true, types };
}

export const CUSTOM_LABEL_MAX_LENGTH = 10;
export const CUSTOM_EXERCISE_LIMIT = 20;

/** Trims a custom exercise name; null when it is empty or too long. */
export function normalizeCustomLabel(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const label = input.trim().replace(/\s+/g, " ");
  if (label.length === 0 || label.length > CUSTOM_LABEL_MAX_LENGTH) return null;
  return label;
}

export type WorkoutSelectionResult =
  | { ok: true; types: ExerciseCode[]; customLabels: string[] }
  | {
      ok: false;
      code: "exercise_type_required" | "invalid_exercise_type" | "invalid_custom_exercise";
      message: string;
    };

/** A workout needs at least one exercise, built-in or custom. */
export function parseWorkoutSelection(typesInput: unknown, customInput: unknown): WorkoutSelectionResult {
  const rawCustom = customInput == null ? [] : customInput;
  if (!Array.isArray(rawCustom)) {
    return { ok: false, code: "invalid_custom_exercise", message: "내 운동 이름을 확인해 주세요" };
  }
  const customLabels: string[] = [];
  for (const item of rawCustom) {
    const label = normalizeCustomLabel(item);
    if (!label) return { ok: false, code: "invalid_custom_exercise", message: "내 운동 이름을 확인해 주세요" };
    if (!customLabels.some((existing) => existing.toLowerCase() === label.toLowerCase())) customLabels.push(label);
  }
  const rawTypes = typesInput == null ? [] : typesInput;
  if (Array.isArray(rawTypes) && rawTypes.length === 0) {
    if (customLabels.length === 0) {
      return { ok: false, code: "exercise_type_required", message: "운동 종류를 하나 이상 골라 주세요" };
    }
    return { ok: true, types: [], customLabels };
  }
  const parsed = parseExerciseTypes(rawTypes);
  if (!parsed.ok) return parsed;
  return { ok: true, types: parsed.types, customLabels };
}

/** Built-in labels followed by custom names, for one-line summaries. */
export function workoutLabels(types: readonly string[], customLabels: readonly string[] = []): string {
  return [...types.map(exerciseLabel), ...customLabels].join(", ");
}
