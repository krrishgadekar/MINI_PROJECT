import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error caught by ErrorBoundary:", error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: undefined });
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="ui-error-boundary">
          <div className="ui-error-card">
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
              <AlertTriangle size={42} color="var(--risk-critical)" />
            </div>
            <h2 className="ui-error-title">Something went wrong</h2>
            <p className="ui-error-msg">
              {this.state.error?.message || "An unexpected error occurred in this view."}
            </p>
            <button
              onClick={this.handleReset}
              className="btn btn--primary"
              style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
            >
              <RefreshCw size={16} />
              Try Again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
