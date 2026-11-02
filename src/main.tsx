import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router'
import { Toaster } from 'sonner'
import { ConfirmProvider } from './components/ui/confirm'
import { requestPersistentStorage } from './lib/db'
import { captureInstallPrompt } from './lib/install'
import { processPendingRevocations } from './lib/share/api'
import { isSharingConfigured } from './lib/share/supabase'
import { router } from './router'
import './index.css'

captureInstallPrompt()

// Keep diary data from being evicted under storage pressure.
void requestPersistentStorage()

// Revocations requested while offline are sent as soon as we're back online.
if (isSharingConfigured()) {
  void processPendingRevocations()
  window.addEventListener('online', () => void processPendingRevocations())
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConfirmProvider>
      <RouterProvider router={router} />
      <Toaster
        position="top-center"
        offset="max(16px, env(safe-area-inset-top))"
        toastOptions={{
          className: '!rounded-2xl !border-line !bg-surface !text-ink !shadow-float !font-sans',
        }}
      />
    </ConfirmProvider>
  </StrictMode>,
)
