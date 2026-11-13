import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { ErrorFallback } from '../pages/SystemPages';

type Props = { children: ReactNode };
type State = { failed: boolean; requestId: string };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false, requestId: 'client-render' };

  static getDerivedStateFromError(): State {
    return { failed: true, requestId: `client_${Date.now().toString(36)}` };
  }

  componentDidCatch(error: Error, _info: ErrorInfo): void {
    // The request identifier is displayed to help correlate the client-side failure report.
    console.error('VerifyMart view failed', { requestId: this.state.requestId, message: error.message });
  }

  render(): ReactNode {
    if (this.state.failed) {
      return <ErrorFallback requestId={this.state.requestId} onRetry={() => this.setState({ failed: false, requestId: 'client-render' })} />;
    }
    return this.props.children;
  }
}
