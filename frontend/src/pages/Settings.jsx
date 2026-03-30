import React from 'react';
import { useTranslation } from 'react-i18next';
import { Box, Card, Text, Title } from '@nimbus-ds/components';

/**
 * Settings — Placeholder para configurações do app.
 *
 * Esta página não é usada pelo template base.
 * Adicione aqui as configurações específicas do seu app:
 *   - Preferências do usuário/loja
 *   - Integrações
 *   - Notificações
 *   etc.
 *
 * Para ativar, adicione a rota em App.jsx e o botão em AppNav.jsx.
 */
export default function Settings() {
  const { t } = useTranslation();

  return (
    <Box display="flex" flexDirection="column" gap="4">
      <Title as="h2">{t('settings.title')}</Title>
      <Card>
        <Card.Body>
          <Text color="neutral-textLow">{t('settings.placeholder')}</Text>
        </Card.Body>
      </Card>
    </Box>
  );
}
