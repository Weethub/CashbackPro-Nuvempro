import React from 'react';
import { Box, Text, Title, Button, Alert } from '@nimbus-ds/components';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <Box
          display="flex"
          flexDirection="column"
          alignItems="center"
          justifyContent="center"
          height="100vh"
          gap="4"
          padding="4"
        >
          <Alert appearance="danger">
            <Title as="h3">Algo deu errado</Title>
            <Text>
              {this.state.error?.message || 'Um erro inesperado ocorreu.'}
            </Text>
          </Alert>
          <Button appearance="primary" onClick={this.handleReload}>
            Recarregar
          </Button>
        </Box>
      );
    }

    return this.props.children;
  }
}
