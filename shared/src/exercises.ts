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
