-- Muda o padrão da cor da marca para o roxo do novo layout do cliente.
-- Só afeta lojas novas; lojas existentes mantêm a cor que já escolheram.
ALTER TABLE "cashback_configs" ALTER COLUMN "brandColor" SET DEFAULT '#7C3AED';
