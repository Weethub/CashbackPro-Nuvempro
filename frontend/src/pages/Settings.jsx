import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Box,
  Card,
  Text,
  Title,
  Input,
  Select,
  Button,
  Alert,
  Toggle,
  Textarea,
  IconButton,
} from '@nimbus-ds/components';
import { TrashIcon, PlusCircleIcon } from '@nimbus-ds/icons';
import api from '../services/api.js';

const DEFAULT_CONFIG = {
  isActive: false,
  pointsPerCurrency: 1,
  welcomeMessage: '',
  redeemMessage: '',
  widgetIconPosition: 'bottom-right',
  widgetIconSize: 'md',
};

let nextTempId = -1;

export default function Settings() {
  const { t } = useTranslation();
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [tiers, setTiers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [configRes, tiersRes] = await Promise.all([
        api.get('/api/cashback/config'),
        api.get('/api/cashback/tiers'),
      ]);
      setConfig({ ...DEFAULT_CONFIG, ...configRes.data.config });
      setTiers(tiersRes.data.tiers || []);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const update = (field, value) => setConfig((prev) => ({ ...prev, [field]: value }));

  const updateTier = (index, field, value) =>
    setTiers((prev) => prev.map((tier, i) => (i === index ? { ...tier, [field]: value } : tier)));

  const addTier = () =>
    setTiers((prev) => [
      ...prev,
      { id: nextTempId--, name: '', pointsRequired: 100, couponType: 'percent_off', couponValue: 10 },
    ]);

  const removeTier = (index) => setTiers((prev) => prev.filter((_, i) => i !== index));

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const tiersPayload = tiers.map(({ id, ...rest }) => (id > 0 ? { id, ...rest } : rest));
      const [configRes, tiersRes] = await Promise.all([
        api.put('/api/cashback/config', config),
        api.put('/api/cashback/tiers', { tiers: tiersPayload }),
      ]);
      setConfig({ ...DEFAULT_CONFIG, ...configRes.data.config });
      setTiers(tiersRes.data.tiers || []);
      setSuccess(true);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" padding="8">
        <Text color="neutral-textDisabled">{t('common.loading')}</Text>
      </Box>
    );
  }

  return (
    <Box display="flex" flexDirection="column" gap="4">
      <Title as="h2">{t('cashback.settings.title')}</Title>

      <Card>
        <Card.Body>
          <Box display="flex" flexDirection="column" gap="4">
            <Box display="flex" justifyContent="space-between" alignItems="center" gap="4">
              <Box display="flex" flexDirection="column" gap="1">
                <Text fontWeight="bold">{t('cashback.settings.active')}</Text>
                <Text fontSize="caption" color="neutral-textLow">
                  {t('cashback.settings.activeHint')}
                </Text>
              </Box>
              <Toggle
                active={config.isActive}
                onChange={() => update('isActive', !config.isActive)}
                name="isActive"
              />
            </Box>

            <Box display="flex" flexDirection="column" gap="1">
              <Text>{t('cashback.settings.pointsPerCurrency')}</Text>
              <Input
                type="number"
                min="0"
                step="0.1"
                name="pointsPerCurrency"
                value={config.pointsPerCurrency}
                onChange={(e) => update('pointsPerCurrency', e.target.value)}
              />
              <Text fontSize="caption" color="neutral-textLow">
                {t('cashback.settings.pointsPerCurrencyHint')}
              </Text>
            </Box>

            <Box display="flex" flexDirection="column" gap="1">
              <Text>{t('cashback.settings.welcomeMessage')}</Text>
              <Textarea
                name="welcomeMessage"
                placeholder={t('cashback.settings.welcomeMessagePlaceholder')}
                value={config.welcomeMessage || ''}
                onChange={(e) => update('welcomeMessage', e.target.value)}
                rows={2}
              />
            </Box>

            <Box display="flex" flexDirection="column" gap="1">
              <Text>{t('cashback.settings.redeemMessage')}</Text>
              <Textarea
                name="redeemMessage"
                placeholder={t('cashback.settings.redeemMessagePlaceholder')}
                value={config.redeemMessage || ''}
                onChange={(e) => update('redeemMessage', e.target.value)}
                rows={2}
              />
            </Box>
          </Box>
        </Card.Body>
      </Card>

      <Card>
        <Card.Header>
          <Title as="h3">{t('cashback.tiers.title')}</Title>
          <Text fontSize="caption" color="neutral-textLow">
            {t('cashback.tiers.hint')}
          </Text>
        </Card.Header>
        <Card.Body>
          <Box display="flex" flexDirection="column" gap="4">
            {tiers.map((tier, index) => (
              <Box
                key={tier.id}
                display="flex"
                flexWrap="wrap"
                gap="2"
                alignItems="flex-end"
                borderColor="neutral-surfaceHighlight"
                borderStyle="solid"
                borderWidth="1"
                borderRadius="2"
                padding="3"
              >
                <Box display="flex" flexDirection="column" gap="1" minWidth="140px">
                  <Text fontSize="caption">{t('cashback.tiers.name')}</Text>
                  <Input
                    name={`tier-name-${index}`}
                    placeholder={t('cashback.tiers.namePlaceholder')}
                    value={tier.name}
                    onChange={(e) => updateTier(index, 'name', e.target.value)}
                  />
                </Box>
                <Box display="flex" flexDirection="column" gap="1" minWidth="120px">
                  <Text fontSize="caption">{t('cashback.tiers.pointsRequired')}</Text>
                  <Input
                    type="number"
                    min="1"
                    step="1"
                    name={`tier-points-${index}`}
                    value={tier.pointsRequired}
                    onChange={(e) => updateTier(index, 'pointsRequired', e.target.value)}
                  />
                </Box>
                <Box display="flex" flexDirection="column" gap="1" minWidth="150px">
                  <Text fontSize="caption">{t('cashback.settings.couponType')}</Text>
                  <Select
                    name={`tier-couponType-${index}`}
                    id={`tier-couponType-${index}`}
                    value={tier.couponType}
                    onChange={(e) => updateTier(index, 'couponType', e.target.value)}
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
                <Box display="flex" flexDirection="column" gap="1" minWidth="110px">
                  <Text fontSize="caption">
                    {tier.couponType === 'amount_off'
                      ? t('cashback.settings.couponValueAmount')
                      : t('cashback.settings.couponValuePercent')}
                  </Text>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    name={`tier-value-${index}`}
                    value={tier.couponValue}
                    onChange={(e) => updateTier(index, 'couponValue', e.target.value)}
                  />
                </Box>
                <IconButton
                  source={<TrashIcon />}
                  size="2rem"
                  onClick={() => removeTier(index)}
                  aria-label={t('cashback.tiers.remove')}
                />
              </Box>
            ))}

            <Box>
              <Button appearance="neutral" onClick={addTier}>
                <PlusCircleIcon />
                {t('cashback.tiers.add')}
              </Button>
            </Box>

            {tiers.length === 0 && (
              <Text fontSize="caption" color="neutral-textLow">
                {t('cashback.tiers.empty')}
              </Text>
            )}
          </Box>
        </Card.Body>
      </Card>

      <Card>
        <Card.Header>
          <Title as="h3">{t('cashback.widget.title')}</Title>
        </Card.Header>
        <Card.Body>
          <Box display="flex" flexWrap="wrap" gap="4">
            <Box display="flex" flexDirection="column" gap="1" minWidth="200px">
              <Text>{t('cashback.widget.position')}</Text>
              <Select
                name="widgetIconPosition"
                id="widgetIconPosition"
                value={config.widgetIconPosition}
                onChange={(e) => update('widgetIconPosition', e.target.value)}
              >
                {['bottom-right', 'bottom-left', 'top-right', 'top-left'].map((opt) => (
                  <Select.Option
                    key={opt}
                    value={opt}
                    label={t(`cashback.widget.positionOptions.${opt}`)}
                  >
                    {t(`cashback.widget.positionOptions.${opt}`)}
                  </Select.Option>
                ))}
              </Select>
            </Box>
            <Box display="flex" flexDirection="column" gap="1" minWidth="160px">
              <Text>{t('cashback.widget.size')}</Text>
              <Select
                name="widgetIconSize"
                id="widgetIconSize"
                value={config.widgetIconSize}
                onChange={(e) => update('widgetIconSize', e.target.value)}
              >
                {['sm', 'md', 'lg'].map((opt) => (
                  <Select.Option key={opt} value={opt} label={t(`cashback.widget.sizeOptions.${opt}`)}>
                    {t(`cashback.widget.sizeOptions.${opt}`)}
                  </Select.Option>
                ))}
              </Select>
            </Box>
          </Box>
        </Card.Body>
      </Card>

      {error && (
        <Alert appearance="danger">
          <Text>{error}</Text>
        </Alert>
      )}
      {success && (
        <Alert appearance="success">
          <Text>{t('common.success')}</Text>
        </Alert>
      )}

      <Box display="flex" justifyContent="flex-end">
        <Button appearance="primary" onClick={handleSave} disabled={saving}>
          {saving ? t('common.loading') : t('common.save')}
        </Button>
      </Box>
    </Box>
  );
}
