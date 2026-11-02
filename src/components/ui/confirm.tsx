import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import { Button } from './Button'
import { Sheet } from './Sheet'

interface ConfirmOptions {
  title: string
  message?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
}

const ConfirmContext = createContext<(o: ConfirmOptions) => Promise<boolean>>(async () => false)

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null)
  const resolver = useRef<(v: boolean) => void>(undefined)

  const confirm = useCallback((o: ConfirmOptions) => {
    setOptions(o)
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve
    })
  }, [])

  const close = (v: boolean) => {
    resolver.current?.(v)
    resolver.current = undefined
    setOptions(null)
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Sheet
        open={!!options}
        onOpenChange={(o) => !o && close(false)}
        title={options?.title ?? ''}
        size="sm"
        footer={
          <div className="flex gap-2.5">
            <Button variant="secondary" block onClick={() => close(false)}>
              {options?.cancelLabel ?? 'Cancel'}
            </Button>
            <Button variant={options?.danger ? 'danger' : 'primary'} block onClick={() => close(true)} autoFocus>
              {options?.confirmLabel ?? 'Confirm'}
            </Button>
          </div>
        }
      >
        {options?.message && <div className="text-[0.9375rem] leading-relaxed text-ink-2">{options.message}</div>}
      </Sheet>
    </ConfirmContext.Provider>
  )
}

export function useConfirm() {
  return useContext(ConfirmContext)
}
