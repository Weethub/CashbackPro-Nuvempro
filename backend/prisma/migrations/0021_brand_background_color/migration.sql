-- Cor de fundo configurável separadamente da cor principal.
ALTER TABLE "cashback_configs" ADD COLUMN "brandBackgroundColor" TEXT DEFAULT '#F5F3F7';

-- A detecção automática de cor volta a ser opt-in (desligada por padrão) —
-- o lojista escolhe as duas cores manualmente por padrão agora.
ALTER TABLE "cashback_configs" ALTER COLUMN "brandColorAuto" SET DEFAULT false;
UPDATE "cashback_configs" SET "brandColorAuto" = false;
