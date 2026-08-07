-- Suporte ao cliente final: mensagem + canais de contato (WhatsApp/e-mail).
ALTER TABLE "cashback_configs" ADD COLUMN "supportMessage" TEXT;
ALTER TABLE "cashback_configs" ADD COLUMN "supportWhatsapp" TEXT;
ALTER TABLE "cashback_configs" ADD COLUMN "supportEmail" TEXT;
