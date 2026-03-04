import { Button } from "@/components/ui/button";

export type ActionResultRow = {
  line_no: number;
  value: string;
  warning: string;
  state: string;
};

type ActionResultDialogProps = {
  open: boolean;
  title: string;
  description?: string;
  rows: ActionResultRow[];
  onClose: () => void;
};

function ActionResultDialog({
  open,
  title,
  description,
  rows,
  onClose,
}: ActionResultDialogProps) {
  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/45 p-3"
      onClick={onClose}
      aria-hidden="true"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="flex max-h-[88vh] w-full max-w-4xl flex-col border border-slate-200 bg-white shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-slate-200 px-3 py-2 md:px-4">
          <h3 className="text-sm font-semibold text-slate-900 md:text-base">{title}</h3>
          {description ? <p className="mt-1 text-xs text-slate-600">{description}</p> : null}
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          {rows.length === 0 ? (
            <div className="p-4 text-xs text-slate-600">No detail rows returned.</div>
          ) : (
            <table className="w-full min-w-[560px] border-collapse text-xs">
              <thead>
                <tr className="text-left text-slate-700">
                  <th className="sticky top-0 z-10 bg-slate-100 px-3 py-2 font-medium">Line No</th>
                  <th className="sticky top-0 z-10 bg-slate-100 px-3 py-2 font-medium">Value</th>
                  <th className="sticky top-0 z-10 bg-slate-100 px-3 py-2 font-medium">Warning</th>
                  <th className="sticky top-0 z-10 bg-slate-100 px-3 py-2 font-medium">State</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={`${row.line_no}-${row.value}-${row.state}`} className="border-t border-slate-100">
                    <td className="px-3 py-2 align-top text-slate-700">{row.line_no}</td>
                    <td className="px-3 py-2 align-top text-slate-700">{row.value || "-"}</td>
                    <td className="px-3 py-2 align-top text-slate-700">{row.warning || "-"}</td>
                    <td className="px-3 py-2 align-top text-slate-700">{row.state || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="flex justify-end border-t border-slate-200 px-3 py-2 md:px-4">
          <Button type="button" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}

export { ActionResultDialog };
