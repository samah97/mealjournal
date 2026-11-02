import { useSyncExternalStore } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferred: BeforeInstallPromptEvent | null = null
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())

/**
 * Must run early: Chrome fires `beforeinstallprompt` soon after load.
 * The event is kept for the Settings "Install" button but deliberately not
 * `preventDefault()`-ed – that would suppress Chrome's own install banner.
 */
export function captureInstallPrompt(): void {
  window.addEventListener('beforeinstallprompt', (e) => {
    deferred = e as BeforeInstallPromptEvent
    notify()
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    notify()
  })
}

export function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches
}

export function useInstallPrompt(): { canInstall: boolean; install: () => Promise<void>; installed: boolean } {
  const canInstall = useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => !!deferred,
  )
  return {
    canInstall,
    installed: isStandalone(),
    install: async () => {
      if (!deferred) return
      await deferred.prompt()
      await deferred.userChoice
      deferred = null
      notify()
    },
  }
}
