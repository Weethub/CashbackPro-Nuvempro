-- AlterTable: handle da pagina "Minha Fidelidade" criada via Nuvemshop Pages API (null = ainda nao criada).
ALTER TABLE "cashback_configs" ADD COLUMN "customerPageHandle" TEXT;
