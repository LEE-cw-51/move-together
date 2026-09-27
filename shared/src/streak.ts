import { previousSeoulDate } from "./dates";

export type JointStreakInput = {
  memberIds: readonly string[];
  /** Completed Seoul dates (YYYY-MM-DD) for each member. */
  completedDatesByMember: Readonly<Record<string, readonly string[]>>;
  /** Current Seoul local date. */
  today: string;
};

export type JointStreakResult = {
  streak: number;
  todayMutual: boolean;
  /** Today is not a mutual success yet, so the open day is still in progress. */
  todayInProgress: boolean;
};

/**
 * Joint streak is computed, never stored.
 * A success day is a Seoul date where every member has a completed workout.
 * If today is not mutual yet, count the run ending yesterday.
 * A failed day breaks the run: the next morning does not keep the earlier streak.
 */
export function computeJointStreak(input: JointStreakInput): JointStreakResult {
  const members = input.memberIds;
  const completed = new Map<string, Set<string>>();
  for (const memberId of members) {
    completed.set(memberId, new Set(input.completedDatesByMember[memberId] ?? []));
  }

  const isMutual = (date: string) =>
    members.length > 0 && members.every((memberId) => completed.get(memberId)?.has(date) === true);

  const todayMutual = isMutual(input.today);
  let cursor = todayMutual ? input.today : previousSeoulDate(input.today);
  let streak = 0;
  while (streak < 3660 && isMutual(cursor)) {
    streak += 1;
    cursor = previousSeoulDate(cursor);
  }

  return {
    streak,
    todayMutual,
    todayInProgress: !todayMutual,
  };
}
