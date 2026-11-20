import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { SharedReportView } from './components/SharedReportView.tsx'

// A single extra public route, checked before the authenticated app mounts
// at all — no router dependency for just one page. `/share/:id` opens a
// read-only report with no sign-in and none of the app's providers; every
// other path renders the normal app.
const shareMatch = window.location.pathname.match(/^\/share\/([^/]+)\/?$/)

const root = shareMatch ? (
  <SharedReportView id={decodeURIComponent(shareMatch[1])} />
) : (
  <App />
)

createRoot(document.getElementById('root')!).render(
  <StrictMode>{root}</StrictMode>,
)
