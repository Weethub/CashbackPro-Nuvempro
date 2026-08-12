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
  blockAccessWhenPaused: false,
  pointsPerCurrency: 1,
  welcomeMessage: '',
  redeemMessage: '',
  widgetIconPosition: 'bottom-right',
  widgetIconSize: 'md',
  widgetClickAction: 'overlay',
  brandColor: '#7C3AED',
  brandBackgroundColor: '#F5F3F7',
  brandColorAuto: false,
  referralEnabled: false,
  referralPointsReferrer: 0,
  referralPointsReferred: 0,
  referralRules: '',
  welcomeBonusEnabled: false,
  welcomeBonusPoints: 0,
  howItWorks: '',
  winbackEnabled: false,
  winbackDays: 60,
  winbackPoints: 0,
  pointsExpiryMode: 'rolling',
  pointsExpiryRollingMonths: 6,
  pointsExpiryAnnualMonth: null,
  pointsExpiryAnnualDay: null,
  pointsExpiryTimesPerYear: 1,
  pointsExpiryEnabled: false,
  pointsExpiryWarningDays: 15,
  supportMessage: '',
  supportWhatsapp: '',
  supportEmail: '',
};

const MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];

let nextTempId = -1;

export default function Settings() {
  const { t } = useTranslation();
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [tiers, setTiers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [pages, setPages] = useState([]);
  const [pagesError, setPagesError] = useState(null);
  const [creatingPage, setCreatingPage] = useState(false);

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

    try {
      const pagesRes = await api.get('/api/cashback/pages');
      setPages(pagesRes.data.pages || []);
    } catch (err) {
      setPagesError(err.response?.data?.error || err.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const update = (field, value) => setConfig((prev) => ({ ...prev, [field]: value }));

  const handleCreatePage = async () => {
    setCreatingPage(true);
    setPagesError(null);
    try {
      const res = await api.post('/api/cashback/pages');
      const pagesRes = await api.get('/api/cashback/pages');
      setPages(pagesRes.data.pages || []);
      if (res.data?.handle) update('customerPageHandle', res.data.handle);
    } catch (err) {
      setPagesError(err.response?.data?.error || err.message);
    } finally {
      setCreatingPage(false);
    }
  };

  const updateTier = (index, field, value) =>
    setTiers((prev) => prev.map((tier, i) => (i === index ? { ...tier, [field]: value } : tier)));

  const addTier = () =>
    setTiers((prev) => [
      ...prev,
      {
        id: nextTempId--,
        name: '',
        pointsRequired: 100,
        couponType: 'percent_off',
        couponValue: 10,
        icon: null,
        color: '#0F7A5C',
        benefits: [],
        pointsMultiplier: 1,
      },
    ]);

  const removeTier = (index) => setTiers((prev) => prev.filter((_, i) => i !== index));

  const handleTierIconUpload = (index, file) => {
    if (!file) return;
    if (file.size > 300 * 1024) {
      setError(t('cashback.tiers.iconTooLarge'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => updateTier(index, 'icon', reader.result);
    reader.readAsDataURL(file);
  };

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

            {!config.isActive && (
              <Box
                display="flex"
                justifyContent="space-between"
                alignItems="center"
                gap="4"
                padding="3"
                backgroundColor="neutral-surface"
                borderRadius="2"
              >
                <Box display="flex" flexDirection="column" gap="1">
                  <Text fontWeight="bold">{t('cashback.settings.blockAccess')}</Text>
                  <Text fontSize="caption" color="neutral-textLow">
                    {t('cashback.settings.blockAccessHint')}
                  </Text>
                </Box>
                <Toggle
                  active={config.blockAccessWhenPaused}
                  onChange={() => update('blockAccessWhenPaused', !config.blockAccessWhenPaused)}
                  name="blockAccessWhenPaused"
                />
              </Box>
            )}

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
              <Text fontSize="caption" color="neutral-textLow">
                {t('cashback.settings.welcomeMessageHint')}
              </Text>
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
              <Text fontSize="caption" color="neutral-textLow">
                {t('cashback.settings.redeemMessageHint')}
              </Text>
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
                <Box display="flex" flexDirection="column" gap="1">
                  <Text fontSize="caption">{t('cashback.tiers.icon')}</Text>
                  <Box display="flex" alignItems="center" gap="2">
                    {tier.icon && (
                      <img
                        src={tier.icon}
                        alt=""
                        style={{ width: 32, height: 32, borderRadius: 6, objectFit: 'cover', border: '1px solid #E4E7E6' }}
                      />
                    )}
                    <label style={{ cursor: 'pointer' }}>
                      <input
                        type="file"
                        accept="image/*"
                        style={{ display: 'none' }}
                        onChange={(e) => handleTierIconUpload(index, e.target.files?.[0])}
                      />
                      <Button appearance="neutral" as="span">
                        {t('cashback.tiers.uploadIcon')}
                      </Button>
                    </label>
                  </Box>
                </Box>
                <Box display="flex" flexDirection="column" gap="1" minWidth="70px">
                  <Text fontSize="caption">{t('cashback.tiers.color')}</Text>
                  <input
                    type="color"
                    value={tier.color || '#0F7A5C'}
                    onChange={(e) => updateTier(index, 'color', e.target.value)}
                    style={{ width: 44, height: 36, padding: 0, border: '1px solid #D5D9D7', borderRadius: 4, cursor: 'pointer' }}
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
                <Box display="flex" flexDirection="column" gap="1" minWidth="110px">
                  <Text fontSize="caption">{t('cashback.tiers.multiplier')}</Text>
                  <Input
                    type="number"
                    min="1"
                    step="0.1"
                    name={`tier-mult-${index}`}
                    value={tier.pointsMultiplier ?? 1}
                    onChange={(e) => updateTier(index, 'pointsMultiplier', e.target.value)}
                  />
                </Box>
                <IconButton
                  source={<TrashIcon />}
                  size="2rem"
                  onClick={() => removeTier(index)}
                  aria-label={t('cashback.tiers.remove')}
                />
                <Box display="flex" flexDirection="column" gap="1" width="100%">
                  <Text fontSize="caption">{t('cashback.tiers.benefits')}</Text>
                  <Textarea
                    name={`tier-benefits-${index}`}
                    lines={3}
                    placeholder={t('cashback.tiers.benefitsPlaceholder')}
                    value={(Array.isArray(tier.benefits) ? tier.benefits : []).join('\n')}
                    onChange={(e) => updateTier(index, 'benefits', e.target.value.split('\n'))}
                  />
                </Box>
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
          <Title as="h3">{t('cashback.appearance.title')}</Title>
          <Text fontSize="caption" color="neutral-textLow">
            {t('cashback.appearance.hint')}
          </Text>
        </Card.Header>
        <Card.Body>
          <Box display="flex" flexDirection="column" gap="4">
            <Box display="flex" justifyContent="space-between" alignItems="center" gap="4">
              <Box display="flex" flexDirection="column" gap="1">
                <Text fontWeight="bold">{t('cashback.appearance.autoDetect')}</Text>
                <Text fontSize="caption" color="neutral-textLow">
                  {t('cashback.appearance.autoDetectHint')}
                </Text>
              </Box>
              <Toggle
                active={config.brandColorAuto === true}
                onChange={() => update('brandColorAuto', !(config.brandColorAuto === true))}
                name="brandColorAuto"
              />
            </Box>
            <Box display="flex" flexWrap="wrap" gap="4">
              <Box display="flex" flexDirection="column" gap="1" minWidth="160px">
                <Text>{t('cashback.appearance.brandColor')}</Text>
                <Box display="flex" gap="2" alignItems="center">
                  <input
                    type="color"
                    value={config.brandColor || '#7C3AED'}
                    onChange={(e) => update('brandColor', e.target.value)}
                    disabled={config.brandColorAuto === true}
                    style={{ width: 44, height: 36, padding: 0, border: '1px solid #D5D9D7', borderRadius: 6, cursor: config.brandColorAuto === true ? 'not-allowed' : 'pointer', opacity: config.brandColorAuto === true ? 0.5 : 1 }}
                  />
                  <Input
                    name="brandColorHex"
                    value={config.brandColor || '#7C3AED'}
                    onChange={(e) => update('brandColor', e.target.value)}
                    disabled={config.brandColorAuto === true}
                  />
                </Box>
              </Box>
              <Box display="flex" flexDirection="column" gap="1" minWidth="160px">
                <Text>{t('cashback.appearance.backgroundColor')}</Text>
                <Box display="flex" gap="2" alignItems="center">
                  <input
                    type="color"
                    value={config.brandBackgroundColor || '#F5F3F7'}
                    onChange={(e) => update('brandBackgroundColor', e.target.value)}
                    style={{ width: 44, height: 36, padding: 0, border: '1px solid #D5D9D7', borderRadius: 6, cursor: 'pointer' }}
                  />
                  <Input
                    name="brandBackgroundColorHex"
                    value={config.brandBackgroundColor || '#F5F3F7'}
                    onChange={(e) => update('brandBackgroundColor', e.target.value)}
                  />
                </Box>
              </Box>
            </Box>
            {config.brandColorAuto === true && (
              <Text fontSize="caption" color="neutral-textLow">
                {t('cashback.appearance.brandColorDisabledHint')}
              </Text>
            )}
          </Box>
        </Card.Body>
      </Card>

      <Card>
        <Card.Header>
          <Title as="h3">{t('cashback.welcome.title')}</Title>
          <Text fontSize="caption" color="neutral-textLow">
            {t('cashback.welcome.hint')}
          </Text>
        </Card.Header>
        <Card.Body>
          <Box display="flex" flexDirection="column" gap="4">
            <Box display="flex" justifyContent="space-between" alignItems="center" gap="4">
              <Text fontWeight="bold">{t('cashback.welcome.enable')}</Text>
              <Toggle
                active={config.welcomeBonusEnabled}
                onChange={() => update('welcomeBonusEnabled', !config.welcomeBonusEnabled)}
                name="welcomeBonusEnabled"
              />
            </Box>
            <Box display="flex" flexDirection="column" gap="1" minWidth="200px">
              <Text>{t('cashback.welcome.points')}</Text>
              <Input
                type="number"
                min="0"
                step="1"
                name="welcomeBonusPoints"
                value={config.welcomeBonusPoints ?? 0}
                onChange={(e) => update('welcomeBonusPoints', e.target.value)}
              />
            </Box>
          </Box>
        </Card.Body>
      </Card>

      <Card>
        <Card.Header>
          <Title as="h3">{t('cashback.winback.title')}</Title>
          <Text fontSize="caption" color="neutral-textLow">
            {t('cashback.winback.hint')}
          </Text>
        </Card.Header>
        <Card.Body>
          <Box display="flex" flexDirection="column" gap="4">
            <Box display="flex" justifyContent="space-between" alignItems="center" gap="4">
              <Text fontWeight="bold">{t('cashback.winback.enable')}</Text>
              <Toggle
                active={config.winbackEnabled}
                onChange={() => update('winbackEnabled', !config.winbackEnabled)}
                name="winbackEnabled"
              />
            </Box>
            <Box display="flex" flexWrap="wrap" gap="4">
              <Box display="flex" flexDirection="column" gap="1" minWidth="200px">
                <Text>{t('cashback.winback.days')}</Text>
                <Input
                  type="number"
                  min="1"
                  step="1"
                  name="winbackDays"
                  value={config.winbackDays ?? 60}
                  onChange={(e) => update('winbackDays', e.target.value)}
                />
              </Box>
              <Box display="flex" flexDirection="column" gap="1" minWidth="200px">
                <Text>{t('cashback.winback.points')}</Text>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  name="winbackPoints"
                  value={config.winbackPoints ?? 0}
                  onChange={(e) => update('winbackPoints', e.target.value)}
                />
              </Box>
            </Box>
          </Box>
        </Card.Body>
      </Card>

      <Card>
        <Card.Header>
          <Title as="h3">{t('cashback.pointsExpiry.title')}</Title>
          <Text fontSize="caption" color="neutral-textLow">
            {t('cashback.pointsExpiry.hint')}
          </Text>
        </Card.Header>
        <Card.Body>
          <Box display="flex" flexDirection="column" gap="4">
            <Box display="flex" flexDirection="column" gap="1" minWidth="240px">
              <Text fontWeight="bold">{t('cashback.pointsExpiry.mode.label')}</Text>
              <Select
                name="pointsExpiryMode"
                id="pointsExpiryMode"
                value={config.pointsExpiryMode || 'rolling'}
                onChange={(e) => update('pointsExpiryMode', e.target.value)}
              >
                <Select.Option value="rolling" label={t('cashback.pointsExpiry.mode.rolling')}>
                  {t('cashback.pointsExpiry.mode.rolling')}
                </Select.Option>
                <Select.Option value="annual" label={t('cashback.pointsExpiry.mode.annual')}>
                  {t('cashback.pointsExpiry.mode.annual')}
                </Select.Option>
              </Select>
              <Text fontSize="caption" color="neutral-textLow">
                {config.pointsExpiryMode === 'annual'
                  ? t('cashback.pointsExpiry.mode.annualHint')
                  : t('cashback.pointsExpiry.mode.rollingHint')}
              </Text>
            </Box>

            {config.pointsExpiryMode === 'annual' ? (
              <Box display="flex" gap="4" flexWrap="wrap">
                <Box display="flex" flexDirection="column" gap="1" minWidth="180px">
                  <Text>{t('cashback.pointsExpiry.annualMonth')}</Text>
                  <Select
                    name="pointsExpiryAnnualMonth"
                    id="pointsExpiryAnnualMonth"
                    value={config.pointsExpiryAnnualMonth || ''}
                    onChange={(e) => update('pointsExpiryAnnualMonth', e.target.value || null)}
                  >
                    <Select.Option value="" label={t('cashback.pointsExpiry.selectPlaceholder')}>
                      {t('cashback.pointsExpiry.selectPlaceholder')}
                    </Select.Option>
                    {MONTHS.map((m, i) => (
                      <Select.Option key={m} value={i + 1} label={t(`cashback.pointsExpiry.months.${m}`)}>
                        {t(`cashback.pointsExpiry.months.${m}`)}
                      </Select.Option>
                    ))}
                  </Select>
                </Box>
                <Box display="flex" flexDirection="column" gap="1" minWidth="120px">
                  <Text>{t('cashback.pointsExpiry.annualDay')}</Text>
                  <Input
                    type="number"
                    min="1"
                    max="31"
                    step="1"
                    name="pointsExpiryAnnualDay"
                    value={config.pointsExpiryAnnualDay ?? ''}
                    onChange={(e) => update('pointsExpiryAnnualDay', e.target.value || null)}
                  />
                </Box>
                <Box display="flex" flexDirection="column" gap="1" minWidth="220px">
                  <Text>{t('cashback.pointsExpiry.timesPerYear')}</Text>
                  <Select
                    name="pointsExpiryTimesPerYear"
                    id="pointsExpiryTimesPerYear"
                    value={config.pointsExpiryTimesPerYear ?? 1}
                    onChange={(e) => update('pointsExpiryTimesPerYear', e.target.value)}
                  >
                    {[1, 2, 3, 4, 6, 12].map((n) => (
                      <Select.Option key={n} value={n} label={t(`cashback.pointsExpiry.timesPerYearOptions.${n}`)}>
                        {t(`cashback.pointsExpiry.timesPerYearOptions.${n}`)}
                      </Select.Option>
                    ))}
                  </Select>
                  <Text fontSize="caption" color="neutral-textLow">
                    {t('cashback.pointsExpiry.timesPerYearHint')}
                  </Text>
                </Box>
              </Box>
            ) : (
              <Box display="flex" flexDirection="column" gap="1" minWidth="200px">
                <Text>{t('cashback.pointsExpiry.rollingMonths')}</Text>
                <Input
                  type="number"
                  min="1"
                  max="60"
                  step="1"
                  name="pointsExpiryRollingMonths"
                  value={config.pointsExpiryRollingMonths ?? 6}
                  onChange={(e) => update('pointsExpiryRollingMonths', e.target.value)}
                />
              </Box>
            )}

            <Box display="flex" justifyContent="space-between" alignItems="center" gap="4">
              <Text fontWeight="bold">{t('cashback.pointsExpiry.enable')}</Text>
              <Toggle
                active={config.pointsExpiryEnabled}
                onChange={() => update('pointsExpiryEnabled', !config.pointsExpiryEnabled)}
                name="pointsExpiryEnabled"
              />
            </Box>
            <Box display="flex" flexDirection="column" gap="1" minWidth="200px">
              <Text>{t('cashback.pointsExpiry.days')}</Text>
              <Input
                type="number"
                min="1"
                step="1"
                name="pointsExpiryWarningDays"
                value={config.pointsExpiryWarningDays ?? 15}
                onChange={(e) => update('pointsExpiryWarningDays', e.target.value)}
              />
            </Box>
          </Box>
        </Card.Body>
      </Card>

      <Card>
        <Card.Header>
          <Title as="h3">{t('cashback.howItWorks.title')}</Title>
          <Text fontSize="caption" color="neutral-textLow">
            {t('cashback.howItWorks.hint')}
          </Text>
        </Card.Header>
        <Card.Body>
          <Textarea
            name="howItWorks"
            lines={5}
            placeholder={t('cashback.howItWorks.placeholder')}
            value={config.howItWorks || ''}
            onChange={(e) => update('howItWorks', e.target.value)}
          />
        </Card.Body>
      </Card>

      <Card>
        <Card.Header>
          <Title as="h3">{t('cashback.support.title')}</Title>
          <Text fontSize="caption" color="neutral-textLow">
            {t('cashback.support.hint')}
          </Text>
        </Card.Header>
        <Card.Body>
          <Box display="flex" flexDirection="column" gap="4">
            <Box display="flex" flexDirection="column" gap="1">
              <Text>{t('cashback.support.message')}</Text>
              <Textarea
                name="supportMessage"
                lines={3}
                placeholder={t('cashback.support.messagePlaceholder')}
                value={config.supportMessage || ''}
                onChange={(e) => update('supportMessage', e.target.value)}
              />
            </Box>
            <Box display="flex" flexWrap="wrap" gap="4">
              <Box display="flex" flexDirection="column" gap="1" minWidth="220px">
                <Text>{t('cashback.support.whatsapp')}</Text>
                <Input
                  name="supportWhatsapp"
                  placeholder="5511999999999"
                  value={config.supportWhatsapp || ''}
                  onChange={(e) => update('supportWhatsapp', e.target.value)}
                />
              </Box>
              <Box display="flex" flexDirection="column" gap="1" minWidth="220px">
                <Text>{t('cashback.support.email')}</Text>
                <Input
                  type="email"
                  name="supportEmail"
                  placeholder="contato@sualoja.com"
                  value={config.supportEmail || ''}
                  onChange={(e) => update('supportEmail', e.target.value)}
                />
              </Box>
            </Box>
          </Box>
        </Card.Body>
      </Card>

      <Card>
        <Card.Header>
          <Title as="h3">{t('cashback.referral.title')}</Title>
          <Text fontSize="caption" color="neutral-textLow">
            {t('cashback.referral.hint')}
          </Text>
        </Card.Header>
        <Card.Body>
          <Box display="flex" flexDirection="column" gap="4">
            <Box display="flex" justifyContent="space-between" alignItems="center" gap="4">
              <Text fontWeight="bold">{t('cashback.referral.enable')}</Text>
              <Toggle
                active={config.referralEnabled}
                onChange={() => update('referralEnabled', !config.referralEnabled)}
                name="referralEnabled"
              />
            </Box>
            <Box display="flex" flexWrap="wrap" gap="4">
              <Box display="flex" flexDirection="column" gap="1" minWidth="200px">
                <Text>{t('cashback.referral.pointsReferrer')}</Text>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  name="referralPointsReferrer"
                  value={config.referralPointsReferrer ?? 0}
                  onChange={(e) => update('referralPointsReferrer', e.target.value)}
                />
              </Box>
              <Box display="flex" flexDirection="column" gap="1" minWidth="200px">
                <Text>{t('cashback.referral.pointsReferred')}</Text>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  name="referralPointsReferred"
                  value={config.referralPointsReferred ?? 0}
                  onChange={(e) => update('referralPointsReferred', e.target.value)}
                />
              </Box>
            </Box>
            <Box display="flex" flexDirection="column" gap="1">
              <Text>{t('cashback.referral.rules')}</Text>
              <Textarea
                name="referralRules"
                lines={4}
                placeholder={t('cashback.referral.rulesPlaceholder')}
                value={config.referralRules || ''}
                onChange={(e) => update('referralRules', e.target.value)}
              />
            </Box>
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
            <Box display="flex" flexDirection="column" gap="1" minWidth="240px">
              <Text>{t('cashback.widget.clickAction')}</Text>
              <Select
                name="widgetClickAction"
                id="widgetClickAction"
                value={config.widgetClickAction || 'overlay'}
                onChange={(e) => update('widgetClickAction', e.target.value)}
              >
                <Select.Option value="overlay" label={t('cashback.widget.clickActionOptions.overlay')}>
                  {t('cashback.widget.clickActionOptions.overlay')}
                </Select.Option>
                <Select.Option value="page" label={t('cashback.widget.clickActionOptions.page')}>
                  {t('cashback.widget.clickActionOptions.page')}
                </Select.Option>
              </Select>
              {config.widgetClickAction === 'page' && !config.customerPageHandle && (
                <Text fontSize="caption" color="danger-textLow">
                  {t('cashback.widget.clickActionOptions.pageWarning')}
                </Text>
              )}
            </Box>
          </Box>
        </Card.Body>
      </Card>

      <Card>
        <Card.Header>
          <Title as="h3">{t('cashback.widget.customerPage.title')}</Title>
          <Text fontSize="caption" color="neutral-textLow">
            {t('cashback.widget.customerPage.hint')}
          </Text>
        </Card.Header>
        <Card.Body>
          <Box display="flex" flexDirection="column" gap="3">
            {pagesError && (
              <Alert appearance="danger">
                <Text>{pagesError}</Text>
              </Alert>
            )}

            <Box display="flex" gap="3" alignItems="flex-end" flexWrap="wrap">
              <Box display="flex" flexDirection="column" gap="1" minWidth="240px">
                <Select
                  name="customerPageHandle"
                  id="customerPageHandle"
                  value={config.customerPageHandle || ''}
                  onChange={(e) => update('customerPageHandle', e.target.value || null)}
                >
                  <Select.Option value="" label={t('cashback.widget.customerPage.selectPlaceholder')}>
                    {t('cashback.widget.customerPage.selectPlaceholder')}
                  </Select.Option>
                  {pages.map((page) => (
                    <Select.Option key={page.handle} value={page.handle} label={page.name}>
                      {page.name}
                    </Select.Option>
                  ))}
                </Select>
              </Box>
              <Button appearance="neutral" onClick={handleCreatePage} disabled={creatingPage}>
                {creatingPage
                  ? t('cashback.widget.customerPage.creating')
                  : config.customerPageHandle
                    ? t('cashback.widget.customerPage.syncButton')
                    : t('cashback.widget.customerPage.createButton')}
              </Button>
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
