import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { AnnouncerProvider } from './a11y'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AnnouncerProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </AnnouncerProvider>
  </StrictMode>,
)
