-- Pausa com 2 modos: manter acesso do cliente vs bloquear tudo.
ALTER TABLE "cashback_configs" ADD COLUMN "blockAccessWhenPaused" BOOLEAN NOT NULL DEFAULT false;

-- Trava atômica pro bônus de boas-vindas (evita crédito duplicado em corrida).
ALTER TABLE "customer_points" ADD COLUMN "welcomeBonusGrantedAt" TIMESTAMP(3);
