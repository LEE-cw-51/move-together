export type TodaySnapshot = {
  completed: boolean;
  exerciseTypes: readonly string[];
  mediaCount: number;
};

export type NudgePresentation = {
  visible: boolean;
  enabled: boolean;
  label: "찌르기" | "오늘 찔렀어요";
};

export function nudgePresentation(input: {
  hasOtherMember: boolean;
  otherCompleted: boolean;
  alreadyNudged: boolean;
}): NudgePresentation | null {
  if (!input.hasOtherMember || input.otherCompleted) {
    return null;
  }
  if (input.alreadyNudged) {
    return { visible: true, enabled: false, label: "오늘 찔렀어요" };
  }
  return { visible: true, enabled: true, label: "찌르기" };
}

export type HomePhase =
  | { phase: "disconnected" }
  | { phase: "waiting_for_member" }
  | { phase: "neither" }
  | { phase: "only_me" }
  | { phase: "only_other" }
  | { phase: "both"; banner: "오늘은 둘 다 성공" };

export function homePhase(input: {
  hasChallenge: boolean;
  hasOtherMember: boolean;
  meCompleted: boolean;
  otherCompleted: boolean;
}): HomePhase {
  if (!input.hasChallenge) {
    return { phase: "disconnected" };
  }
  if (!input.hasOtherMember) {
    return { phase: "waiting_for_member" };
  }
  if (input.meCompleted && input.otherCompleted) {
    return { phase: "both", banner: "오늘은 둘 다 성공" };
  }
  if (input.meCompleted) {
    return { phase: "only_me" };
  }
  if (input.otherCompleted) {
    return { phase: "only_other" };
  }
  return { phase: "neither" };
}
