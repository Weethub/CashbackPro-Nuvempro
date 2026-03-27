import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Box, Text, Spinner, Alert } from '@nimbus-ds/components';
import api, { setSessionToken } from '../services/api.js';

export default function InstallSuccess() {
  const { t } = useTranslation();
  const [error, setError] = useState(null);

  useEffect(() => {
    async function verifyAndRedirect() {
      try {
        const params = new URLSearchParams(window.location.search);
        const sessionToken = params.get('session_token');

        if (!sessionToken) {
          setError('No session token found');
          return;
        }

        const res = await api.post('/auth/verify-token', { token: sessionToken });

        if (res.data?.token) {
          setSessionToken(res.data.token);
        }

        // Clean URL and redirect to root
        window.location.href = '/';
      } catch (err) {
        console.error('Token verification failed:', err);
        setError(err.response?.data?.error || err.message || 'Verification failed');
      }
    }

    verifyAndRedirect();
  }, []);

  if (error) {
    return (
      <Box
        display="flex"
        alignItems="center"
        justifyContent="center"
        height="100vh"
        padding="4"
      >
        <Alert appearance="danger">
          <Text>{t('app.error')}: {error}</Text>
        </Alert>
      </Box>
    );
  }

  return (
    <Box
      display="flex"
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      height="100vh"
      gap="4"
    >
      <Spinner size="large" />
      <Text>{t('app.loading')}</Text>
    </Box>
  );
}
