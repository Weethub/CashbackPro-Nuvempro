-- Escolha do que acontece ao clicar no ícone flutuante: painel lateral
-- embutido (overlay, padrão) ou navegar pra página "Minha Fidelidade" (page).
ALTER TABLE "cashback_configs" ADD COLUMN "widgetClickAction" TEXT NOT NULL DEFAULT 'overlay';
