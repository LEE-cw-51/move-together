-- Each person keeps their own list of extra exercises beyond the built-in eight.
CREATE TABLE user_exercises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label TEXT NOT NULL CHECK (char_length(label) BETWEEN 1 AND 10),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX user_exercises_user_label_idx ON user_exercises (user_id, lower(label));

-- A record keeps a copy of the custom names it was saved with, so deleting an
-- exercise from the list never renames past days.
ALTER TABLE workout_records ADD COLUMN custom_labels TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE workout_records DROP CONSTRAINT completed_requires_type;
ALTER TABLE workout_records ADD CONSTRAINT completed_requires_type CHECK (
  completed_at IS NULL OR cardinality(exercise_types) + cardinality(custom_labels) >= 1
);
