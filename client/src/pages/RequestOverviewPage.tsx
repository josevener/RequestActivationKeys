import type { AxiosError } from "axios";
import { ChevronLeft, ChevronRight, LogOut, RefreshCw, SquareArrowOutUpRight } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import api from "../api/axios";
import { useAuth } from "@/context/AuthContext";

type SummaryRow = {
  RequestId: number;
  RequestNo: string | null;
  Client: string | null;
  ServerLicenseType: string | null;
  AddOns: string | null;
  Date: string | null;
  CreatedBy: string | null;
  CreationDate: string | null;
  ModifiedBy: string | null;
  ModificationDate: string | null;
  Status: string | null;
};

type PaginationInfo = {
  page: number;
  page_size: number;
  total_items: number;
  total_pages: number;
  has_prev: boolean;
  has_next: boolean;
};

type SummaryResponse = {
  items: SummaryRow[];
  pagination: PaginationInfo;
};

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

function formatDate(value: string | null) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString();
}

function RequestOverviewPage() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [rows, setRows] = useState<SummaryRow[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState("");

  const fetchRows = useCallback(async (nextPage: number, nextPageSize: number, silent = false) => {
    try {
      if (silent) {
        setIsRefreshing(true);
      } else {
        setLoading(true);
      }

      setError("");

      const response = await api.get<SummaryResponse>("/api/activation-key-requests/summary", {
        params: {
          page: nextPage,
          page_size: nextPageSize,
        },
      });

      const payload = response.data;
      const items = Array.isArray(payload.items) ? payload.items : [];
      const pagination = payload.pagination || {
        page: nextPage,
        page_size: nextPageSize,
        total_items: items.length,
        total_pages: 1,
      };

      setRows(items);
      setPage(pagination.page);
      setPageSize(pagination.page_size);
      setTotalItems(pagination.total_items);
      setTotalPages(pagination.total_pages);
    } catch (errorValue) {
      const axiosError = errorValue as AxiosError<{ message?: string }>;
      setError(axiosError.response?.data?.message || "Failed to load request overview");
    } finally {
      if (silent) {
        setIsRefreshing(false);
      } else {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void fetchRows(1, 20);
  }, [fetchRows]);

  const disableActions = loading || isRefreshing;
  const showingFrom = rows.length === 0 ? 0 : (page - 1) * pageSize + 1;
  const showingTo = rows.length === 0 ? 0 : (page - 1) * pageSize + rows.length;

  const openActivationKeys = (row: SummaryRow) => {
    const params = new URLSearchParams({
      request_id: String(row.RequestId),
      request_no: row.RequestNo || "",
      client: row.Client || "",
    });

    navigate(`/requests/activation-keys?${params.toString()}`);
  };

  const handlePageChange = (nextPage: number) => {
    if (disableActions) {
      return;
    }

    const boundedPage = Math.max(1, Math.min(totalPages, nextPage));
    if (boundedPage === page) {
      return;
    }

    setPage(boundedPage);
    void fetchRows(boundedPage, pageSize, true);
  };

  const handlePageSizeChange = (nextPageSize: number) => {
    if (disableActions) {
      return;
    }

    setPage(1);
    setPageSize(nextPageSize);
    void fetchRows(1, nextPageSize, true);
  };

  const pageLabel = useMemo(() => `${page} / ${Math.max(1, totalPages)}`, [page, totalPages]);

  return (
    <div className="h-screen overflow-hidden bg-gradient-to-b from-slate-50 to-slate-100">
      <div className="mx-auto flex h-full w-full max-w-7xl flex-col gap-3 p-3 md:gap-4 md:p-4">
        <Card className="shrink-0 border-slate-200">
          <CardHeader className="pb-2">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <CardTitle className="text-lg text-slate-900 md:text-xl">Request Activation Keys</CardTitle>
                <CardDescription className="mt-1 text-xs md:text-sm">
                  Open activation key requests for the selected record.
                </CardDescription>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    void fetchRows(page, pageSize, true);
                  }}
                  disabled={disableActions}
                  className="gap-2 cursor-pointer"
                >
                  {isRefreshing ? <Spinner className="size-4" /> : <RefreshCw className="size-4" />}
                  Refresh
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  onClick={logout}
                  disabled={disableActions}
                  className="gap-2 text-white bg-red-500 hover:bg-red-600 hover:text-white cursor-pointer"
                >
                  <LogOut className="size-4" />
                  Logout
                </Button>
              </div>
            </div>
          </CardHeader>
        </Card>

        {error ? (
          <Alert variant="destructive" className="shrink-0">
            <AlertTitle>Load Failed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <Card className="flex min-h-0 flex-1 flex-col overflow-hidden border-slate-200">
          <CardContent className="flex min-h-0 flex-1 flex-col p-0">
            <div className="min-h-0 flex-1 overflow-auto">
              {loading && rows.length === 0 ? (
                <div className="flex h-full items-center justify-center gap-2 p-4 text-sm text-muted-foreground">
                  <Spinner />
                  Loading request overview...
                </div>
              ) : rows.length === 0 ? (
                <div className="flex h-full items-center justify-center p-4 text-sm text-muted-foreground">
                  No request records found.
                </div>
              ) : (
                <table className="w-full min-w-[1360px] border-collapse text-sm">
                  <thead>
                    <tr className="text-slate-600">
                      <th className="sticky top-0 z-10 bg-slate-100 px-3 py-3 text-left font-medium md:px-4">
                      </th>
                      <th className="sticky top-0 z-10 bg-slate-100 px-3 py-3 text-left font-medium md:px-4">
                        Request No
                      </th>
                      <th className="sticky top-0 z-10 bg-slate-100 px-3 py-3 text-left font-medium md:px-4">
                        Client
                      </th>
                      <th className="sticky top-0 z-10 bg-slate-100 px-3 py-3 text-left font-medium md:px-4">
                        Server License / Type
                      </th>
                      <th className="sticky top-0 z-10 bg-slate-100 px-3 py-3 text-left font-medium md:px-4">
                        Add Ons
                      </th>
                      <th className="sticky top-0 z-10 bg-slate-100 px-3 py-3 text-left font-medium md:px-4">
                        Date
                      </th>
                      <th className="sticky top-0 z-10 bg-slate-100 px-3 py-3 text-left font-medium md:px-4">
                        Created By
                      </th>
                      <th className="sticky top-0 z-10 bg-slate-100 px-3 py-3 text-left font-medium md:px-4">
                        Creation Date
                      </th>
                      <th className="sticky top-0 z-10 bg-slate-100 px-3 py-3 text-left font-medium md:px-4">
                        Modified By
                      </th>
                      <th className="sticky top-0 z-10 bg-slate-100 px-3 py-3 text-left font-medium md:px-4">
                        Modification Date
                      </th>
                      <th className="sticky top-0 z-10 bg-slate-100 px-3 py-3 text-left font-medium md:px-4">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.RequestId} className="border-t border-slate-100 hover:bg-slate-50">
                        <td className="px-3 py-3 md:px-4">
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="outline"
                            className="h-8 w-8 cursor-pointer"
                            aria-label={`Open activation keys for request ${row.RequestNo || row.RequestId}`}
                            title="Open activation keys"
                            onClick={() => openActivationKeys(row)}
                          >
                            <SquareArrowOutUpRight className="size-4" />
                          </Button>
                        </td>
                        <td className="px-3 py-3 text-slate-800 md:px-4">{row.RequestNo || "-"}</td>
                        <td className="px-3 py-3 text-slate-800 md:px-4">{row.Client || "-"}</td>
                        <td className="px-3 py-3 text-slate-700 md:px-4">{row.ServerLicenseType || "-"}</td>
                        <td className="px-3 py-3 text-slate-700 md:px-4">{row.AddOns || "-"}</td>
                        <td className="px-3 py-3 text-slate-700 md:px-4">{formatDate(row.Date)}</td>
                        <td className="px-3 py-3 text-slate-700 md:px-4">{row.CreatedBy || "-"}</td>
                        <td className="px-3 py-3 text-slate-700 md:px-4">{formatDate(row.CreationDate)}</td>
                        <td className="px-3 py-3 text-slate-700 md:px-4">{row.ModifiedBy || "-"}</td>
                        <td className="px-3 py-3 text-slate-700 md:px-4">{formatDate(row.ModificationDate)}</td>
                        <td className="px-3 py-3 text-slate-800 md:px-4">{row.Status || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="flex shrink-0 flex-col gap-2 border-t border-slate-100 px-3 py-3 md:flex-row md:items-center md:justify-between md:px-4">
              <p className="text-xs text-muted-foreground">
                Showing {showingFrom}-{showingTo} of {totalItems}
              </p>

              <div className="flex flex-wrap items-center gap-2">
                <label className="text-xs text-muted-foreground" htmlFor="request-overview-page-size">
                  Rows
                </label>
                <select
                  id="request-overview-page-size"
                  value={pageSize}
                  onChange={(event) => handlePageSizeChange(Number.parseInt(event.target.value, 10))}
                  disabled={disableActions}
                  className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                >
                  {PAGE_SIZE_OPTIONS.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(page - 1)}
                  disabled={disableActions || page <= 1}
                  className="gap-1"
                >
                  <ChevronLeft className="size-4" />
                  Prev
                </Button>
                <span className="min-w-20 text-center text-xs text-muted-foreground">Page {pageLabel}</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(page + 1)}
                  disabled={disableActions || page >= totalPages}
                  className="gap-1"
                >
                  Next
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default RequestOverviewPage;
