import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Box, Card, Text, Title } from '@nimbus-ds/components';
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { useNexo } from '../providers/NexoProvider.jsx';
import api from '../services/api.js';

const CHART_ACCENT = '#2985E0';
const CHART_ACCENT_LIGHT = '#9DC7F0';
const GRAY = '#B7BDBA';
const FALLBACK_TIER_COLORS = [CHART_ACCENT, '#5EA8ED', CHART_ACCENT_LIGHT, '#1C6BB8', '#C7E0F8'];

function StatCard({ label, value }) {
  return (
    <Card>
      <Card.Body padding="small">
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

function formatDay(isoDate) {
  const [, month, day] = isoDate.split('-');
  return `${day}/${month}`;
}

export default function Dashboard() {
  const { t } = useTranslation();
  const { store } = useNexo();
  const [stats, setStats] = useState(null);
  const [series, setSeries] = useState([]);
  const [distribution, setDistribution] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/api/cashback/stats'),
      api.get('/api/cashback/stats/timeseries?days=30'),
      api.get('/api/cashback/stats/tier-distribution'),
    ])
      .then(([statsRes, seriesRes, distRes]) => {
        setStats(statsRes.data.stats);
        setSeries(seriesRes.data.series || []);
        setDistribution(distRes.data);
      })
      .catch(() => {
        setStats(null);
        setSeries([]);
        setDistribution(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const chartData = series.map((point) => ({ ...point, label: formatDay(point.date) }));

  const pieData = distribution
    ? [
        ...distribution.tiers.map((tier, i) => ({
          name: tier.name,
          value: tier.count,
          color: tier.color || FALLBACK_TIER_COLORS[i % FALLBACK_TIER_COLORS.length],
        })),
        ...(distribution.noTier > 0
          ? [{ name: t('dashboard.charts.noTier'), value: distribution.noTier, color: GRAY }]
          : []),
      ].filter((d) => d.value > 0)
    : [];

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
        gridTemplateColumns="repeat(auto-fit, minmax(120px, 1fr))"
        gap="2"
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

      <Box display="grid" gridTemplateColumns="minmax(0, 2fr) minmax(0, 1fr)" gap="4">
        <Card>
          <Card.Header>
            <Title as="h3">{t('dashboard.charts.activityTitle')}</Title>
          </Card.Header>
          <Card.Body>
            {loading ? (
              <Text color="neutral-textDisabled">{t('common.loading')}</Text>
            ) : chartData.length === 0 ? (
              <Text color="neutral-textLow">{t('dashboard.charts.empty')}</Text>
            ) : (
              <Box width="100%" height="260px">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#EDEEED" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#5C6D67' }} axisLine={false} tickLine={false} />
                    <YAxis
                      yAxisId="points"
                      tick={{ fontSize: 11, fill: '#5C6D67' }}
                      axisLine={false}
                      tickLine={false}
                      width={40}
                    />
                    <YAxis
                      yAxisId="redemptions"
                      orientation="right"
                      allowDecimals={false}
                      tick={{ fontSize: 11, fill: '#5C6D67' }}
                      axisLine={false}
                      tickLine={false}
                      width={30}
                    />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar
                      yAxisId="points"
                      dataKey="pointsIssued"
                      name={t('dashboard.charts.pointsIssued')}
                      fill={CHART_ACCENT_LIGHT}
                      radius={[3, 3, 0, 0]}
                    />
                    <Line
                      yAxisId="redemptions"
                      dataKey="redemptions"
                      name={t('dashboard.charts.redemptions')}
                      stroke={CHART_ACCENT}
                      strokeWidth={2.5}
                      dot={false}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </Box>
            )}
          </Card.Body>
        </Card>

        <Card>
          <Card.Header>
            <Title as="h3">{t('dashboard.charts.distributionTitle')}</Title>
          </Card.Header>
          <Card.Body>
            {loading ? (
              <Text color="neutral-textDisabled">{t('common.loading')}</Text>
            ) : pieData.length === 0 ? (
              <Text color="neutral-textLow">{t('dashboard.charts.empty')}</Text>
            ) : (
              <Box width="100%" height="260px">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={2}
                    >
                      {pieData.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </Box>
            )}
          </Card.Body>
        </Card>
      </Box>
    </Box>
  );
}
