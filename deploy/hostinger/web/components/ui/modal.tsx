"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ModalProps {
  open: boolean;
  title: string;
  description?: string;
  children: ReactNode;
  onClose: () => void;
  className?: string;
}

export function Modal({ open, title, description, children, onClose, className }: ModalProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/65 p-3 backdrop-blur-sm sm:items-center">
      <section className={cn("glass-panel max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-lg p-4", className)}>
        <div className="mb-4 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold">{title}</h2>
            {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close dialog" title="Close dialog">
            <X className="h-4 w-4" />
          </Button>
        </div>
        {children}
      </section>
    </div>
  );
}
