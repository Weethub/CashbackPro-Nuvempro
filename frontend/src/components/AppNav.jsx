import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Box, Button, Text, Title, Sidebar } from '@nimbus-ds/components';
import LanguageSwitcher from './LanguageSwitcher.jsx';

export default function AppNav() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [supportOpen, setSupportOpen] = useState(false);

  const faqItems = t('support.faq', { returnObjects: true }) || [];

  const isActive = (path) =>
    path === '/'
      ? location.pathname === '/'
      : location.pathname.startsWith(path);

  return (
    <>
      <Box
        display="flex"
        alignItems="center"
        justifyContent="space-between"
        padding="2"
        paddingLeft="4"
        paddingRight="4"
        borderColor="neutral-surfaceHighlight"
        borderStyle="solid"
        borderWidth="none"
        borderBottomWidth="1"
        backgroundColor="neutral-background"
      >
        {/* Left nav */}
        <Box display="flex" gap="1" alignItems="center">
          <Button
            appearance={isActive('/') ? 'primary' : 'transparent'}
            onClick={() => navigate('/')}
          >
            {t('nav.dashboard')}
          </Button>
          <Button
            appearance={isActive('/settings') ? 'primary' : 'transparent'}
            onClick={() => navigate('/settings')}
          >
            {t('nav.settings')}
          </Button>
          {/* Placeholder for app-specific nav items */}
        </Box>

        {/* Right nav */}
        <Box display="flex" gap="2" alignItems="center">
          <Button
            appearance={isActive('/billing') ? 'primary' : 'transparent'}
            onClick={() => navigate('/billing')}
          >
            {t('nav.billing')}
          </Button>
          <Button
            appearance="transparent"
            onClick={() => setSupportOpen(true)}
          >
            {t('nav.support')}
          </Button>
          <LanguageSwitcher />
        </Box>
      </Box>

      {/* Support Sidebar */}
      <Sidebar
        open={supportOpen}
        onRemove={() => setSupportOpen(false)}
      >
        <Box display="flex" flexDirection="column" gap="6" padding="6">
          <Title as="h2">{t('support.title')}</Title>

          {/* WhatsApp link */}
          <Box display="flex" flexDirection="column" gap="2">
            <Button
              appearance="primary"
              as="a"
              href={`https://wa.me/${t('support.whatsappNumber', { defaultValue: '' })}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t('support.whatsapp')}
            </Button>
          </Box>

          {/* Video embed placeholder */}
          <Box display="flex" flexDirection="column" gap="2">
            <Title as="h4">{t('support.videoTitle')}</Title>
            <Box
              padding="4"
              borderColor="neutral-surfaceHighlight"
              borderStyle="dashed"
              borderWidth="1"
              borderRadius="2"
              display="flex"
              alignItems="center"
              justifyContent="center"
            >
              <Text color="neutral-textDisabled">Video placeholder</Text>
            </Box>
          </Box>

          {/* FAQ */}
          <Box display="flex" flexDirection="column" gap="3">
            <Title as="h4">FAQ</Title>
            {Array.isArray(faqItems) && faqItems.map((item, idx) => (
              <Box key={idx} display="flex" flexDirection="column" gap="1">
                <Text fontWeight="bold">{item.question}</Text>
                <Text color="neutral-textLow" fontSize="caption">{item.answer}</Text>
              </Box>
            ))}
          </Box>
        </Box>
      </Sidebar>
    </>
  );
}
