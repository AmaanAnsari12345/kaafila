"use client";

import { CheckCircle2, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface ToastState {
  title: string;
  message: string;
}

interface ToastProps {
  toast: ToastState | null;
  onClose: () => void;
}

export function Toast({ toast, onClose }: ToastProps) {
  if (!toast) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 w-[calc(100vw-2rem)] max-w-sm rounded-lg border border-primary/25 bg-[#101820]/95 p-4 shadow-glow backdrop-blur">
      <div className="flex items-start gap-3">
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="font-medium">{toast.title}</p>
          <p className="mt-1 text-sm text-muted-foreground">{toast.message}</p>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose} aria-label="Dismiss">
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
