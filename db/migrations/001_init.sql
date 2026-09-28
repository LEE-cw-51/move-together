-- Move Together MVP schema. Seoul dates are DATE keys (YYYY-MM-DD), not timestamps.
-- gen_random_uuid() is built into PostgreSQL 13+ (including Neon).

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  display_name TEXT,
  avatar_url TEXT,
  timezone TEXT NOT NULL DEFAULT 'Asia/Seoul',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT users_display_name_len CHECK (display_name IS NULL OR char_length(display_name) BETWEEN 1 AND 20)
);

CREATE TABLE magic_link_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX sessions_user_idx ON sessions (user_id);

CREATE TABLE challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL DEFAULT '우리의 운동',
  member_limit INT NOT NULL DEFAULT 2 CHECK (member_limit >= 1),
  end_date DATE,
  media_required BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended')),
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE challenge_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id UUID NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (challenge_id, user_id)
);

CREATE INDEX challenge_members_user_idx ON challenge_members (user_id);

CREATE OR REPLACE FUNCTION enforce_one_active_challenge()
RETURNS TRIGGER AS $fn$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM challenge_members cm
    JOIN challenges c ON c.id = cm.challenge_id
    WHERE cm.user_id = NEW.user_id
      AND c.status = 'active'
      AND cm.id IS DISTINCT FROM NEW.id
  ) THEN
    RAISE EXCEPTION 'already_in_active_challenge'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$fn$ LANGUAGE plpgsql;

CREATE TRIGGER challenge_members_one_active
BEFORE INSERT ON challenge_members
FOR EACH ROW EXECUTE FUNCTION enforce_one_active_challenge();

CREATE OR REPLACE FUNCTION enforce_member_limit()
RETURNS TRIGGER AS $fn$
DECLARE
  lim INT;
  cnt INT;
BEGIN
  SELECT member_limit INTO lim FROM challenges WHERE id = NEW.challenge_id FOR UPDATE;
  SELECT COUNT(*) INTO cnt FROM challenge_members WHERE challenge_id = NEW.challenge_id;
  IF cnt >= lim THEN
    RAISE EXCEPTION 'member_limit_reached'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$fn$ LANGUAGE plpgsql;

CREATE TRIGGER challenge_members_limit
BEFORE INSERT ON challenge_members
FOR EACH ROW EXECUTE FUNCTION enforce_member_limit();

CREATE TABLE invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id UUID NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  created_by UUID NOT NULL REFERENCES users(id),
  expires_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'used', 'expired')),
  used_by UUID REFERENCES users(id),
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX invites_challenge_idx ON invites (challenge_id);

CREATE TABLE workout_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id UUID NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seoul_date DATE NOT NULL,
  exercise_types TEXT[] NOT NULL DEFAULT '{}',
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (challenge_id, user_id, seoul_date),
  CONSTRAINT exercise_types_known CHECK (
    exercise_types <@ ARRAY['run', 'gym', 'walk', 'bike', 'swim', 'home', 'yoga', 'other']::text[]
  ),
  CONSTRAINT completed_requires_type CHECK (
    completed_at IS NULL OR cardinality(exercise_types) >= 1
  )
);

CREATE INDEX workout_records_challenge_date_idx ON workout_records (challenge_id, seoul_date);

CREATE TABLE media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workout_record_id UUID NOT NULL REFERENCES workout_records(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('image', 'video')),
  url TEXT NOT NULL,
  duration_seconds NUMERIC(6, 2),
  size_bytes INT NOT NULL CHECK (size_bytes > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT video_duration_bounds CHECK (
    (type = 'image' AND duration_seconds IS NULL)
    OR (
      type = 'video'
      AND duration_seconds IS NOT NULL
      AND duration_seconds > 0
      AND duration_seconds <= 10
    )
  ),
  CONSTRAINT media_size_cap CHECK (
    (type = 'image' AND size_bytes <= 8388608)
    OR (type = 'video' AND size_bytes <= 15728640)
  )
);

CREATE INDEX media_record_idx ON media (workout_record_id);

CREATE OR REPLACE FUNCTION enforce_media_limit()
RETURNS TRIGGER AS $fn$
DECLARE
  cnt INT;
BEGIN
  SELECT COUNT(*) INTO cnt FROM media WHERE workout_record_id = NEW.workout_record_id;
  IF cnt >= 3 THEN
    RAISE EXCEPTION 'media_limit'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$fn$ LANGUAGE plpgsql;

CREATE TRIGGER media_limit_trigger
BEFORE INSERT ON media
FOR EACH ROW EXECUTE FUNCTION enforce_media_limit();

CREATE TABLE nudges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id UUID NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES users(id),
  receiver_id UUID NOT NULL REFERENCES users(id),
  seoul_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (challenge_id, sender_id, receiver_id, seoul_date),
  CHECK (sender_id <> receiver_id)
);

CREATE TABLE reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workout_record_id UUID NOT NULL REFERENCES workout_records(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('heart', 'muscle', 'fire', 'clap')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workout_record_id, user_id, type)
);

CREATE OR REPLACE FUNCTION enforce_reaction_not_own()
RETURNS TRIGGER AS $fn$
DECLARE
  owner UUID;
BEGIN
  SELECT user_id INTO owner FROM workout_records WHERE id = NEW.workout_record_id;
  IF owner IS NULL OR owner = NEW.user_id THEN
    RAISE EXCEPTION 'cannot_react_own_record'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$fn$ LANGUAGE plpgsql;

CREATE TRIGGER reactions_not_own
BEFORE INSERT ON reactions
FOR EACH ROW EXECUTE FUNCTION enforce_reaction_not_own();

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('member_completed', 'nudge', 'mutual_success', 'evening_reminder')),
  challenge_id UUID REFERENCES challenges(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES users(id),
  workout_record_id UUID REFERENCES workout_records(id) ON DELETE SET NULL,
  seoul_date DATE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  read_at TIMESTAMPTZ,
  dedupe_key TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX notifications_user_created_idx ON notifications (user_id, created_at DESC);

CREATE TABLE push_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN (
    'app_opened',
    'workout_completed',
    'media_added',
    'nudge_sent',
    'workout_completed_after_nudge',
    'reaction_added',
    'mutual_success',
    'invite_created',
    'invite_accepted'
  )),
  challenge_id UUID REFERENCES challenges(id) ON DELETE SET NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX events_type_created_idx ON events (type, created_at);
