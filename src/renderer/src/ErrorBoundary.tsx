import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = { children: ReactNode }
type State = { err: Error | null }

/**
 * Renders a visible error instead of a blank dark page when the UI throws during render.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(p: Props) {
    super(p)
    this.state = { err: null }
  }

  static getDerivedStateFromError(err: Error): State {
    return { err }
  }

  override componentDidCatch(err: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('[drafter] React render error', err, info.componentStack)
  }

  override render() {
    if (this.state.err) {
      return (
        <div
          className="boot-error"
          style={{ padding: 24, maxWidth: 640, color: '#f85149', lineHeight: 1.5, background: '#060f0c', minHeight: '100vh' }}
        >
          <h1 style={{ color: '#e6edf3', fontSize: '1.1rem', margin: '0 0 8px' }}>League Drafter — UI error</h1>
          <pre className="nexus-allow-select" style={{ whiteSpace: 'pre-wrap', fontSize: 12, color: '#c9d1d9' }}>
            {this.state.err.message}
          </pre>
          <p className="nexus-allow-select" style={{ color: '#8b949e', fontSize: 14 }}>
            If this persists, run from a terminal: <code style={{ color: '#58a6ff' }}>npm run dev</code> (project root) and
            check the DevTools console (<kbd>ctrl+shift+i</kbd> or View → Toggle Developer Tools).
          </p>
        </div>
      )
    }
    return this.props.children
  }
}
