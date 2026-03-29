import React, { useState, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Box, Card, Button, Text, Title, Alert } from '@nimbus-ds/components';
import api from '../services/api.js';

export default function TermsPage({ onAccepted, viewOnly = false }) {
  const { t } = useTranslation();
  const [scrolledToBottom, setScrolledToBottom] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const scrollRef = useRef(null);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const threshold = 20;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= threshold;
    if (atBottom) {
      setScrolledToBottom(true);
    }
  }, []);

  const handleAccept = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await api.post('/api/terms/accept');
      if (onAccepted) onAccepted();
    } catch (err) {
      setError(t('terms.error'));
    } finally {
      setSubmitting(false);
    }
  };

  const sections = ['s1', 's2', 's3', 's4', 's5', 's6'];

  return (
    <Box
      display="flex"
      alignItems="center"
      justifyContent="center"
      minHeight="100vh"
      padding="4"
    >
      <Box maxWidth="640px" width="100%">
        <Card>
          <Card.Header>
            <Title as="h2">{t('terms.title')}</Title>
          </Card.Header>
          <Card.Body>
            <Box display="flex" flexDirection="column" gap="4">
              {!scrolledToBottom && (
                <Alert appearance="primary">
                  <Text>{t('terms.scrollHint')}</Text>
                </Alert>
              )}

              <Box
                ref={scrollRef}
                onScroll={handleScroll}
                overflow="auto"
                maxHeight="400px"
                padding="4"
                borderColor="neutral-surfaceHighlight"
                borderStyle="solid"
                borderWidth="1"
                borderRadius="2"
              >
                {sections.map((key) => (
                  <Box key={key} marginBottom="4">
                    <Title as="h4">{t(`terms.sections.${key}.title`)}</Title>
                    <Text>{t(`terms.sections.${key}.body`)}</Text>
                  </Box>
                ))}
              </Box>

              {!viewOnly && error && (
                <Alert appearance="danger">
                  <Text>{error}</Text>
                </Alert>
              )}

              {!viewOnly && (
                <Button
                  appearance="primary"
                  onClick={handleAccept}
                  disabled={!scrolledToBottom || submitting}
                >
                  {submitting ? t('common.loading') : t('terms.accept')}
                </Button>
              )}
            </Box>
          </Card.Body>
        </Card>
      </Box>
    </Box>
  );
}
