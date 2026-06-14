// Captures the Chromium `beforeinstallprompt` event at app startup so it is
// never missed — it fires once, early, often before the page that wants to
// surface an install button has mounted. The event is stashed at module scope
// and exposed through useInstallPrompt(); promptInstall() triggers the native
// dialog. Imported eagerly from main.tsx so the listener is attached on load.

import { useSyncExternalStore } from 'react'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferredPrompt: BeforeInstallPromptEvent | null = null
let installed = false

const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault() // suppress the mini-infobar; we surface our own UI
    deferredPrompt = e as BeforeInstallPromptEvent
    emit()
  })
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null
    installed = true
    emit()
  })
}

export const isIOS =
  typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent)

export const isStandalone = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true)

// Fires the native install dialog. Returns 'unavailable' when no prompt was
// captured (non-Chromium, already installed, or the event never fired).
export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  if (!deferredPrompt) return 'unavailable'
  await deferredPrompt.prompt()
  const { outcome } = await deferredPrompt.userChoice
  deferredPrompt = null // the event is single-use
  emit()
  return outcome
}

type Snapshot = { canInstall: boolean; installed: boolean }
let snapshot: Snapshot = { canInstall: false, installed: false }

const getSnapshot = (): Snapshot => {
  const canInstall = deferredPrompt !== null
  if (canInstall !== snapshot.canInstall || installed !== snapshot.installed) {
    snapshot = { canInstall, installed } // new ref only when it actually changes
  }
  return snapshot
}

const subscribe = (cb: () => void) => {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

// Reactive view of install availability. canInstall is true once Chromium has
// offered the prompt (and the app is not yet installed in this tab).
export function useInstallPrompt(): Snapshot {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
