import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Box, Button, Text, Title, Sidebar } from '@nimbus-ds/components';
import LanguageSwitcher from './LanguageSwitcher.jsx';
import api from '../services/api.js';

function getYouTubeId(url) {
  if (!url) return null;
  const patterns = [
    /youtube\.com\/watch\?v=([^&]+)/,
    /youtu\.be\/([^?]+)/,
    /youtube\.com\/embed\/([^?]+)/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

export default function AppNav() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [supportOpen, setSupportOpen] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [supportData, setSupportData] = useState(null);

  useEffect(() => {
    if (supportOpen && !supportData) {
      api.get('/api/support')
        .then((res) => setSupportData(res.data))
        .catch(() => setSupportData({ faqs: [], mainVideoUrl: '', whatsapp: '' }));
    }
  }, [supportOpen]);

  const isActive = (path) =>
    path === '/'
      ? location.pathname === '/'
      : location.pathname.startsWith(path);

  const faqs = supportData?.faqs || [];
  const mainVideoUrl = supportData?.mainVideoUrl || '';
  const whatsapp = supportData?.whatsapp || t('support.whatsappNumber', { defaultValue: '' });
  const youtubeId = getYouTubeId(mainVideoUrl);

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
          {/* Adicione aqui os itens de nav específicos do seu app */}
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

          {/* WhatsApp */}
          {whatsapp && (
            <Box display="flex" flexDirection="column" gap="2">
              <Button
                appearance="primary"
                as="a"
                href={`https://wa.me/${whatsapp}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t('support.whatsapp')}
              </Button>
            </Box>
          )}

          {/* Vídeo principal */}
          <Box display="flex" flexDirection="column" gap="2">
            <Title as="h4">{t('support.videoTitle')}</Title>
            {youtubeId ? (
              <Box borderRadius="2" style={{ overflow: 'hidden', position: 'relative', paddingBottom: '56.25%', height: 0 }}>
                <iframe
                  src={`https://www.youtube.com/embed/${youtubeId}`}
                  title="Tutorial"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 'none' }}
                />
              </Box>
            ) : mainVideoUrl ? (
              <Button
                appearance="neutral"
                as="a"
                href={mainVideoUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t('support.videoTitle')}
              </Button>
            ) : (
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
                <Text color="neutral-textDisabled">{t('support.videoPlaceholder', { defaultValue: 'Nenhum vídeo configurado' })}</Text>
              </Box>
            )}
          </Box>

          {/* FAQ accordion */}
          {faqs.length > 0 && (
            <Box display="flex" flexDirection="column" gap="2">
              <Title as="h4">{t('support.faqTitle', { defaultValue: 'Dúvidas frequentes' })}</Title>
              <Box display="flex" flexDirection="column" gap="1">
                {faqs.map((item) => {
                  const isOpen = expandedId === item.id;
                  return (
                    <Box
                      key={item.id}
                      borderColor="neutral-surfaceHighlight"
                      borderStyle="solid"
                      borderWidth="1"
                      borderRadius="2"
                      backgroundColor="neutral-background"
                    >
                      <Box
                        display="flex"
                        justifyContent="space-between"
                        alignItems="center"
                        padding="3"
                        style={{ cursor: 'pointer' }}
                        onClick={() => setExpandedId(isOpen ? null : item.id)}
                      >
                        <Text fontWeight="bold" fontSize="caption" color="primary-interactive">
                          {item.question}
                        </Text>
                        <Text color="neutral-textLow" fontSize="caption">
                          {isOpen ? '∧' : '∨'}
                        </Text>
                      </Box>
                      {isOpen && (
                        <Box paddingX="3" paddingBottom="3">
                          <Text fontSize="caption" color="neutral-textLow">
                            {item.answer}
                          </Text>
                          {item.videoUrl && (
                            <Box paddingTop="2">
                              <Button
                                appearance="neutral"
                                as="a"
                                href={item.videoUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                Ver vídeo
                              </Button>
                            </Box>
                          )}
                        </Box>
                      )}
                    </Box>
                  );
                })}
              </Box>
            </Box>
          )}

          {/* Loading state */}
          {supportOpen && !supportData && (
            <Box display="flex" justifyContent="center" padding="4">
              <Text color="neutral-textDisabled">{t('common.loading', { defaultValue: 'Carregando...' })}</Text>
            </Box>
          )}
        </Box>
      </Sidebar>
    </>
  );
}
