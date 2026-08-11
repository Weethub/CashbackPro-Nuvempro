-- Permite repetir a data fixa de validade N vezes por ano (ex.: 2x = a cada 6
-- meses, 4x = trimestral), em vez de só uma vez por ano.
ALTER TABLE "cashback_configs" ADD COLUMN "pointsExpiryTimesPerYear" INTEGER NOT NULL DEFAULT 1;
