-- AlterTable: icone (data URI base64) e cor (hex) por nivel de fidelidade.
ALTER TABLE "cashback_tiers" ADD COLUMN "icon" TEXT;
ALTER TABLE "cashback_tiers" ADD COLUMN "color" TEXT DEFAULT '#0F7A5C';
