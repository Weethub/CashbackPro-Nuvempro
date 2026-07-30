import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Box, Card, Button, Text, Title, Input, Select, Alert } from '@nimbus-ds/components';
import api from '../services/api.js';

export default function Onboarding({ onComplete }) {
  const { t } = useTranslation();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const [form, setForm] = useState({
    pointsPerCurrency: 1,
    redeemThreshold: 100,
    couponType: 'percent_off',
    couponValue: 10,
  });

  const update = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  const handleFinish = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await api.put('/api/cashback/config', { isActive: true, pointsPerCurrency: form.pointsPerCurrency });
      await api.put('/api/cashback/tiers', {
        tiers: [
          {
            name: 'Nível 1',
            pointsRequired: form.redeemThreshold,
            couponType: form.couponType,
            couponValue: form.couponValue,
          },
        ],
      });
      await api.post('/api/profile', { data: { onboarded: true } });
      if (onComplete) onComplete();
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Box display="flex" alignItems="center" justifyContent="center" minHeight="100vh" padding="4">
      <Box maxWidth="560px" width="100%">
        <Card>
          <Card.Header>
            <Title as="h2">{t('onboarding.title')}</Title>
            <Text color="neutral-textLow">{t('onboarding.subtitle')}</Text>
          </Card.Header>
          <Card.Body>
            <Box display="flex" flexDirection="column" gap="4">
              <Box display="flex" flexDirection="column" gap="1">
                <Text>{t('cashback.settings.pointsPerCurrency')}</Text>
                <Input
                  type="number"
                  min="0"
                  step="0.1"
                  name="pointsPerCurrency"
                  value={form.pointsPerCurrency}
                  onChange={(e) => update('pointsPerCurrency', e.target.value)}
                />
                <Text fontSize="caption" color="neutral-textLow">
                  {t('cashback.settings.pointsPerCurrencyHint')}
                </Text>
              </Box>

              <Box display="flex" flexDirection="column" gap="1">
                <Text>{t('cashback.settings.redeemThreshold')}</Text>
                <Input
                  type="number"
                  min="1"
                  step="1"
                  name="redeemThreshold"
                  value={form.redeemThreshold}
                  onChange={(e) => update('redeemThreshold', e.target.value)}
                />
                <Text fontSize="caption" color="neutral-textLow">
                  {t('cashback.settings.redeemThresholdHint')}
                </Text>
              </Box>

              <Box display="flex" flexDirection="column" gap="1">
                <Text>{t('cashback.settings.couponType')}</Text>
                <Select
                  name="couponType"
                  id="couponType"
                  value={form.couponType}
                  onChange={(e) => update('couponType', e.target.value)}
                >
                  <Select.Option
                    value="percent_off"
                    label={t('cashback.settings.couponTypeOptions.percent_off')}
                  >
                    {t('cashback.settings.couponTypeOptions.percent_off')}
                  </Select.Option>
                  <Select.Option
                    value="amount_off"
                    label={t('cashback.settings.couponTypeOptions.amount_off')}
                  >
                    {t('cashback.settings.couponTypeOptions.amount_off')}
                  </Select.Option>
                </Select>
              </Box>

              <Box display="flex" flexDirection="column" gap="1">
                <Text>
                  {form.couponType === 'amount_off'
                    ? t('cashback.settings.couponValueAmount')
                    : t('cashback.settings.couponValuePercent')}
                </Text>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  name="couponValue"
                  value={form.couponValue}
                  onChange={(e) => update('couponValue', e.target.value)}
                />
              </Box>

              {error && (
                <Alert appearance="danger">
                  <Text>{error}</Text>
                </Alert>
              )}

              <Box display="flex" justifyContent="flex-end">
                <Button appearance="primary" onClick={handleFinish} disabled={submitting}>
                  {submitting ? t('common.loading') : t('onboarding.finish')}
                </Button>
              </Box>
            </Box>
          </Card.Body>
        </Card>
      </Box>
    </Box>
  );
}
