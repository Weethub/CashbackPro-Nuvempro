-- Bônus de boas-vindas (pontos na 1ª compra) + texto "Como funciona".
ALTER TABLE "cashback_configs" ADD COLUMN "welcomeBonusEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "cashback_configs" ADD COLUMN "welcomeBonusPoints" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "cashback_configs" ADD COLUMN "howItWorks" TEXT;
