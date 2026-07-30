import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Box, Card, Text, Title } from '@nimbus-ds/components';
import { useNexo } from '../providers/NexoProvider.jsx';
import api from '../services/api.js';

function StatCard({ label, value }) {
  return (
    <Card>
      <Card.Body>
        <Box display="flex" flexDirection="column" gap="1">
          <Text fontSize="caption" color="neutral-textLow">
            {label}
          </Text>
          <Text fontSize="highlight" fontWeight="bold" color="primary-textLow">
            {value}
          </Text>
        </Box>
      </Card.Body>
    </Card>
  );
}

export default function Dashboard() {
  const { t } = useTranslation();
  const { store } = useNexo();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get('/api/cashback/stats')
      .then((res) => setStats(res.data.stats))
      .catch(() => setStats(null))
      .finally(() => setLoading(false));
  }, []);

  return (
    <Box display="flex" flexDirection="column" gap="4">
      <Title as="h2">{t('dashboard.title')}</Title>

      <Card>
        <Card.Body>
          <Box display="flex" flexDirection="column" gap="2">
            <Text fontSize="highlight">{t('dashboard.welcome')}</Text>
            {store && (
              <Text color="neutral-textLow">
                {store.name || 'Store'} (ID: {store.id || store.storeId || '---'})
              </Text>
            )}
          </Box>
        </Card.Body>
      </Card>

      <Box
        display="grid"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}
        gap="4"
      >
        <StatCard
          label={t('dashboard.stats.pointsIssued')}
          value={loading ? '—' : stats?.pointsIssued ?? 0}
        />
        <StatCard
          label={t('dashboard.stats.couponsGenerated')}
          value={loading ? '—' : stats?.couponsGenerated ?? 0}
        />
        <StatCard
          label={t('dashboard.stats.redemptionRate')}
          value={loading ? '—' : `${stats?.redemptionRate ?? 0}%`}
        />
        <StatCard
          label={t('dashboard.stats.activeCustomers')}
          value={loading ? '—' : stats?.activeCustomers ?? 0}
        />
      </Box>
    </Box>
  );
}
