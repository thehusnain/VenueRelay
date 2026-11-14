import { Component, type ReactNode } from 'react';

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="recovery-screen">
        <section>
          <h1>Let’s reopen Rally.</h1>
          <p>
            A screen could not be displayed. Saved event records and waiting changes have not been
            cleared.
          </p>
          <button className="button primary" onClick={() => location.reload()}>
            Reload Rally
          </button>
          <a href="/">Return to the start</a>
          <p className="field-hint">
            If this keeps happening, keep this device’s data and restart the app. Avoid clearing
            storage while changes are waiting.
          </p>
        </section>
      </main>
    );
  }
}
