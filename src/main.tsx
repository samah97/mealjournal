import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router'
import { Toaster } from 'sonner'
import { UpdatePrompt } from './components/AppShell'
import { ConfirmProvider } from './components/ui/confirm'
import { requestPersistentStorage } from './lib/db'
import { captureInstallPrompt } from './lib/install'
import { router } from './router'
import './index.css'

captureInstallPrompt()

// Keep diary data from being evicted under storage pressure.
void requestPersistentStorage()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConfirmProvider>
      {/* Registers the service worker on every page – including sign-in – so Chrome can offer "Install app" before sign-in. */}
      <UpdatePrompt />
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
