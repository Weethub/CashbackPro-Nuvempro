-- Validade dos pontos configurável: ciclo rolante por cliente (padrão, mantém
-- o comportamento atual de 6 meses) ou data fixa anual pra loja inteira.
ALTER TABLE "cashback_configs" ADD COLUMN "pointsExpiryMode" TEXT NOT NULL DEFAULT 'rolling';
ALTER TABLE "cashback_configs" ADD COLUMN "pointsExpiryRollingMonths" INTEGER NOT NULL DEFAULT 6;
ALTER TABLE "cashback_configs" ADD COLUMN "pointsExpiryAnnualMonth" INTEGER;
ALTER TABLE "cashback_configs" ADD COLUMN "pointsExpiryAnnualDay" INTEGER;
