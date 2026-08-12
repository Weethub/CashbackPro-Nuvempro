-- Detecção automática da cor da loja (lida ao vivo da vitrine pelo widget)
-- em vez de depender só do brandColor configurado manualmente no painel.
ALTER TABLE "cashback_configs" ADD COLUMN "brandColorAuto" BOOLEAN NOT NULL DEFAULT true;
