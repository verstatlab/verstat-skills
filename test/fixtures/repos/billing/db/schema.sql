CREATE TABLE invoices (
  id          BIGSERIAL PRIMARY KEY,
  customer_id BIGINT NOT NULL,
  total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
  currency    CHAR(3) NOT NULL,
  status      TEXT NOT NULL DEFAULT 'open',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE payments (
  id              BIGSERIAL PRIMARY KEY,
  invoice_id      BIGINT NOT NULL REFERENCES invoices(id),
  amount_cents    INTEGER NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  status          TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
