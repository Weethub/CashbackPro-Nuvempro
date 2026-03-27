import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Box, Card, Button, Text, Title, Tag, Badge, Alert, Table, Spinner } from '@nimbus-ds/components';
import { useNexo } from '../providers/NexoProvider.jsx';
import api from '../services/api.js';

const INTERVALS = ['monthly', 'semiannual', 'annual'];
const PLAN_KEYS = ['starter', 'growth', 'scale'];

function getPriceKey(interval) {
  if (interval === 'semiannual') return 'priceSemiannual';
  if (interval === 'annual') return 'priceAnnual';
  return 'priceMonthly';
}

function StatusBadge({ status, t }) {
  const map = {
    active: { appearance: 'success', label: t('billing.status.active') },
    canceled: { appearance: 'danger', label: t('billing.status.canceled') },
    past_due: { appearance: 'warning', label: t('billing.status.pastDue') },
    trialing: { appearance: 'primary', label: t('billing.status.trialing') },
  };
  const cfg = map[status] || map.active;
  return <Badge appearance={cfg.appearance}>{cfg.label}</Badge>;
}

export default function BillingPage({ locked = false }) {
  const { t } = useTranslation();
  const { billingStatus, setBillingStatus } = useNexo();
  const [interval, setInterval_] = useState('monthly');
  const [invoices, setInvoices] = useState([]);
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!locked) {
      loadInvoices();
    }
  }, [locked]);

  const loadInvoices = async () => {
    setLoadingInvoices(true);
    try {
      const res = await api.get('/api/billing/invoices');
      setInvoices(res.data?.invoices || []);
    } catch {
      // Invoices are optional
    } finally {
      setLoadingInvoices(false);
    }
  };

  const handleCheckout = async (planKey) => {
    setCheckoutLoading(planKey);
    setError(null);
    try {
      const res = await api.post('/api/billing/checkout', {
        plan: planKey,
        interval,
      });
      if (res.data?.url) {
        window.top.location.href = res.data.url;
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setCheckoutLoading(null);
    }
  };

  const handlePortal = async () => {
    setPortalLoading(true);
    setError(null);
    try {
      const res = await api.post('/api/billing/portal');
      if (res.data?.url) {
        window.top.location.href = res.data.url;
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setPortalLoading(false);
    }
  };

  return (
    <Box display="flex" flexDirection="column" gap="4" padding={locked ? '4' : '0'}>
      <Title as="h2">{t('billing.title')}</Title>

      {locked && (
        <Alert appearance="warning">
          <Text>{t('billing.locked')}</Text>
        </Alert>
      )}

      {/* Current status card (when not locked) */}
      {!locked && billingStatus && billingStatus.plan && (
        <Card>
          <Card.Body>
            <Box display="flex" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap="2">
              <Box display="flex" flexDirection="column" gap="1">
                <Text fontWeight="bold">{t('billing.status.currentPlan')}</Text>
                <Box display="flex" gap="2" alignItems="center">
                  <Title as="h3">{billingStatus.plan}</Title>
                  <StatusBadge status={billingStatus.status} t={t} />
                </Box>
              </Box>
              {billingStatus.renewalDate && (
                <Box display="flex" flexDirection="column" gap="1">
                  <Text fontWeight="bold">{t('billing.status.renewalDate')}</Text>
                  <Text>{billingStatus.renewalDate}</Text>
                </Box>
              )}
              <Button
                appearance="transparent"
                onClick={handlePortal}
                disabled={portalLoading}
              >
                {portalLoading ? t('common.loading') : t('billing.portal')}
              </Button>
            </Box>
          </Card.Body>
        </Card>
      )}

      {/* Interval toggle */}
      <Box display="flex" gap="2" justifyContent="center">
        {INTERVALS.map((intv) => (
          <Button
            key={intv}
            appearance={interval === intv ? 'primary' : 'transparent'}
            onClick={() => setInterval_(intv)}
          >
            {t(`billing.interval.${intv}`)}
          </Button>
        ))}
      </Box>

      {/* Plan cards */}
      <Box display="flex" gap="4" flexWrap="wrap" justifyContent="center">
        {PLAN_KEYS.map((planKey) => {
          const plan = t(`billing.plans.${planKey}`, { returnObjects: true });
          const features = plan.features || [];
          const price = planKey === 'starter'
            ? plan.price
            : plan[getPriceKey(interval)] || plan.priceMonthly;
          const isCurrent = billingStatus?.plan?.toLowerCase() === planKey;

          return (
            <Box key={planKey} width="280px">
              <Card>
                <Card.Header>
                  <Box display="flex" justifyContent="space-between" alignItems="center">
                    <Title as="h3">{plan.name}</Title>
                    {isCurrent && <Tag appearance="primary">Atual</Tag>}
                  </Box>
                </Card.Header>
                <Card.Body>
                  <Box display="flex" flexDirection="column" gap="3">
                    <Title as="h2">{price}</Title>

                    <Box display="flex" flexDirection="column" gap="1">
                      {features.map((feat, idx) => (
                        <Text key={idx}>{feat}</Text>
                      ))}
                    </Box>

                    {planKey !== 'starter' && !isCurrent && (
                      <Button
                        appearance="primary"
                        onClick={() => handleCheckout(planKey)}
                        disabled={checkoutLoading === planKey}
                      >
                        {checkoutLoading === planKey
                          ? t('common.loading')
                          : t('billing.checkout')}
                      </Button>
                    )}

                    {isCurrent && planKey !== 'starter' && (
                      <Button
                        appearance="transparent"
                        onClick={handlePortal}
                        disabled={portalLoading}
                      >
                        {t('billing.portal')}
                      </Button>
                    )}
                  </Box>
                </Card.Body>
              </Card>
            </Box>
          );
        })}
      </Box>

      {error && (
        <Alert appearance="danger">
          <Text>{error}</Text>
        </Alert>
      )}

      {/* Invoices table (when not locked) */}
      {!locked && (
        <Card>
          <Card.Header>
            <Title as="h3">{t('billing.invoices.title')}</Title>
          </Card.Header>
          <Card.Body>
            {loadingInvoices ? (
              <Box display="flex" justifyContent="center" padding="4">
                <Spinner />
              </Box>
            ) : invoices.length === 0 ? (
              <Text color="neutral-textLow">{t('billing.invoices.noInvoices')}</Text>
            ) : (
              <Table>
                <Table.Head>
                  <Table.Row>
                    <Table.Cell as="th">{t('billing.invoices.date')}</Table.Cell>
                    <Table.Cell as="th">{t('billing.invoices.amount')}</Table.Cell>
                    <Table.Cell as="th">{t('billing.invoices.status')}</Table.Cell>
                  </Table.Row>
                </Table.Head>
                <Table.Body>
                  {invoices.map((inv, idx) => (
                    <Table.Row key={idx}>
                      <Table.Cell>{inv.date}</Table.Cell>
                      <Table.Cell>{inv.amount}</Table.Cell>
                      <Table.Cell>
                        <Badge appearance={inv.status === 'paid' ? 'success' : 'warning'}>
                          {inv.status === 'paid'
                            ? t('billing.invoices.paid')
                            : t('billing.invoices.pending')}
                        </Badge>
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table>
            )}
          </Card.Body>
        </Card>
      )}
    </Box>
  );
}
