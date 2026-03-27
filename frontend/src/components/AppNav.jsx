import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Box, Button, Text, Title, Sidebar, NavTabs } from '@nimbus-ds/components';
import LanguageSwitcher from './LanguageSwitcher.jsx';

export default function AppNav() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [supportOpen, setSupportOpen] = useState(false);

  const faqItems = t('support.faq', { returnObjects: true }) || [];

  return (
    <>
      <Box
        display="flex"
        alignItems="center"
        justifyContent="space-between"
        padding="4"
        borderColor="neutral-surfaceHighlight"
        borderStyle="solid"
        borderWidth="none"
        borderBottomWidth="1"
      >
        {/* Left nav */}
        <Box display="flex" gap="2" alignItems="center">
          <NavTabs>
            <NavTabs.Item
              active={location.pathname === '/'}
              onClick={() => navigate('/')}
            >
              {t('nav.dashboard')}
            </NavTabs.Item>
            {/* Placeholder for app-specific nav items */}
          </NavTabs>
        </Box>

        {/* Right nav */}
        <Box display="flex" gap="2" alignItems="center">
          <Button
            appearance={location.pathname === '/billing' ? 'primary' : 'transparent'}
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
        <Sidebar.Header title={t('support.title')} />
        <Sidebar.Body>
          <Box display="flex" flexDirection="column" gap="4" padding="4">
            {/* WhatsApp link */}
            <Button
              appearance="primary"
              as="a"
              href="https://wa.me/5500000000000"
              target="_blank"
              rel="noopener noreferrer"
            >
              {t('support.whatsapp')}
            </Button>

            {/* Video embed placeholder */}
            <Box>
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
                height="180px"
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
                  <Text>{item.answer}</Text>
                </Box>
              ))}
            </Box>
          </Box>
        </Sidebar.Body>
      </Sidebar>
    </>
  );
}
