-- Benefícios (lista JSON) e multiplicador de pontos por nível de fidelidade.
ALTER TABLE "cashback_tiers" ADD COLUMN "benefits" JSONB;
ALTER TABLE "cashback_tiers" ADD COLUMN "pointsMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 1;
