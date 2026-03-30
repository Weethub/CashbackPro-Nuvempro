import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Box, Card, Button, Text, Title, Tag, Badge, Alert, Table, Spinner } from '@nimbus-ds/components';
import { useNexo } from '../providers/NexoProvider.jsx';
import api from '../services/api.js';

const INTERVAL_ORDER = ['monthly', 'semestral', 'annual'];

function formatCurrency(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value ?? 0);
}

function formatDate(isoString) {
  if (!isoString) return null;
  return new Date(isoString).toLocaleDateString('pt-BR');
}

function SubStatusBadge({ status, cancelAtPeriodEnd, t }) {
  if (cancelAtPeriodEnd) {
    return <Badge appearance="warning">{t('billing.cancelScheduled')}</Badge>;
  }
  const map = {
    active:   { appearance: 'success', key: 'billing.status.active' },
    canceled: { appearance: 'danger',  key: 'billing.status.canceled' },
    past_due: { appearance: 'warning', key: 'billing.status.pastDue' },
    trialing: { appearance: 'primary', key: 'billing.status.trialing' },
  };
  const cfg = map[status] || map.active;
  return <Badge appearance={cfg.appearance}>{t(cfg.key)}</Badge>;
}

export default function BillingPage({ locked = false }) {
  const { t } = useTranslation();
  const { billingStatus, setBillingStatus } = useNexo();

  const [interval, setInterval_] = useState('monthly');
  const [plans, setPlans] = useState([]);
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [invoices, setInvoices] = useState([]);
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(null);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  // Derived from billingStatus (shape: { plan, trialEndsAt, subscription: { status, currentPeriodEnd, cancelAtPeriodEnd, ... } })
  const currentPlan      = billingStatus?.plan;
  const subscription     = billingStatus?.subscription;
  const subStatus        = subscription?.status || 'none';
  const cancelAtEnd      = subscription?.cancelAtPeriodEnd || false;
  const renewalDate      = formatDate(subscription?.currentPeriodEnd);
  const hasActiveSub     = subStatus === 'active' || subStatus === 'trialing';
  const isPaidPlan       = currentPlan && currentPlan !== 'starter';

  // Only show interval tabs for intervals configured in at least one plan
  const availableIntervals = useMemo(() => {
    const all = new Set();
    plans.forEach((p) => (p.intervals || []).forEach((i) => all.add(i)));
    return INTERVAL_ORDER.filter((i) => all.has(i));
  }, [plans]);

  // Auto-select first available interval when plans load
  useEffect(() => {
    if (availableIntervals.length > 0 && !availableIntervals.includes(interval)) {
      setInterval_(availableIntervals[0]);
    }
  }, [availableIntervals]);

  useEffect(() => {
    loadPlans();
    if (!locked) {
      loadInvoices();
      syncPlan();
    }
  }, [locked]);

  const syncPlan = async () => {
    try {
      const res = await api.post('/api/billing/sync');
      if (res.data?.synced && res.data?.plan) {
        setSuccessMsg(t('billing.syncSuccess', { plan: res.data.plan }));
        if (setBillingStatus) {
          setBillingStatus((prev) => ({ ...prev, plan: res.data.plan }));
        }
      }
    } catch {
      // Silencioso — sync é apenas fallback
    }
  };

  const loadPlans = async () => {
    setLoadingPlans(true);
    try {
      const res = await api.get('/api/billing/plans');
      setPlans(res.data?.plans || []);
    } catch {
      // silent
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
      // silent
    } finally {
      setLoadingInvoices(false);
    }
  };

  const handleCheckout = async (planKey) => {
    setCheckoutLoading(planKey);
    setError(null);
    try {
      const res = await api.post('/api/billing/checkout', { planKey, billingInterval: interval });
      if (res.data?.url) {
        window.top.location.href = res.data.url;
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setCheckoutLoading(null);
    }
  };

  const handleCancel = async () => {
    setCancelLoading(true);
    setError(null);
    try {
      await api.post('/api/billing/cancel');
      setShowCancelModal(false);
      setSuccessMsg(t('billing.cancelSuccess'));
      if (setBillingStatus) {
        setBillingStatus((prev) => ({
          ...prev,
          subscription: { ...prev?.subscription, cancelAtPeriodEnd: true },
        }));
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message);
      setShowCancelModal(false);
    } finally {
      setCancelLoading(false);
    }
  };

  return (
    <Box display="flex" flexDirection="column" gap="4" padding={locked ? '4' : '0'}>
      <Title as="h2">{t('billing.title')}</Title>

      {successMsg && (
        <Alert appearance="success" onRemove={() => setSuccessMsg(null)}>
          <Text>{successMsg}</Text>
        </Alert>
      )}

      {locked && (
        <Alert appearance="warning">
          <Text>{t('billing.locked')}</Text>
        </Alert>
      )}

      {error && (
        <Alert appearance="danger" onRemove={() => setError(null)}>
          <Text>{error}</Text>
        </Alert>
      )}

      {/* Plano atual — exibido quando há assinatura ativa */}
      {!locked && isPaidPlan && (
        <Card>
          <Card.Body>
            <Box display="flex" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap="3">
              <Box display="flex" flexDirection="column" gap="1">
                <Text fontWeight="bold" fontSize="caption" color="neutral-textLow">
                  {t('billing.status.currentPlan')}
                </Text>
                <Box display="flex" gap="2" alignItems="center">
                  <Title as="h3">
                    {currentPlan.charAt(0).toUpperCase() + currentPlan.slice(1)}
                  </Title>
                  <SubStatusBadge status={subStatus} cancelAtPeriodEnd={cancelAtEnd} t={t} />
                </Box>
              </Box>

              {renewalDate && (
                <Box display="flex" flexDirection="column" gap="1">
                  <Text fontWeight="bold" fontSize="caption" color="neutral-textLow">
                    {cancelAtEnd ? t('billing.subscribedUntil') : t('billing.status.renewalDate')}
                  </Text>
                  <Text>{renewalDate}</Text>
                </Box>
              )}
            </Box>
          </Card.Body>
        </Card>
      )}

      {/* Seletor de intervalo */}
      {availableIntervals.length > 1 && (
        <Box display="flex" gap="2" justifyContent="center">
          {availableIntervals.map((intv) => (
            <Button
              key={intv}
              appearance={interval === intv ? 'primary' : 'transparent'}
              onClick={() => setInterval_(intv)}
            >
              {t(`billing.interval.${intv}`)}
            </Button>
          ))}
        </Box>
      )}

      {/* Cards dos planos */}
      {loadingPlans ? (
        <Box display="flex" justifyContent="center" padding="6">
          <Spinner />
        </Box>
      ) : (
        <Box display="flex" gap="4" flexWrap="wrap" justifyContent="center">
          {plans.map((plan) => {
            const priceValue      = (plan.price || {})[interval] ?? (plan.price || {}).monthly ?? 0;
            const intervalAvail   = plan.isFree || (plan.intervals || []).includes(interval);
            const isCurrent       = currentPlan?.toLowerCase() === plan.key.toLowerCase();
            const planName        = plan.key.charAt(0).toUpperCase() + plan.key.slice(1);
            const isSubscribable  = !plan.isFree && intervalAvail && plan.configured;

            return (
              <Box key={plan.key} width="280px">
                <Card>
                  <Card.Header>
                    <Box display="flex" justifyContent="space-between" alignItems="center">
                      <Title as="h3">{planName}</Title>
                      {isCurrent && (
                        <Tag appearance="primary">{t('billing.status.currentPlan')}</Tag>
                      )}
                    </Box>
                  </Card.Header>
                  <Card.Body>
                    <Box display="flex" flexDirection="column" gap="3">
                      {/* Preço */}
                      <Box display="flex" alignItems="baseline" gap="1">
                        {plan.isFree ? (
                          <Title as="h2">{t('billing.free')}</Title>
                        ) : intervalAvail && priceValue > 0 ? (
                          <>
                            <Title as="h2">{formatCurrency(priceValue)}</Title>
                            <Text fontSize="caption" color="neutral-textLow">
                              {t('billing.perMonth')}
                            </Text>
                          </>
                        ) : (
                          <Text color="neutral-textLow">{t('billing.notAvailableInterval')}</Text>
                        )}
                      </Box>

                      {/* Features */}
                      {plan.features.length > 0 && (
                        <Box display="flex" flexDirection="column" gap="1">
                          {plan.features.map((feat, idx) => (
                            <Text key={idx} fontSize="caption">
                              • {feat}
                            </Text>
                          ))}
                        </Box>
                      )}

                      {/* Botão de ação */}
                      {isSubscribable && !isCurrent && (
                        <Button
                          appearance="primary"
                          onClick={() => handleCheckout(plan.key)}
                          disabled={!!checkoutLoading}
                        >
                          {checkoutLoading === plan.key
                            ? t('common.loading')
                            : t('billing.checkout')}
                        </Button>
                      )}

                      {isCurrent && hasActiveSub && !cancelAtEnd && !plan.isFree && (
                        <Button
                          appearance="danger"
                          onClick={() => setShowCancelModal(true)}
                        >
                          {t('billing.cancelPlan')}
                        </Button>
                      )}

                      {isCurrent && cancelAtEnd && (
                        <Box display="flex" justifyContent="center">
                          <Tag appearance="warning">{t('billing.cancelScheduled')}</Tag>
                        </Box>
                      )}
                    </Box>
                  </Card.Body>
                </Card>
              </Box>
            );
          })}
        </Box>
      )}

      {/* Faturas */}
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
                    <Table.Cell as="th">{t('billing.invoices.receipt')}</Table.Cell>
                  </Table.Row>
                </Table.Head>
                <Table.Body>
                  {invoices.map((inv) => (
                    <Table.Row key={inv.id || inv.stripeInvoiceId}>
                      <Table.Cell>{formatDate(inv.createdAt)}</Table.Cell>
                      <Table.Cell>{formatCurrency(inv.amountPaid)}</Table.Cell>
                      <Table.Cell>
                        <Badge appearance={inv.status === 'paid' ? 'success' : 'warning'}>
                          {inv.status === 'paid'
                            ? t('billing.invoices.paid')
                            : t('billing.invoices.pending')}
                        </Badge>
                      </Table.Cell>
                      <Table.Cell>
                        {(inv.invoiceUrl || inv.invoicePdf) ? (
                          <a
                            href={inv.invoiceUrl || inv.invoicePdf}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <Button appearance="transparent" size="small">
                              {t('billing.invoices.view')}
                            </Button>
                          </a>
                        ) : (
                          <Text fontSize="caption" color="neutral-textLow">—</Text>
                        )}
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table>
            )}
          </Card.Body>
        </Card>
      )}

      {/* Modal de confirmação de cancelamento */}
      {showCancelModal && (
        <div
          style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
        >
          <div style={{ maxWidth: '420px', width: '100%' }}>
            <Card>
              <Card.Header>
                <Title as="h3">{t('billing.cancelModal.title')}</Title>
              </Card.Header>
              <Card.Body>
                <Box display="flex" flexDirection="column" gap="4">
                  <Text>{t('billing.cancelModal.body')}</Text>
                  <Box display="flex" gap="2" justifyContent="flex-end">
                    <Button
                      appearance="transparent"
                      onClick={() => setShowCancelModal(false)}
                      disabled={cancelLoading}
                    >
                      {t('common.cancel')}
                    </Button>
                    <Button
                      appearance="danger"
                      onClick={handleCancel}
                      disabled={cancelLoading}
                    >
                      {cancelLoading ? t('common.loading') : t('billing.cancelModal.confirm')}
                    </Button>
                  </Box>
                </Box>
              </Card.Body>
            </Card>
          </div>
        </div>
      )}
    </Box>
  );
}
