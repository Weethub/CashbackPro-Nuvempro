-- Reconquista (inatividade) + aviso de pontos a expirar, com controle de reenvio.
ALTER TABLE "cashback_configs" ADD COLUMN "winbackEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "cashback_configs" ADD COLUMN "winbackDays" INTEGER NOT NULL DEFAULT 60;
ALTER TABLE "cashback_configs" ADD COLUMN "winbackPoints" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "cashback_configs" ADD COLUMN "pointsExpiryEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "cashback_configs" ADD COLUMN "pointsExpiryWarningDays" INTEGER NOT NULL DEFAULT 15;

ALTER TABLE "customer_points" ADD COLUMN "winbackSentAt" TIMESTAMP(3);
ALTER TABLE "customer_points" ADD COLUMN "pointsExpiryWarnedAt" TIMESTAMP(3);
