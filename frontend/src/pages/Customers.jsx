import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { Box, Card, Text, Title, Table, Pagination, Input, Icon } from '@nimbus-ds/components';
import { ChevronUpIcon, ChevronDownIcon } from '@nimbus-ds/icons';
import api from '../services/api.js';

function SortableHeader({ label, field, sortBy, sortDir, onSort }) {
  const active = sortBy === field;
  return (
    <Table.Cell as="th">
      <Box
        display="flex"
        alignItems="center"
        gap="1"
        style={{ cursor: 'pointer', userSelect: 'none' }}
        onClick={() => onSort(field)}
      >
        <Text fontWeight="bold" fontSize="caption">
          {label}
        </Text>
        {active && (
          <Icon
            source={sortDir === 'asc' ? <ChevronUpIcon /> : <ChevronDownIcon />}
            color="neutral-textLow"
          />
        )}
      </Box>
    </Table.Cell>
  );
}

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString();
}

export default function Customers() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();

  const page = parseInt(searchParams.get('page') || '1');
  const sortBy = searchParams.get('sortBy') || 'pointsBalance';
  const sortDir = searchParams.get('sortDir') || 'desc';
  const [searchInput, setSearchInput] = useState(searchParams.get('search') || '');

  const [customers, setCustomers] = useState([]);
  const [meta, setMeta] = useState({ page: 1, totalPages: 1 });
  const [loading, setLoading] = useState(true);

  const [redemptions, setRedemptions] = useState([]);
  const [redemptionsMeta, setRedemptionsMeta] = useState({ page: 1, totalPages: 1 });
  const [redemptionsPage, setRedemptionsPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/api/cashback/customers', {
        params: { page, sortBy, sortDir, search: searchParams.get('search') || undefined },
      });
      setCustomers(res.data.data || []);
      setMeta(res.data.meta || { page: 1, totalPages: 1 });
    } catch {
      setCustomers([]);
    } finally {
      setLoading(false);
    }
  }, [page, sortBy, sortDir, searchParams]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    api
      .get('/api/cashback/redemptions', { params: { page: redemptionsPage } })
      .then((res) => {
        setRedemptions(res.data.data || []);
        setRedemptionsMeta(res.data.meta || { page: 1, totalPages: 1 });
      })
      .catch(() => setRedemptions([]));
  }, [redemptionsPage]);

  // Debounce da busca por e-mail
  useEffect(() => {
    const timeout = setTimeout(() => {
      const next = new URLSearchParams(searchParams);
      if (searchInput) next.set('search', searchInput);
      else next.delete('search');
      next.set('page', '1');
      setSearchParams(next);
    }, 400);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const handleSort = (field) => {
    const next = new URLSearchParams(searchParams);
    if (sortBy === field) {
      next.set('sortDir', sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      next.set('sortBy', field);
      next.set('sortDir', 'desc');
    }
    next.set('page', '1');
    setSearchParams(next);
  };

  const handlePageChange = (newPage) => {
    const next = new URLSearchParams(searchParams);
    next.set('page', String(newPage));
    setSearchParams(next);
  };

  return (
    <Box display="flex" flexDirection="column" gap="4">
      <Title as="h2">{t('customers.title')}</Title>

      <Card>
        <Card.Header>
          <Box display="flex" justifyContent="space-between" alignItems="center" gap="4">
            <Title as="h3">{t('customers.listTitle')}</Title>
            <Box minWidth="240px">
              <Input
                placeholder={t('customers.searchPlaceholder')}
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
            </Box>
          </Box>
        </Card.Header>
        <Card.Body>
          {loading ? (
            <Text color="neutral-textDisabled">{t('common.loading')}</Text>
          ) : customers.length === 0 ? (
            <Text color="neutral-textDisabled">{t('common.noData')}</Text>
          ) : (
            <Box display="flex" flexDirection="column" gap="4">
              <Box style={{ overflowX: 'auto' }}>
                <Table>
                  <Table.Head>
                    <Table.Row>
                      <SortableHeader
                        label={t('customers.email')}
                        field="email"
                        sortBy={sortBy}
                        sortDir={sortDir}
                        onSort={handleSort}
                      />
                      <SortableHeader
                        label={t('customers.points')}
                        field="pointsBalance"
                        sortBy={sortBy}
                        sortDir={sortDir}
                        onSort={handleSort}
                      />
                      <Table.Cell as="th">
                        <Text fontWeight="bold" fontSize="caption">
                          {t('customers.couponsUsed')}
                        </Text>
                      </Table.Cell>
                      <SortableHeader
                        label={t('customers.createdAt')}
                        field="createdAt"
                        sortBy={sortBy}
                        sortDir={sortDir}
                        onSort={handleSort}
                      />
                    </Table.Row>
                  </Table.Head>
                  <Table.Body>
                    {customers.map((c) => (
                      <Table.Row key={c.id}>
                        <Table.Cell>{c.email || '—'}</Table.Cell>
                        <Table.Cell>{c.pointsBalance}</Table.Cell>
                        <Table.Cell>{c.couponsUsed}</Table.Cell>
                        <Table.Cell>{formatDate(c.createdAt)}</Table.Cell>
                      </Table.Row>
                    ))}
                  </Table.Body>
                </Table>
              </Box>

              {meta.totalPages > 1 && (
                <Box display="flex" justifyContent="center">
                  <Pagination
                    activePage={meta.page}
                    pageCount={meta.totalPages}
                    onPageChange={handlePageChange}
                  />
                </Box>
              )}
            </Box>
          )}
        </Card.Body>
      </Card>

      <Card>
        <Card.Header>
          <Title as="h3">{t('customers.redemptionsTitle')}</Title>
        </Card.Header>
        <Card.Body>
          {redemptions.length === 0 ? (
            <Text color="neutral-textDisabled">{t('common.noData')}</Text>
          ) : (
            <Box display="flex" flexDirection="column" gap="4">
              <Box style={{ overflowX: 'auto' }}>
                <Table>
                  <Table.Head>
                    <Table.Row>
                      <Table.Cell as="th">
                        <Text fontWeight="bold" fontSize="caption">
                          {t('customers.email')}
                        </Text>
                      </Table.Cell>
                      <Table.Cell as="th">
                        <Text fontWeight="bold" fontSize="caption">
                          {t('customers.redemptionsNote')}
                        </Text>
                      </Table.Cell>
                      <Table.Cell as="th">
                        <Text fontWeight="bold" fontSize="caption">
                          {t('customers.redemptionsPoints')}
                        </Text>
                      </Table.Cell>
                      <Table.Cell as="th">
                        <Text fontWeight="bold" fontSize="caption">
                          {t('customers.createdAt')}
                        </Text>
                      </Table.Cell>
                    </Table.Row>
                  </Table.Head>
                  <Table.Body>
                    {redemptions.map((r) => (
                      <Table.Row key={r.id}>
                        <Table.Cell>{r.email || '—'}</Table.Cell>
                        <Table.Cell>{r.note || '—'}</Table.Cell>
                        <Table.Cell>{r.points}</Table.Cell>
                        <Table.Cell>{formatDate(r.createdAt)}</Table.Cell>
                      </Table.Row>
                    ))}
                  </Table.Body>
                </Table>
              </Box>

              {redemptionsMeta.totalPages > 1 && (
                <Box display="flex" justifyContent="center">
                  <Pagination
                    activePage={redemptionsMeta.page}
                    pageCount={redemptionsMeta.totalPages}
                    onPageChange={setRedemptionsPage}
                  />
                </Box>
              )}
            </Box>
          )}
        </Card.Body>
      </Card>
    </Box>
  );
}
