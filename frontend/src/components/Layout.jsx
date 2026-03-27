import React from 'react';
import { Outlet } from 'react-router-dom';
import { Box } from '@nimbus-ds/components';
import AppNav from './AppNav.jsx';

export default function Layout() {
  return (
    <Box display="flex" flexDirection="column" minHeight="100vh">
      <AppNav />
      <Box padding="4" flexGrow="1">
        <Outlet />
      </Box>
    </Box>
  );
}
