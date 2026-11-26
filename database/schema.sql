CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS platform_bootstrap (
  id text PRIMARY KEY DEFAULT 'kaafila',
  schema_version text NOT NULL DEFAULT '0.1.0',
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO platform_bootstrap (id, schema_version)
VALUES ('kaafila', '0.1.0')
ON CONFLICT (id) DO NOTHING;

-- Prisma owns the application tables in apps/api/prisma/schema.prisma.
-- Keep operational extensions, raw indexes, and future PostGIS materialized views here.

CREATE TABLE IF NOT EXISTS convoy_geo_events (
  id bigserial PRIMARY KEY,
  convoy_id text NOT NULL,
  vehicle_id text,
  event_type text NOT NULL,
  position geography(Point, 4326),
  payload jsonb NOT NULL DEFAULT '{}',
  captured_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS convoy_geo_events_convoy_time_idx
  ON convoy_geo_events (convoy_id, captured_at DESC);

CREATE INDEX IF NOT EXISTS convoy_geo_events_position_idx
  ON convoy_geo_events USING gist (position);

CREATE INDEX IF NOT EXISTS convoy_geo_events_payload_idx
  ON convoy_geo_events USING gin (payload);

CREATE MATERIALIZED VIEW IF NOT EXISTS convoy_daily_rollups AS
SELECT
  convoy_id,
  date_trunc('day', captured_at) AS day,
  count(*) AS event_count,
  count(DISTINCT vehicle_id) AS active_vehicles
FROM convoy_geo_events
GROUP BY convoy_id, date_trunc('day', captured_at);

CREATE UNIQUE INDEX IF NOT EXISTS convoy_daily_rollups_unique_idx
  ON convoy_daily_rollups (convoy_id, day);
