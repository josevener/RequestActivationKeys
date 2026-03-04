import type { AxiosError } from "axios";
import {
  ArrowLeft,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import api from "../api/axios";
import { useAuth } from "../context/AuthContext";

type PendingRequest = {
  RequestId: number;
  DaysTrial: number;
  EmployeeCount: number;
  IsPermanent: boolean;
  IsUnlimitedEmployeeCount: boolean;
  OptimizationDate: string | null;
  SystemEdition: string | null;
  Status?: string | null;
  FilingStatusId?: number;
};

type PaginationInfo = {
  page: number;
  page_size: number;
  total_items: number;
  total_pages: number;
  has_prev: boolean;
  has_next: boolean;
};

type PendingRequestsResponse = {
  items: PendingRequest[];
  pagination: PaginationInfo;
};

type BannerState = {
  type: "success" | "error";
  message: string;
};

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
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

function booleanText(value: boolean) {
  return value ? "Yes" : "No";
}

function normalizeResponse(
  payload: PendingRequestsResponse | PendingRequest[],
  fallbackPage: number,
  fallbackPageSize: number
): PendingRequestsResponse {
  if (Array.isArray(payload)) {
    return {
      items: payload,
      pagination: {
        page: fallbackPage,
        page_size: fallbackPageSize,
        total_items: payload.length,
        total_pages: 1,
        has_prev: false,
        has_next: false,
      },
    };
  }

  const items = Array.isArray(payload.items) ? payload.items : [];
  const p = payload.pagination || ({} as PaginationInfo);

  const page = Number.isInteger(p.page) && p.page > 0 ? p.page : fallbackPage;
  const pageSize = Number.isInteger(p.page_size) && p.page_size > 0 ? p.page_size : fallbackPageSize;
  const totalItems = Number.isInteger(p.total_items) && p.total_items >= 0 ? p.total_items : items.length;
  const totalPages = Number.isInteger(p.total_pages) && p.total_pages > 0 ? p.total_pages : 1;

  return {
    items,
    pagination: {
      page,
      page_size: pageSize,
      total_items: totalItems,
      total_pages: totalPages,
      has_prev: p.has_prev ?? page > 1,
      has_next: p.has_next ?? page < totalPages,
    },
  };
}

function PendingRequestsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const selectedRequestIdParam = searchParams.get("request_id");
  const selectedRequestNo = searchParams.get("request_no");
  const selectedClient = searchParams.get("client");
  const selectedRequestId =
    selectedRequestIdParam &&
    !Number.isNaN(Number.parseInt(selectedRequestIdParam, 10)) &&
    Number.parseInt(selectedRequestIdParam, 10) > 0
      ? Number.parseInt(selectedRequestIdParam, 10)
      : null;

  const [rows, setRows] = useState<PendingRequest[]>([]);
  const [selectedRequestIds, setSelectedRequestIds] = useState<number[]>([]);

  const [page, setPage] = useState(DEFAULT_PAGE);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [banner, setBanner] = useState<BannerState | null>(null);
  const [isProcessingApprove, setIsProcessingApprove] = useState(false);

  const fetchRows = useCallback(
    async (nextPage: number, nextPageSize: number, silent = false) => {
      try {
        if (silent) {
          setIsRefreshing(true);
        } 
        else {
          setLoading(true);
        }

        setLoadError("");

        const response = await api.get<PendingRequestsResponse | PendingRequest[]>(
          "/api/activation-key-requests",
          {
            params: {
              status: "all",
              page: nextPage,
              page_size: nextPageSize,
              ...(selectedRequestId ? { request_id: selectedRequestId } : {}),
            },
          }
        );

        const normalized = normalizeResponse(response.data, nextPage, nextPageSize);

        setRows(normalized.items);
        setSelectedRequestIds([]);
        setPage(normalized.pagination.page);
        setPageSize(normalized.pagination.page_size);
        setTotalItems(normalized.pagination.total_items);
        setTotalPages(normalized.pagination.total_pages);
      } 
      catch (errorValue) {
        const axiosError = errorValue as AxiosError<{ message?: string }>;
        setLoadError(axiosError.response?.data?.message || "Failed to load pending requests");
      } 
      finally {
        if (silent) {
          setIsRefreshing(false);
        } 
        else {
          setLoading(false);
        }
      }
    },
    [selectedRequestId]
  );

  useEffect(() => {
    void fetchRows(DEFAULT_PAGE, DEFAULT_PAGE_SIZE);
  }, [fetchRows, selectedRequestId]);

  const approveRequests = async (requestIds: number[]) => {
    if (requestIds.length === 0 || isProcessingApprove || loading || isRefreshing) {
      return;
    }

    try {
      setIsProcessingApprove(true);
      setBanner(null);

      await api.post("/api/activation-key-requests/approve", {
        request_ids: requestIds,
      });

      setBanner({
        type: "success",
        message: `Approved ${requestIds.length} request(s) successfully.`,
      });

      await fetchRows(page, pageSize, true);
    } 
    catch (errorValue) {
      const axiosError = errorValue as AxiosError<{ message?: string }>;
      setBanner({
        type: "error",
        message: axiosError.response?.data?.message || "Failed to approve request(s)",
      });
    } 
    finally {
      setIsProcessingApprove(false);
    }
  };

  const selectedSet = useMemo(() => new Set(selectedRequestIds), [selectedRequestIds]);
  const approvableSelectedIds = useMemo(
    () =>
      rows
        .filter((row) => selectedSet.has(row.RequestId) && row.FilingStatusId === 1)
        .map((row) => row.RequestId),
    [rows, selectedSet]
  );

  const allSelected = useMemo(() => {
    if (rows.length === 0 || selectedRequestIds.length !== rows.length) {
      return false;
    }

    return rows.every((row) => selectedSet.has(row.RequestId));
  }, [rows, selectedRequestIds.length, selectedSet]);

  const disableActions = isProcessingApprove || loading || isRefreshing;

  const showingFrom = rows.length === 0 ? 0 : (page - 1) * pageSize + 1;
  const showingTo = rows.length === 0 ? 0 : (page - 1) * pageSize + rows.length;

  const toggleSelectAll = () => {
    if (disableActions) {
      return;
    }

    if (allSelected) {
      setSelectedRequestIds([]);
      return;
    }

    setSelectedRequestIds(rows.map((row) => row.RequestId));
  };

  const toggleSelectRow = (requestId: number) => {
    if (disableActions) {
      return;
    }

    setSelectedRequestIds((current) => {
      if (current.includes(requestId)) {
        return current.filter((value) => value !== requestId);
      }

      return [...current, requestId];
    });
  };

  const handleRefresh = () => {
    void fetchRows(page, pageSize, true);
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

    setPage(DEFAULT_PAGE);
    setPageSize(nextPageSize);
    void fetchRows(DEFAULT_PAGE, nextPageSize, true);
  };

  return (
    <div className="h-screen overflow-hidden bg-gradient-to-b from-slate-50 to-slate-100">
      <div className="mx-auto flex h-full w-full max-w-7xl flex-col gap-3 p-3 md:gap-4 md:p-4">
        <Card className="shrink-0 gap-3 border-slate-200">
          <CardHeader className="pb-0">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              
              {/* LEFT SIDE */}
              <div className="flex flex-col gap-2">
                
                {/* Back + Title Row */}
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => navigate("/requests")}
                    disabled={disableActions}
                  >
                    <ArrowLeft className="size-4" />
                  </Button>

                  <CardTitle className="text-base font-semibold text-slate-900 md:text-lg">
                    Activation Key Requests
                  </CardTitle>
                </div>

                {/* Description */}
                <CardDescription className="text-xs md:text-sm">
                  {selectedRequestId
                    ? `Request ${selectedRequestNo || selectedRequestId} - ${selectedClient || "Selected Client"}`
                    : "Review all request activation keys across companies."}
                </CardDescription>
              </div>

              {/* RIGHT SIDE ACTIONS */}
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  onClick={() => {
                    void approveRequests(approvableSelectedIds);
                  }}
                  disabled={disableActions || approvableSelectedIds.length === 0}
                  className="gap-2"
                >
                  {isProcessingApprove ? (
                    <Spinner className="size-4" />
                  ) : (
                    <CheckCheck className="size-4" />
                  )}
                  {isProcessingApprove ? "Processing" : "Approve Selected"}
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  onClick={handleRefresh}
                  disabled={disableActions}
                  className="gap-2"
                >
                  {isRefreshing ? (
                    <Spinner className="size-4" />
                  ) : (
                    <RefreshCw className="size-4" />
                  )}
                  Refresh
                </Button>
              </div>

            </div>
          </CardHeader>

          <CardContent className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">Total: {totalItems}</Badge>
            <Badge variant="outline">Selected: {selectedRequestIds.length}</Badge>
            <Badge variant="outline">
              Page: {page} / {Math.max(1, totalPages)}
            </Badge>
            <Badge variant="outline" className="gap-1">
              <ShieldCheck className="size-3" />
              {user?.displayName || user?.username || "User"}
            </Badge>
          </CardContent>
        </Card>

        {loadError ? (
          <Alert variant="destructive" className="shrink-0">
            <AlertTitle>Load Failed</AlertTitle>
            <AlertDescription>{loadError}</AlertDescription>
          </Alert>
        ) : null}

        {banner ? (
          <Alert
            variant={banner.type === "error" ? "destructive" : "default"}
            className={
              banner.type === "success"
                ? "shrink-0 border-emerald-200 bg-emerald-50 text-emerald-900"
                : "shrink-0"
            }
          >
            <AlertTitle>{banner.type === "error" ? "Approval Failed" : "Success"}</AlertTitle>
            <AlertDescription>{banner.message}</AlertDescription>
          </Alert>
        ) : null}

        <Card className="flex min-h-0 flex-1 flex-col overflow-hidden border-slate-200">
          <CardContent className="flex min-h-0 flex-1 flex-col p-0">
            <div className="min-h-0 flex-1 overflow-auto">
              {loading && rows.length === 0 ? (
                <div className="flex h-full items-center justify-center gap-2 p-4 text-sm text-muted-foreground">
                  <Spinner />
                  Loading activation key requests...
                </div>
              ) : !loadError && rows.length === 0 ? (
                <div className="flex h-full items-center justify-center p-4 text-sm text-muted-foreground">
                  No activation key request records.
                </div>
              ) : (
                <table className="w-full min-w-[860px] border-collapse text-sm md:min-w-[980px]">
                  <thead>
                    <tr className="text-slate-600">
                      <th className="sticky top-0 z-10 bg-slate-100 px-3 py-3 text-left font-medium md:px-4">
                        <input
                          type="checkbox"
                          checked={allSelected}
                          onChange={toggleSelectAll}
                          disabled={disableActions}
                          className="size-4 accent-slate-900"
                        />
                      </th>
                      <th className="sticky top-0 z-10 bg-slate-100 px-3 py-3 text-left font-medium md:px-4">
                        Status
                      </th>
                      <th className="sticky top-0 z-10 bg-slate-100 px-3 py-3 text-left font-medium md:px-4">
                        DaysTrial
                      </th>
                      <th className="sticky top-0 z-10 bg-slate-100 px-3 py-3 text-left font-medium md:px-4">
                        EmployeeCount
                      </th>
                      <th className="sticky top-0 z-10 bg-slate-100 px-3 py-3 text-left font-medium md:px-4">
                        IsPermanent
                      </th>
                      <th className="sticky top-0 z-10 bg-slate-100 px-3 py-3 text-left font-medium md:px-4">
                        IsUnlimitedEmployeeCount
                      </th>
                      <th className="sticky top-0 z-10 bg-slate-100 px-3 py-3 text-left font-medium md:px-4">
                        OptimizationDate
                      </th>
                      <th className="sticky top-0 z-10 bg-slate-100 px-3 py-3 text-left font-medium md:px-4">
                        SystemEdition
                      </th>
                      <th className="sticky top-0 z-10 bg-slate-100 px-3 py-3 text-left font-medium md:px-4">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => {
                      const checked = selectedSet.has(row.RequestId);

                      return (
                        <tr key={row.RequestId} className="border-t border-slate-100 hover:bg-slate-50">
                          <td className="px-3 py-3 md:px-4">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleSelectRow(row.RequestId)}
                              disabled={disableActions}
                              className="size-4 accent-slate-900"
                            />
                          </td>
                          <td className="px-3 py-3 text-slate-800 md:px-4">{row.Status || "-"}</td>
                          <td className="px-3 py-3 text-slate-800 md:px-4">{row.DaysTrial}</td>
                          <td className="px-3 py-3 text-slate-800 md:px-4">{row.EmployeeCount}</td>
                          <td className="px-3 py-3 md:px-4">
                            <Badge variant={row.IsPermanent ? "secondary" : "outline"}>
                              {booleanText(row.IsPermanent)}
                            </Badge>
                          </td>
                          <td className="px-3 py-3 md:px-4">
                            <Badge variant={row.IsUnlimitedEmployeeCount ? "secondary" : "outline"}>
                              {booleanText(row.IsUnlimitedEmployeeCount)}
                            </Badge>
                          </td>
                          <td className="px-3 py-3 text-slate-700 md:px-4">
                            {formatDate(row.OptimizationDate)}
                          </td>
                          <td className="px-3 py-3 text-slate-700 md:px-4">{row.SystemEdition || "-"}</td>
                          <td className="px-3 py-3 md:px-4">
                            <Button
                              type="button"
                              size="sm"
                              disabled={disableActions || row.FilingStatusId !== 1}
                              onClick={() => {
                                void approveRequests([row.RequestId]);
                              }}
                              className="gap-2"
                            >
                              {isProcessingApprove ? <Spinner className="size-4" /> : null}
                              {row.FilingStatusId === 1 ? "Approve" : "Read Only"}
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            <div className="flex shrink-0 flex-col gap-2 border-t border-slate-100 px-3 py-3 md:flex-row md:items-center md:justify-between md:px-4">
              <p className="text-xs text-muted-foreground">
                Showing {showingFrom}-{showingTo} of {totalItems}
              </p>

              <div className="flex flex-wrap items-center gap-2">
                <label className="text-xs text-muted-foreground" htmlFor="page-size">
                  Rows
                </label>
                <select
                  id="page-size"
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
                <span className="min-w-24 text-center text-xs text-muted-foreground">
                  Page {page} / {Math.max(1, totalPages)}
                </span>
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

export default PendingRequestsPage;
