import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Box, Card, Button, Text, Title, Tag, Badge, Alert, Table, Spinner } from '@nimbus-ds/components';
import { useNexo } from '../providers/NexoProvider.jsx';
import api from '../services/api.js';

const INTERVALS = ['monthly', 'semestral', 'annual'];

function formatPrice(value, t) {
  if (value == null || value === 0) return t('billing.free');
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
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
  const { billingStatus } = useNexo();
  const [interval, setInterval_] = useState('monthly');
  const [plans, setPlans] = useState([]);
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [invoices, setInvoices] = useState([]);
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadPlans();
    if (!locked) loadInvoices();
  }, [locked]);

  const loadPlans = async () => {
    setLoadingPlans(true);
    try {
      const res = await api.get('/api/billing/plans');
      setPlans(res.data?.plans || []);
    } catch {
      // Silent — plans are not critical
    } finally {
      setLoadingPlans(false);
    }
  };

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
        planKey,
        billingInterval: interval,
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
      {loadingPlans ? (
        <Box display="flex" justifyContent="center" padding="4">
          <Spinner />
        </Box>
      ) : (
        <Box display="flex" gap="4" flexWrap="wrap" justifyContent="center">
          {plans.map((plan) => {
            const features = Array.isArray(plan.features)
              ? plan.features
              : Object.values(plan.features || {});
            const prices = plan.price || {};
            const priceValue = prices[interval] ?? prices.monthly ?? 0;
            const priceDisplay = formatPrice(priceValue, t);
            const isCurrent = billingStatus?.plan?.toLowerCase() === plan.key.toLowerCase();
            const isFreeplan = plan.isFree || !priceValue || priceValue === 0;
            const planName = plan.key.charAt(0).toUpperCase() + plan.key.slice(1);

            return (
              <Box key={plan.key} width="280px">
                <Card>
                  <Card.Header>
                    <Box display="flex" justifyContent="space-between" alignItems="center">
                      <Title as="h3">{planName}</Title>
                      {isCurrent && <Tag appearance="primary">{t('billing.status.currentPlan')}</Tag>}
                    </Box>
                  </Card.Header>
                  <Card.Body>
                    <Box display="flex" flexDirection="column" gap="3">
                      <Title as="h2">{priceDisplay}</Title>

                      <Box display="flex" flexDirection="column" gap="1">
                        {features.map((feat, idx) => (
                          <Text key={idx}>{feat}</Text>
                        ))}
                      </Box>

                      {!isFreeplan && !isCurrent && (
                        <Button
                          appearance="primary"
                          onClick={() => handleCheckout(plan.key)}
                          disabled={checkoutLoading === plan.key}
                        >
                          {checkoutLoading === plan.key ? t('common.loading') : t('billing.checkout')}
                        </Button>
                      )}

                      {isCurrent && !isFreeplan && (
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
      )}

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
