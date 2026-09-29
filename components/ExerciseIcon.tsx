import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { ExerciseCode } from "@/features/workout/exercises";

const ICONS: Record<ExerciseCode, keyof typeof MaterialCommunityIcons.glyphMap> = {
  run: "run",
  gym: "dumbbell",
  walk: "walk",
  bike: "bike",
  swim: "swim",
  home: "home",
  yoga: "yoga",
  other: "dots-horizontal",
};

export function ExerciseIcon({ code, size = 20, color }: { code: ExerciseCode; size?: number; color: string }) {
  return <MaterialCommunityIcons name={ICONS[code]} size={size} color={color} />;
}
