import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

type LoadingStateProps = {
  show: boolean;
  message?: string;
  className?: string;
  contentClassName?: string;
};

function LoadingState({
  show,
  message = "Loading...",
  className,
  contentClassName,
}: LoadingStateProps) {
  if (!show) {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "absolute inset-0 z-50 flex items-center justify-center bg-slate-100/70 backdrop-blur-[1px]",
        className
      )}
    >
      <div
        className={cn(
          "flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 shadow-sm",
          contentClassName
        )}
      >
        <Spinner className="size-4" />
        <span>{message}</span>
      </div>
    </div>
  );
}

export { LoadingState };
