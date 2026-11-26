"use client";

import { useCallback, useEffect, useState } from "react";
import { Toast, type ToastState } from "./toast";

export function useToast() {
  const [toast, setToast] = useState<ToastState | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(t);
  }, [toast]);
  const notify = useCallback((title: string, message = "") => setToast({ title, message }), []);
  const view = <Toast toast={toast} onClose={() => setToast(null)} />;
  return { notify, view };
}
