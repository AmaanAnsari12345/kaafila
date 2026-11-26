import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center rounded-md px-2 py-1 text-xs font-medium", {
  variants: {
    variant: {
      default: "bg-primary/15 text-primary ring-1 ring-primary/30",
      amber: "bg-amber-500/15 text-amber-300 ring-1 ring-amber-400/30",
      danger: "bg-rose-500/15 text-rose-300 ring-1 ring-rose-400/30",
      neutral: "bg-white/[0.08] text-muted-foreground ring-1 ring-white/10"
    }
  },
  defaultVariants: {
    variant: "default"
  }
});

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant, className }))} {...props} />;
}
