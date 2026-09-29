import type { ExerciseCode } from "./exercises";
import type { MediaKind } from "./media";

export type PublicUser = {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  needsDisplayName: boolean;
};

export type TodayStatus = {
  completed: boolean;
  recordId: string | null;
  exerciseTypes: ExerciseCode[];
  customLabels: string[];
  mediaCount: number;
};

export type HomeMember = {
  userId: string;
  displayName: string;
  isMe: boolean;
  today: TodayStatus;
};

export type HomeNudge = {
  receiverId: string;
  receiverDisplayName: string;
  alreadyNudged: boolean;
  canNudge: boolean;
};

export type HomeChallenge = {
  id: string;
  name: string;
  memberLimit: number;
  mediaRequired: boolean;
  status: string;
  seoulDate: string;
  streak: number;
  todayMutual: boolean;
  todayInProgress: boolean;
  pendingInvite: { code: string; expiresAt: string } | null;
  members: HomeMember[];
  nudges: HomeNudge[];
};

export type HomeResponse = {
  user: PublicUser;
  challenge: HomeChallenge | null;
};

export type MediaItem = {
  id: string;
  type: MediaKind;
  url: string;
  durationSeconds: number | null;
  sizeBytes: number;
  createdAt: string;
};

export type ReactionType = "heart" | "muscle" | "fire" | "clap";

export type ReactionSummary = {
  type: ReactionType;
  count: number;
  mine: boolean;
};

export type WorkoutDetail = {
  id: string;
  challengeId: string;
  userId: string;
  displayName: string;
  seoulDate: string;
  exerciseTypes: ExerciseCode[];
  customLabels: string[];
  completedAt: string | null;
  frozen: boolean;
  canReact: boolean;
  media: MediaItem[];
  reactions: ReactionSummary[];
};

export type UserExercise = {
  id: string;
  label: string;
};

export type HistoryMember = {
  userId: string;
  displayName: string;
  isMe: boolean;
  recordId: string;
  exerciseTypes: ExerciseCode[];
  customLabels: string[];
  mediaCount: number;
  thumbUrl: string | null;
};

export type HistoryDay = {
  date: string;
  mutual: boolean;
  members: HistoryMember[];
};

export type HistoryResponse = {
  month: string;
  days: HistoryDay[];
};

export type NotificationItem = {
  id: string;
  type: "member_completed" | "nudge" | "mutual_success" | "evening_reminder";
  title: string;
  body: string;
  seoulDate: string | null;
  readAt: string | null;
  createdAt: string;
  actorDisplayName: string | null;
};

export type InvitePreview = {
  code: string;
  challengeId: string;
  challengeName: string;
  inviterDisplayName: string;
  expiresAt: string;
  status: "pending" | "used" | "expired";
};
