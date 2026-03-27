import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useNexo } from './providers/NexoProvider.jsx';
import { useProfile } from './hooks/useProfile.js';
import Layout from './components/Layout.jsx';
import LoadingState from './components/LoadingState.jsx';
import TermsPage from './pages/TermsPage.jsx';
import BillingPage from './pages/BillingPage.jsx';
import Onboarding from './pages/Onboarding.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Settings from './pages/Settings.jsx';

export default function App() {
  const { store, billingStatus, termsAccepted, setTermsAccepted, loading: nexoLoading } = useNexo();
  const { profile, loading: profileLoading, hasProfile, refetch: refetchProfile } = useProfile();

  if (nexoLoading || profileLoading) {
    return <LoadingState />;
  }

  // Gate 1: Terms
  if (termsAccepted === false) {
    return (
      <TermsPage
        onAccepted={() => setTermsAccepted(true)}
      />
    );
  }

  // Gate 2: Billing
  if (billingStatus && billingStatus.hasAccess === false) {
    return <BillingPage locked />;
  }

  // Gate 3: Onboarding
  if (!hasProfile) {
    return <Onboarding onComplete={refetchProfile} />;
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="settings" element={<Settings />} />
        <Route path="billing" element={<BillingPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
