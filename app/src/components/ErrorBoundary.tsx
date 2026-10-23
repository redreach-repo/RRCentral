import { Component, type ErrorInfo, type ReactNode } from 'react'
import { reportError } from '../lib/errorReporting'

type State = { failed: boolean }

/** Shows a calm message instead of a blank page when a screen crashes, and reports the crash. */
export default class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    void reportError('crash', { message: error.message || 'Screen crashed', details: `${error.stack || ''}\n${info.componentStack || ''}` })
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div role="alert" style={{ padding: 24, color: 'rgba(255,255,255,0.85)', maxWidth: 480 }}>
        <h1 style={{ fontSize: 20 }}>Something went wrong on this page</h1>
        <p style={{ color: 'rgba(255,255,255,0.6)', lineHeight: 1.5 }}>
          It has been reported. Reload to try again; your saved work is safe.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{ padding: '10px 18px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.2)', background: 'transparent', color: 'inherit', cursor: 'pointer' }}
        >
          Reload
        </button>
      </div>
    )
  }
}
