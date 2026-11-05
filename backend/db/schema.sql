-- ============================================================================
--  NEWDEM — Modèle de données (PostgreSQL 15+ / PostGIS 3+)
--  VTC voitures & motos pour le Sénégal.
--  Montants : entiers en FCFA (XOF n'a pas de sous-unité) -> BIGINT.
--  Positions : geography(Point, 4326) (WGS84), distances en mètres.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ------------------------- Types énumérés -------------------------
CREATE TYPE user_role      AS ENUM ('passenger', 'driver', 'admin');
CREATE TYPE kyc_status     AS ENUM ('pending', 'submitted', 'approved', 'rejected');
CREATE TYPE driver_status  AS ENUM ('offline', 'online', 'on_trip');
CREATE TYPE vehicle_type   AS ENUM ('car', 'moto');
CREATE TYPE trip_status    AS ENUM (
  'requested', 'assigned', 'accepted', 'arriving',
  'in_progress', 'completed', 'cancelled', 'no_driver'
);
CREATE TYPE payment_method AS ENUM ('cash', 'wave', 'orange_money');
CREATE TYPE payment_status AS ENUM ('pending', 'processing', 'paid', 'failed', 'refunded');
CREATE TYPE txn_type       AS ENUM ('ride_payment', 'commission', 'payout', 'wallet_topup', 'refund');
CREATE TYPE txn_direction  AS ENUM ('in', 'out');

-- ------------------------- updated_at auto -------------------------
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

-- ============================= UTILISATEURS =============================
CREATE TABLE users (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  phone       VARCHAR(20)  NOT NULL UNIQUE,          -- format E.164 : +221...
  name        VARCHAR(120),
  role        user_role    NOT NULL DEFAULT 'passenger',
  is_active   BOOLEAN      NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_users_updated BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Codes OTP (auth par SMS). On stocke un hash, jamais le code en clair.
CREATE TABLE otp_codes (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  phone       VARCHAR(20)  NOT NULL,
  code_hash   TEXT         NOT NULL,
  attempts    SMALLINT     NOT NULL DEFAULT 0,
  expires_at  TIMESTAMPTZ  NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX idx_otp_phone ON otp_codes (phone, created_at DESC);

-- ============================= CONDUCTEURS =============================
CREATE TABLE drivers (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  kyc_status    kyc_status    NOT NULL DEFAULT 'pending',
  status        driver_status NOT NULL DEFAULT 'offline',
  rating        NUMERIC(3,2)  NOT NULL DEFAULT 5.00,
  rating_count  INTEGER       NOT NULL DEFAULT 0,
  last_location GEOGRAPHY(Point, 4326),
  last_seen_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_drivers_updated BEFORE UPDATE ON drivers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Index spatial GiST : cœur du matching (recherche des conducteurs proches).
CREATE INDEX idx_drivers_location ON drivers USING GIST (last_location);
-- Index partiel : on ne matche que les conducteurs en ligne.
CREATE INDEX idx_drivers_online ON drivers (status) WHERE status = 'online';

-- Véhicules (un conducteur peut avoir voiture ET moto).
CREATE TABLE vehicles (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  driver_id   UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  type        vehicle_type NOT NULL,
  brand       VARCHAR(60),
  model       VARCHAR(60),
  color       VARCHAR(40),
  plate       VARCHAR(20) NOT NULL UNIQUE,
  seats       SMALLINT    NOT NULL DEFAULT 4,
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_vehicles_driver ON vehicles (driver_id) WHERE is_active;

-- Documents KYC (on ne stocke que des métadonnées + URL chiffrée).
CREATE TABLE driver_documents (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  driver_id   UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  kind        VARCHAR(40) NOT NULL,       -- id_card | license | registration | insurance
  file_url    TEXT NOT NULL,
  verified    BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================= TARIFICATION =============================
-- Barèmes versionnés, modifiables sans redéploiement (un actif par type).
CREATE TABLE pricing (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vehicle_type   vehicle_type NOT NULL,
  base_fare      BIGINT NOT NULL,          -- prise en charge (FCFA)
  per_km         BIGINT NOT NULL,          -- prix au km
  per_min        BIGINT NOT NULL,          -- prix à la minute
  minimum_fare   BIGINT NOT NULL,          -- course minimum
  commission_pct NUMERIC(4,3) NOT NULL DEFAULT 0.180,  -- part Newdem (18%)
  is_active      BOOLEAN NOT NULL DEFAULT true,
  effective_from TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Un seul barème actif par type de véhicule.
CREATE UNIQUE INDEX uq_pricing_active ON pricing (vehicle_type) WHERE is_active;

-- ============================= COURSES =============================
CREATE TABLE trips (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  passenger_id       UUID NOT NULL REFERENCES users(id),
  driver_id          UUID REFERENCES drivers(id),
  vehicle_type       vehicle_type NOT NULL,
  status             trip_status  NOT NULL DEFAULT 'requested',

  origin             GEOGRAPHY(Point, 4326) NOT NULL,
  origin_label       TEXT,
  destination        GEOGRAPHY(Point, 4326) NOT NULL,
  destination_label  TEXT,

  est_distance_km    NUMERIC(6,2),
  est_duration_min   NUMERIC(6,1),
  actual_distance_km NUMERIC(6,2),
  actual_duration_min NUMERIC(6,1),

  quoted_fare        BIGINT NOT NULL,       -- prix annoncé avant la course
  final_fare         BIGINT,                -- prix figé en fin de course
  commission_amount  BIGINT,                -- part Newdem prélevée
  payment_method     payment_method,
  payment_status     payment_status NOT NULL DEFAULT 'pending',

  requested_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  assigned_at        TIMESTAMPTZ,
  accepted_at        TIMESTAMPTZ,
  started_at         TIMESTAMPTZ,
  completed_at       TIMESTAMPTZ,
  cancelled_at       TIMESTAMPTZ,
  cancel_reason      TEXT,

  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_trips_updated BEFORE UPDATE ON trips
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_trips_passenger ON trips (passenger_id, created_at DESC);
CREATE INDEX idx_trips_driver    ON trips (driver_id, created_at DESC);
CREATE INDEX idx_trips_status    ON trips (status);
CREATE INDEX idx_trips_origin    ON trips USING GIST (origin);

-- ============================= PORTEFEUILLE =============================
-- Pièce maîtresse : la commission Newdem est toujours prélevée ici,
-- y compris quand la course est payée en espèces.
CREATE TABLE wallets (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  driver_id   UUID NOT NULL UNIQUE REFERENCES drivers(id) ON DELETE CASCADE,
  balance     BIGINT NOT NULL DEFAULT 0,       -- solde en FCFA (peut être négatif)
  min_balance BIGINT NOT NULL DEFAULT -2000,   -- plancher : en dessous, hors ligne forcé
  currency    CHAR(3) NOT NULL DEFAULT 'XOF',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_wallets_updated BEFORE UPDATE ON wallets
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Grand livre du portefeuille : chaque mouvement, avec solde résultant.
CREATE TABLE wallet_ledger (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wallet_id     UUID NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  trip_id       UUID REFERENCES trips(id),
  type          txn_type NOT NULL,
  amount        BIGINT NOT NULL,          -- signé : + crédit, - débit
  balance_after BIGINT NOT NULL,
  note          TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ledger_wallet ON wallet_ledger (wallet_id, created_at DESC);

-- ============================= TRANSACTIONS =============================
-- Encaissements / reversements via prestataires (Wave, Orange Money).
CREATE TABLE transactions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id         UUID REFERENCES trips(id),
  wallet_id       UUID REFERENCES wallets(id),
  provider        VARCHAR(20) NOT NULL,        -- wave | orange_money | cash
  method          payment_method NOT NULL,
  direction       txn_direction NOT NULL,      -- in (encaissement) | out (payout)
  amount          BIGINT NOT NULL,
  status          payment_status NOT NULL DEFAULT 'pending',
  external_ref    TEXT,                        -- id session/checkout côté prestataire
  idempotency_key TEXT UNIQUE,                 -- anti-doublon sur webhooks
  raw             JSONB,                       -- payload prestataire brut
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_txn_updated BEFORE UPDATE ON transactions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX idx_txn_trip ON transactions (trip_id);
CREATE INDEX idx_txn_ref  ON transactions (external_ref);

-- ============================= NOTATIONS =============================
CREATE TABLE ratings (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id    UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  rater_id   UUID NOT NULL REFERENCES users(id),
  ratee_id   UUID NOT NULL REFERENCES users(id),
  stars      SMALLINT NOT NULL CHECK (stars BETWEEN 1 AND 5),
  comment    TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (trip_id, rater_id)
);

-- ============================= REFRESH TOKENS =============================
-- Jetons de rafraîchissement opaques (hash stocké), rotatifs et révocables.
CREATE TABLE refresh_tokens (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,      -- SHA-256 du jeton, jamais le jeton en clair
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked_at  TIMESTAMPTZ,               -- non nul = révoqué (rotation ou déconnexion)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_refresh_user ON refresh_tokens (user_id) WHERE revoked_at IS NULL;
