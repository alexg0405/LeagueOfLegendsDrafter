import { Fragment, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Analytics } from '@vercel/analytics/react'
import { App } from './App'
import { ErrorBoundary } from './ErrorBoundary'
import './index.css'
import './App.css'

const root = document.getElementById('root')
if (!root) {
  throw new Error('no #root')
}

const isWeb = import.meta.env.VITE_NEXUS_WEB === '1'

createRoot(root).render(
  <StrictMode>
    <ErrorBoundary>
      <Fragment>
        <App />
        {isWeb ? <Analytics /> : null}
      </Fragment>
    </ErrorBoundary>
  </StrictMode>
)
