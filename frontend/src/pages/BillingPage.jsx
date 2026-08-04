import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Box, Card, Button, Text, Title, Tag, Alert, Table, Spinner } from '@nimbus-ds/components';
import { CheckIcon } from '@nimbus-ds/icons';
import { useNexo } from '../providers/NexoProvider.jsx';
import api from '../services/api.js';

// Plano "recomendado" — recebe a faixa de destaque no meio dos 3 cards.
const RECOMMENDED_PLAN_KEY = 'growth';

function formatPrice(value, t) {
  if (value == null || value === 0) return t('billing.free');
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

const STATUS_DOT_TOKEN = {
  active: 'success-textLow',
  canceled: 'danger-textLow',
  past_due: 'warning-textLow',
  trialing: 'primary-textLow',
};

function StatusDot({ status }) {
  return (
    <Box
      as="span"
      display="inline-flex"
      width="8px"
      height="8px"
      borderRadius="50%"
      backgroundColor={STATUS_DOT_TOKEN[status] || STATUS_DOT_TOKEN.active}
    />
  );
}

export default function BillingPage({ locked = false }) {
  const { t } = useTranslation();
  const { billingStatus, setBillingStatus, refreshStatus } = useNexo();

  // billingStatus.subscription contains the real status from /api/billing/status
  const sub = billingStatus?.subscription;
  const subStatus = sub?.cancelAtPeriodEnd ? 'canceled' : (sub?.status || billingStatus?.status || 'active');
  const renewalDate = sub?.currentPeriodEnd
    ? new Date(sub.currentPeriodEnd).toLocaleDateString()
    : billingStatus?.renewalDate;

  const [interval, setInterval_] = useState('monthly');
  const [plans, setPlans] = useState([]);
  const [trialMode, setTrialMode] = useState('none');
  const [trialDays, setTrialDays] = useState(0);
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [invoices, setInvoices] = useState([]);
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(null);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [verifyingAccess, setVerifyingAccess] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  // Partner state
  const [partner, setPartner] = useState(null); // { partnerId, partnerName } | null
  const [partnerInput, setPartnerInput] = useState('');
  const [partnerEditing, setPartnerEditing] = useState(false);
  const [partnerLoading, setPartnerLoading] = useState(false);
  const [partnerError, setPartnerError] = useState(null);

  useEffect(() => {
    loadPlans();
    if (locked) {
      // Tenta sincronizar automaticamente ao montar — pode já ter assinado no Stripe
      // e o webhook ainda não ter chegado
      syncAndRefresh();
    } else {
      loadInvoices();
      loadPartner();
      syncPlan(); // Sempre sincroniza ao carregar — garante plano atualizado mesmo sem webhook
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
      // Silencioso
    }
  };

  // Usado no modo locked: sincroniza com Stripe e recarrega billingStatus completo.
  // Se o usuário já assinou, hasAccess passará a true e o gate será liberado automaticamente.
  const syncAndRefresh = async () => {
    setVerifyingAccess(true);
    try {
      await api.post('/api/billing/sync');
      if (refreshStatus) await refreshStatus();
    } catch {
      // Silencioso — se falhar, o usuário pode tentar manualmente
    } finally {
      setVerifyingAccess(false);
    }
  };

  const loadPlans = async () => {
    setLoadingPlans(true);
    try {
      const res = await api.get('/api/billing/plans');
      setPlans(res.data?.plans || []);
      setTrialMode(res.data?.trialMode || 'none');
      setTrialDays(res.data?.trialDays || 0);
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

  const handleCancel = async () => {
    setCancelLoading(true);
    setError(null);
    try {
      await api.post('/api/billing/cancel');
      setConfirmCancel(false);
      setSuccessMsg(t('billing.cancelSuccess'));
      if (setBillingStatus) {
        setBillingStatus((prev) => ({
          ...prev,
          subscription: { ...(prev?.subscription || {}), cancelAtPeriodEnd: true },
        }));
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message);
      setConfirmCancel(false);
    } finally {
      setCancelLoading(false);
    }
  };

  const loadPartner = async () => {
    try {
      const res = await api.get('/api/billing/partner');
      if (res.data?.partnerId) {
        setPartner({ partnerId: res.data.partnerId, partnerName: res.data.partnerName });
      }
    } catch {
      // Silencioso — parceiro é opcional
    }
  };

  const handlePartnerSave = async () => {
    if (!partnerInput.trim()) return;
    setPartnerLoading(true);
    setPartnerError(null);
    try {
      const res = await api.post('/api/billing/partner', { partnerId: partnerInput.trim().toUpperCase() });
      setPartner({ partnerId: res.data.partnerId, partnerName: res.data.partnerName });
      setPartnerEditing(false);
      setPartnerInput('');
      setSuccessMsg(t('billing.partner.success'));
    } catch (err) {
      const code = err.response?.data?.code;
      if (code === 'PARTNER_NOT_FOUND') setPartnerError(t('billing.partner.notFound'));
      else if (code === 'PARTNER_SUSPENDED') setPartnerError(t('billing.partner.suspended'));
      else if (code === 'PARTNERS_NOT_CONFIGURED' || code === 'PARTNERS_UNAUTHORIZED') setPartnerError(t('billing.partner.notConfigured'));
      else setPartnerError(err.response?.data?.error || err.message);
    } finally {
      setPartnerLoading(false);
    }
  };

  return (
    <Box display="flex" flexDirection="column" gap="4" padding={locked ? '4' : '0'}>
      <Title as="h2">{t('billing.title')}</Title>

      {successMsg && (
        <Alert appearance="success">
          <Text>{successMsg}</Text>
        </Alert>
      )}

      {locked && (
        <Alert appearance="warning">
          <Box display="flex" flexDirection="column" gap="2">
            <Text>{t('billing.locked')}</Text>
            <Box>
              <Button
                appearance="transparent"
                onClick={syncAndRefresh}
                disabled={verifyingAccess}
              >
                {verifyingAccess ? t('billing.verifying') : t('billing.lockedVerify')}
              </Button>
            </Box>
          </Box>
        </Alert>
      )}

      {/* Current status card (when not locked) */}
      {!locked && billingStatus && billingStatus.plan && (
        <Card>
          <Card.Body>
            <Box display="flex" flexDirection="column" gap="3">
              <Box display="flex" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap="2">
                <Box display="flex" flexDirection="column" gap="1">
                  <Text fontWeight="bold">{t('billing.status.currentPlan')}</Text>
                  <Box display="flex" gap="2" alignItems="center">
                    <Title as="h3">{billingStatus.plan}</Title>
                    <StatusDot status={subStatus} />
                  </Box>
                </Box>
                {renewalDate && (
                  <Box display="flex" flexDirection="column" gap="1" alignItems="flex-end">
                    <Text fontWeight="bold">
                      {sub?.status === 'trialing'
                        ? t('billing.status.trialEnd')
                        : t('billing.status.renewalDate')}
                    </Text>
                    <Text>{renewalDate}</Text>
                  </Box>
                )}
                {billingStatus.plan !== 'starter' && subStatus !== 'canceled' && (
                  <Box display="flex" gap="2" alignItems="center">
                    {confirmCancel ? (
                      <>
                        <Text fontSize="caption" color="neutral-textLow">{t('billing.cancelConfirm')}</Text>
                        <Button appearance="danger" onClick={handleCancel} disabled={cancelLoading}>
                          {cancelLoading ? t('common.loading') : t('billing.cancelConfirmYes')}
                        </Button>
                        <Button appearance="neutral" onClick={() => setConfirmCancel(false)} disabled={cancelLoading}>
                          {t('common.cancel')}
                        </Button>
                      </>
                    ) : (
                      <Button appearance="neutral" onClick={() => setConfirmCancel(true)}>
                        {t('billing.cancelPlan')}
                      </Button>
                    )}
                  </Box>
                )}
              </Box>

              {/* Aviso de trial ativo — só aparece quando status=trialing */}
              {sub?.status === 'trialing' && renewalDate && (
                <Alert appearance="primary">
                  <Box display="flex" flexDirection="column" gap="1">
                    <Text fontWeight="bold">{t('billing.trialActiveTitle')}</Text>
                    <Text>{t('billing.trialActiveNotice', { date: renewalDate })}</Text>
                    <Text fontSize="caption" color="neutral-textLow">
                      {t('billing.trialActiveCancelHint', { date: renewalDate })}
                    </Text>
                  </Box>
                </Alert>
              )}
            </Box>
          </Card.Body>
        </Card>
      )}

      {/* Plan cards */}
      {loadingPlans ? (
        <Box display="flex" justifyContent="center" padding="4">
          <Spinner />
        </Box>
      ) : (
        <Box display="flex" gap="4" flexWrap="wrap" alignItems="stretch">
          {plans.map((plan) => {
            const features = Array.isArray(plan.features)
              ? plan.features
              : Object.values(plan.features || {});
            const prices = plan.price || {};
            const priceValue = prices[interval] ?? prices.monthly ?? 0;
            const priceDisplay = formatPrice(priceValue, t);
            const isFreeplan = plan.isFree || !prices.monthly || prices.monthly === 0;

            // isCurrent: plano E intervalo devem bater — Scale mensal não é "atual" na aba semestral
            const isPlanMatch = billingStatus?.plan?.toLowerCase() === plan.key.toLowerCase();
            const isCurrent = isPlanMatch && sub?.billingInterval === interval;

            const planName = plan.key.charAt(0).toUpperCase() + plan.key.slice(1);
            const isRecommended = plan.key === RECOMMENDED_PLAN_KEY;

            // Box no lugar do Card: o Card do Nimbus não aceita height/flexGrow
            // (ignora silenciosamente), e sem isso os 3 cards ficam com altura
            // diferente conforme o número de features de cada plano.
            return (
              <Box
                key={plan.key}
                flex="1"
                minWidth="240px"
                display="flex"
                flexDirection="column"
                backgroundColor="neutral-background"
                borderColor={isRecommended ? 'primary-interactive' : 'neutral-surfaceHighlight'}
                borderStyle="solid"
                borderWidth={isRecommended ? '2' : '1'}
                borderRadius="3"
                overflow="hidden"
              >
                {isRecommended && (
                  <Box backgroundColor="primary-interactive" padding="3" display="flex" justifyContent="center">
                    <Text color="neutral-background" fontWeight="bold" fontSize="caption">
                      {t('billing.recommended')}
                    </Text>
                  </Box>
                )}
                <Box display="flex" flexDirection="column" flexGrow="1" padding="5" gap="4">
                  <Box display="flex" justifyContent="space-between" alignItems="center">
                    <Title as="h3">{planName}</Title>
                    {isCurrent && <Tag appearance="primary">{t('billing.status.currentPlan')}</Tag>}
                  </Box>

                  <Box display="flex" alignItems="baseline" gap="1">
                    <Title as="h2">{priceDisplay}</Title>
                    {!isFreeplan && (
                      <Text fontSize="caption" color="neutral-textLow">
                        {t('billing.perMonth')}
                      </Text>
                    )}
                  </Box>

                  {/* Badge de trial: só em planos pagos e quando trial está configurado */}
                  {!isFreeplan && trialMode === 'paid' && trialDays > 0 && (
                    <Tag appearance="warning">
                      {t('trial.paidBadge', { days: trialDays })}
                    </Tag>
                  )}
                  {!isFreeplan && trialMode === 'free' && trialDays > 0 && (
                    <Tag appearance="primary">
                      {t('trial.freeBadge', { days: trialDays })}
                    </Tag>
                  )}

                  {/* flexGrow empurra o botão pra base — mesma posição nos 3 cards */}
                  <Box display="flex" flexDirection="column" gap="3" flexGrow="1">
                    {features.map((feat, idx) => (
                      <Box key={idx} display="flex" gap="2" alignItems="center">
                        <CheckIcon color="success-textLow" />
                        <Text>{feat}</Text>
                      </Box>
                    ))}
                  </Box>

                  <Box display="flex" flexDirection="column" gap="1">
                    {isCurrent ? (
                      <>
                        <Button appearance="neutral" disabled>
                          {t('billing.status.currentPlan')}
                        </Button>
                        {!isFreeplan && subStatus !== 'canceled' && (
                          <Text fontSize="caption" color="neutral-textLow">
                            {t('billing.cancelHint')}
                          </Text>
                        )}
                      </>
                    ) : !isFreeplan ? (
                      <Button
                        appearance="primary"
                        onClick={() => handleCheckout(plan.key)}
                        disabled={checkoutLoading === plan.key}
                      >
                        {checkoutLoading === plan.key ? t('common.loading') : t('billing.checkout')}
                      </Button>
                    ) : null}
                  </Box>
                </Box>
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
                    <Table.Cell as="th">{t('billing.invoices.receipt')}</Table.Cell>
                  </Table.Row>
                </Table.Head>
                <Table.Body>
                  {invoices.map((inv, idx) => (
                    <Table.Row key={idx}>
                      <Table.Cell>
                        {inv.createdAt
                          ? new Date(inv.createdAt).toLocaleDateString()
                          : inv.periodStart
                          ? new Date(inv.periodStart).toLocaleDateString()
                          : '—'}
                      </Table.Cell>
                      <Table.Cell>
                        {new Intl.NumberFormat('pt-BR', {
                          style: 'currency',
                          currency: inv.currency?.toUpperCase() || 'BRL',
                        }).format(inv.amountPaid ?? 0)}
                      </Table.Cell>
                      <Table.Cell>
                        <Tag appearance={inv.status === 'paid' ? 'success' : 'warning'}>
                          {inv.status === 'paid'
                            ? t('billing.invoices.paid')
                            : t('billing.invoices.pending')}
                        </Tag>
                      </Table.Cell>
                      <Table.Cell>
                        {(inv.invoiceUrl || inv.invoicePdf) ? (
                          <a
                            href={inv.invoiceUrl || inv.invoicePdf}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: 'inherit', fontSize: '13px' }}
                          >
                            {t('billing.invoices.view')}
                          </a>
                        ) : (
                          <Text fontSize="caption" color="neutral-textDisabled">—</Text>
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

      {/* Partner section (when not locked) */}
      {!locked && (
        <Card>
          <Card.Header>
            <Title as="h3">{t('billing.partner.title')}</Title>
          </Card.Header>
          <Card.Body>
            <Box display="flex" flexDirection="column" gap="3">
              <Text color="neutral-textLow">{t('billing.partner.description')}</Text>

              {/* Parceiro já associado e não está editando */}
              {partner && !partnerEditing && (
                <Box display="flex" alignItems="center" gap="3" flexWrap="wrap">
                  <Tag appearance="success">
                    {t('billing.partner.associated', {
                      name: partner.partnerName,
                      id: partner.partnerId,
                    })}
                  </Tag>
                  <Button
                    appearance="neutral"
                    onClick={() => {
                      setPartnerEditing(true);
                      setPartnerInput('');
                      setPartnerError(null);
                    }}
                  >
                    {t('billing.partner.change')}
                  </Button>
                </Box>
              )}

              {/* Formulário de associação: sem parceiro OU editando */}
              {(!partner || partnerEditing) && (
                <Box display="flex" flexDirection="column" gap="2">
                  <Box display="flex" gap="2" alignItems="center" flexWrap="wrap">
                    <div style={{ flex: 1, minWidth: 180 }}>
                      <input
                        type="text"
                        value={partnerInput}
                        onChange={(e) => setPartnerInput(e.target.value.toUpperCase())}
                        placeholder={t('billing.partner.placeholder')}
                        maxLength={8}
                        disabled={partnerLoading}
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          border: '1px solid #d1d5db',
                          borderRadius: 6,
                          fontSize: 14,
                          fontFamily: 'monospace',
                          letterSpacing: '0.1em',
                          boxSizing: 'border-box',
                        }}
                        onKeyDown={(e) => e.key === 'Enter' && handlePartnerSave()}
                      />
                    </div>
                    <Button
                      appearance="primary"
                      onClick={handlePartnerSave}
                      disabled={partnerLoading || !partnerInput.trim()}
                    >
                      {partnerLoading ? t('billing.partner.saving') : t('billing.partner.save')}
                    </Button>
                    {partnerEditing && (
                      <Button
                        appearance="neutral"
                        onClick={() => {
                          setPartnerEditing(false);
                          setPartnerInput('');
                          setPartnerError(null);
                        }}
                        disabled={partnerLoading}
                      >
                        {t('common.cancel')}
                      </Button>
                    )}
                  </Box>
                  {partnerError && (
                    <Text fontSize="caption" color="danger-textLow">
                      {partnerError}
                    </Text>
                  )}
                </Box>
              )}
            </Box>
          </Card.Body>
        </Card>
      )}
    </Box>
  );
}
