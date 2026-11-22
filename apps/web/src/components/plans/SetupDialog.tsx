import { useRef, type ReactNode } from 'react';
import * as D from '@radix-ui/react-dialog';
import { X } from 'lucide-react';

export function SetupDialog({ open, onOpenChange, title, testId, children }: { open: boolean; onOpenChange: (o: boolean) => void; title: string; testId: string; children: ReactNode }) {
  const opener = useRef<HTMLElement | null>(null);
  const content = useRef<HTMLDivElement | null>(null);
  return <D.Root open={open} onOpenChange={onOpenChange}>
    <D.Portal>
      <D.Overlay className="pp-overlay" />
      <D.Content ref={content} className="pp-dialog" data-testid={testId} aria-describedby={undefined}
        onOpenAutoFocus={() => {
          const active = document.activeElement;
          if (active instanceof HTMLElement && !content.current?.contains(active)) opener.current = active;
        }}
        onCloseAutoFocus={event => { event.preventDefault(); opener.current?.focus(); }}>
        <div className="pp-dialog-head">
          <D.Title className="pp-dialog-title">{title}</D.Title>
          <D.Close className="icon-button" aria-label="Close dialog" data-testid={`${testId}-close`}><X size={18} /></D.Close>
        </div>
        <div className="pp-dialog-body">{children}</div>
      </D.Content>
    </D.Portal>
  </D.Root>;
}

export function NothingCharged() {
  return <p className="pp-charged" data-testid="text-nothing-charged">Payment processing is not configured. No checkout, payment, or subscription has been activated, and nothing is charged today.</p>;
}
