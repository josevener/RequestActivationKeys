import * as React from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

type SheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  overlayClassName?: string;
};

type SheetContentProps = {
  children: React.ReactNode;
  className?: string;
  showClose?: boolean;
  showHandle?: boolean;
  onOpenChange?: (open: boolean) => void;
};

function Sheet({ open, onOpenChange, children, overlayClassName }: SheetProps) {
  if (!open) {
    return null;
  }

  return createPortal(
    <div
      className={cn("fixed inset-0 z-[80] bg-slate-900/45", overlayClassName)}
      onClick={() => onOpenChange(false)}
      aria-hidden="true"
    >
      {children}
    </div>,
    document.body
  );
}

function SheetContent({
  children,
  className,
  showClose = true,
  showHandle = true,
  onOpenChange,
}: SheetContentProps) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      className={cn(
        "absolute inset-x-0 bottom-0 flex h-[56vh] flex-col overflow-hidden rounded-t-xl border border-slate-200 bg-white shadow-xl md:h-[70vh]",
        className
      )}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
        {showHandle ? <div className="mx-auto h-1.5 w-12 rounded-full bg-slate-200" /> : <div />}
        {showClose ? (
          <button
            type="button"
            className="absolute right-2 top-2 inline-flex size-7 cursor-pointer items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-700"
            onClick={() => onOpenChange?.(false)}
            aria-label="Close sheet"
          >
            <X className="size-4" />
          </button>
        ) : null}
      </div>
      {children}
    </div>
  );
}

function SheetHeader({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("space-y-1 border-b border-slate-100 px-3 py-2", className)}>{children}</div>;
}

function SheetTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return <h3 className={cn("text-sm font-semibold text-slate-900", className)}>{children}</h3>;
}

function SheetDescription({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <p className={cn("text-xs text-slate-600", className)}>{children}</p>;
}

export { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle };
