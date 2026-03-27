import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Box, Card, Button, Text, Title, Input, Select, Alert, Spinner } from '@nimbus-ds/components';
import { useProfile } from '../hooks/useProfile.js';

export default function Settings() {
  const { t } = useTranslation();
  const { profile, loading, updateProfile } = useProfile();
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (profile) {
      setForm({ ...profile });
    }
  }, [profile]);

  const update = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setSuccess(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      await updateProfile(form);
      setSuccess(true);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading || !form) {
    return (
      <Box display="flex" justifyContent="center" padding="8">
        <Spinner size="large" />
      </Box>
    );
  }

  return (
    <Box display="flex" flexDirection="column" gap="4">
      <Title as="h2">{t('settings.title')}</Title>

      <Card>
        <Card.Body>
          <Box display="flex" flexDirection="column" gap="4">
            <Box display="flex" flexDirection="column" gap="1">
              <Text>{t('onboarding.fields.niche')}</Text>
              <Input
                name="niche"
                value={form.niche || ''}
                onChange={(e) => update('niche', e.target.value)}
              />
            </Box>

            <Box display="flex" flexDirection="column" gap="1">
              <Text>{t('onboarding.fields.audience')}</Text>
              <Input
                name="audience"
                value={form.audience || ''}
                onChange={(e) => update('audience', e.target.value)}
              />
            </Box>

            <Box display="flex" flexDirection="column" gap="1">
              <Text>{t('onboarding.fields.tone')}</Text>
              <Select
                name="tone"
                id="settings-tone"
                value={form.tone || 'professional'}
                onChange={(e) => update('tone', e.target.value)}
              >
                {['professional', 'casual', 'friendly', 'formal'].map((opt) => (
                  <Select.Option key={opt} value={opt} label={t(`onboarding.fields.toneOptions.${opt}`)}>
                    {t(`onboarding.fields.toneOptions.${opt}`)}
                  </Select.Option>
                ))}
              </Select>
            </Box>

            <Box display="flex" flexDirection="column" gap="1">
              <Text>{t('onboarding.fields.frequency')}</Text>
              <Select
                name="frequency"
                id="settings-frequency"
                value={form.frequency || 'weekly'}
                onChange={(e) => update('frequency', e.target.value)}
              >
                {['daily', 'weekly', 'biweekly', 'monthly'].map((opt) => (
                  <Select.Option key={opt} value={opt} label={t(`onboarding.fields.frequencyOptions.${opt}`)}>
                    {t(`onboarding.fields.frequencyOptions.${opt}`)}
                  </Select.Option>
                ))}
              </Select>
            </Box>

            <Box display="flex" flexDirection="column" gap="1">
              <Text>{t('onboarding.fields.articleLength')}</Text>
              <Select
                name="articleLength"
                id="settings-articleLength"
                value={form.articleLength || 'medium'}
                onChange={(e) => update('articleLength', e.target.value)}
              >
                {['short', 'medium', 'long'].map((opt) => (
                  <Select.Option key={opt} value={opt} label={t(`onboarding.fields.articleLengthOptions.${opt}`)}>
                    {t(`onboarding.fields.articleLengthOptions.${opt}`)}
                  </Select.Option>
                ))}
              </Select>
            </Box>

            <Box display="flex" flexDirection="column" gap="1">
              <Text>{t('onboarding.fields.keywords')}</Text>
              <Input
                name="keywords"
                value={form.keywords || ''}
                onChange={(e) => update('keywords', e.target.value)}
              />
            </Box>

            <Box display="flex" flexDirection="column" gap="1">
              <Text>{t('onboarding.fields.extras')}</Text>
              <Input
                name="extras"
                value={form.extras || ''}
                onChange={(e) => update('extras', e.target.value)}
              />
            </Box>

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
              <Button
                appearance="primary"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? t('common.loading') : t('common.save')}
              </Button>
            </Box>
          </Box>
        </Card.Body>
      </Card>
    </Box>
  );
}
