import type { AxiosError } from "axios";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  ThumbsDown,
  ThumbsUp,
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
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { LoadingState } from "@/components/ui/loading-state";
import { Spinner } from "@/components/ui/spinner";
import { ActionResultDialog, type ActionResultRow } from "@/components/ui/action-result-dialog";
import api from "../api/axios";

type PendingRequest = {
  RequestId: number;
  RegisteredName: string | null;
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

type PendingSummary = {
  total_employee_count: number;
  total_company_count?: number;
};

type PendingRequestsResponse = {
  items: PendingRequest[];
  summary?: PendingSummary;
  pagination: PaginationInfo;
};

type ActionDetail = {
  line_no?: unknown;
  value?: unknown;
  warning?: unknown;
  state?: unknown;
};

type ActionApiResultItem = {
  request_id?: number;
  details?: ActionDetail[];
};

type ActionApiResponse = {
  message?: string;
  results?: ActionApiResultItem[];
};

type ActionErrorResponse = {
  message?: string;
  details?: ActionDetail[];
};

type PageSizeOption = 50 | 100 | 500 | 1000 | "all";

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE: Exclude<PageSizeOption, "all"> = 50;
const PAGE_SIZE_OPTIONS: Array<{ value: PageSizeOption; label: string }> = [
  { value: 50, label: "50" },
  { value: 100, label: "100" },
  { value: 500, label: "500" },
  { value: 1000, label: "1000" },
  { value: "all", label: "Load All" },
];

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

function textValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value);
}

function toActionResultRows(details: ActionDetail[] | undefined): ActionResultRow[] {
  if (!Array.isArray(details)) {
    return [];
  }

  return details.map((detail, index) => {
    const parsedLineNo = Number.parseInt(String(detail.line_no), 10);
    return {
      line_no: Number.isNaN(parsedLineNo) || parsedLineNo < 1 ? index + 1 : parsedLineNo,
      value: textValue(detail.value),
      warning: textValue(detail.warning),
      state: textValue(detail.state),
    };
  });
}

function flattenSuccessActionRows(payload: ActionApiResponse): ActionResultRow[] {
  if (!Array.isArray(payload.results)) {
    return [];
  }

  const rows: ActionResultRow[] = [];

  payload.results.forEach((result) => {
    const itemRows = toActionResultRows(result.details);
    itemRows.forEach((itemRow) => {
      rows.push({
        line_no: rows.length + 1,
        value: itemRow.value || (result.request_id ? `Request ID ${result.request_id}` : ""),
        warning: itemRow.warning,
        state: itemRow.state,
      });
    });
  });

  return rows;
}

function normalizeResponse(
  payload: PendingRequestsResponse | PendingRequest[],
  fallbackPage: number,
  fallbackPageSize: PageSizeOption
): PendingRequestsResponse {
  const fallbackPageSizeNumber =
    fallbackPageSize === "all"
      ? Array.isArray(payload)
        ? payload.length
        : DEFAULT_PAGE_SIZE
      : fallbackPageSize;

  if (Array.isArray(payload)) {
    const fallbackTotalEmployeeCount = payload.reduce(
      (sum, item) => sum + (Number(item.EmployeeCount) || 0),
      0
    );
    return {
      items: payload,
      summary: {
        total_employee_count: fallbackTotalEmployeeCount,
        total_company_count: 0,
      },
      pagination: {
        page: fallbackPage,
        page_size: fallbackPageSizeNumber,
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
  const pageSize = Number.isInteger(p.page_size) && p.page_size >= 0 ? p.page_size : fallbackPageSizeNumber;
  const totalItems = Number.isInteger(p.total_items) && p.total_items >= 0 ? p.total_items : items.length;
  const totalPages = Number.isInteger(p.total_pages) && p.total_pages > 0 ? p.total_pages : 1;
  const payloadTotalEmployeeCount = Number((payload.summary && payload.summary.total_employee_count) || 0);
  const payloadTotalCompanyCount = Number((payload.summary && payload.summary.total_company_count) || 0);

  return {
    items,
    summary: {
      total_employee_count: Number.isFinite(payloadTotalEmployeeCount) ? payloadTotalEmployeeCount : 0,
      total_company_count: Number.isFinite(payloadTotalCompanyCount) ? payloadTotalCompanyCount : 0,
    },
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
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  const [pageSizeOption, setPageSizeOption] = useState<PageSizeOption>(DEFAULT_PAGE_SIZE);
  const [totalItems, setTotalItems] = useState(0);
  const [totalEmployeeCount, setTotalEmployeeCount] = useState(0);
  const [totalCompanyCount, setTotalCompanyCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [actionResultRows, setActionResultRows] = useState<ActionResultRow[]>([]);
  const [actionResultTitle, setActionResultTitle] = useState("");
  const [actionResultDescription, setActionResultDescription] = useState("");
  const [isActionResultOpen, setIsActionResultOpen] = useState(false);
  const [processingAction, setProcessingAction] = useState<"approve" | "disapprove" | null>(null);
  const [isNavigating, setIsNavigating] = useState(false);
  const [isLoadAllDialogOpen, setIsLoadAllDialogOpen] = useState(false);

  const fetchRows = useCallback(
    async (nextPage: number, nextPageSize: PageSizeOption, silent = false) => {
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
        setTotalEmployeeCount(normalized.summary?.total_employee_count || 0);
        setTotalCompanyCount(normalized.summary?.total_company_count || 0);
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

  const processRequests = async (action: "approve" | "disapprove", requestIds: number[]) => {
    if (requestIds.length === 0 || processingAction || loading || isRefreshing) {
      return;
    }

    const endpoint = action === "approve" ? "/api/activation-key-requests/approve" : "/api/activation-key-requests/disapprove";
    const successTitle = action === "approve" ? "Approved" : "Disapproved";
    const failureTitle = action === "approve" ? "Approval Failed" : "Disapproval Failed";
    const failureMessage = action === "approve" ? "Failed to approve request(s)" : "Failed to disapprove request(s)";

    try {
      setProcessingAction(action);

      const response = await api.post<ActionApiResponse>(endpoint, {
        request_ids: requestIds,
      });
      const resultRows = flattenSuccessActionRows(response.data);

      setActionResultTitle(`${successTitle} Result`);
      setActionResultDescription(response.data?.message || `${successTitle} ${requestIds.length} request(s) successfully.`);
      setActionResultRows(
        resultRows.length > 0
          ? resultRows
          : [
              {
                line_no: 1,
                value: "",
                warning: `${successTitle} ${requestIds.length} request(s) successfully.`,
                state: "Done",
              },
            ]
      );
      setIsActionResultOpen(true);

      await fetchRows(page, pageSizeOption, true);
    } 
    catch (errorValue) {
      const axiosError = errorValue as AxiosError<ActionErrorResponse>;
      const resultRows = toActionResultRows(axiosError.response?.data?.details);
      const message = axiosError.response?.data?.message || failureMessage;

      setActionResultTitle(failureTitle);
      setActionResultDescription(message);
      setActionResultRows(
        resultRows.length > 0
          ? resultRows.map((row, index) => ({ ...row, line_no: index + 1 }))
          : [{ line_no: 1, value: "", warning: message, state: "Failed" }]
      );
      setIsActionResultOpen(true);
    } 
    finally {
      setProcessingAction(null);
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
  const disapprovableSelectedIds = approvableSelectedIds;

  const allSelected = useMemo(() => {
    if (rows.length === 0 || selectedRequestIds.length !== rows.length) {
      return false;
    }

    return rows.every((row) => selectedSet.has(row.RequestId));
  }, [rows, selectedRequestIds.length, selectedSet]);

  const disableActions = Boolean(processingAction) || loading || isRefreshing || isNavigating;

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
    void fetchRows(page, pageSizeOption, true);
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
    void fetchRows(boundedPage, pageSizeOption, true);
  };

  const handlePageSizeChange = (nextPageSize: PageSizeOption) => {
    if (disableActions) {
      return;
    }

    if (nextPageSize === "all") {
      setIsLoadAllDialogOpen(true);
      return;
    }

    setPage(DEFAULT_PAGE);
    setPageSizeOption(nextPageSize);
    void fetchRows(DEFAULT_PAGE, nextPageSize, true);
  };

  const confirmLoadAll = () => {
    if (disableActions) {
      return;
    }

    setIsLoadAllDialogOpen(false);
    setPage(DEFAULT_PAGE);
    setPageSizeOption("all");
    void fetchRows(DEFAULT_PAGE, "all", true);
  };

  return (
    <div className="relative h-screen overflow-hidden bg-gradient-to-b from-slate-50 to-slate-100">
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
                    onClick={() => {
                      setIsNavigating(true);
                      navigate("/requests");
                    }}
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
                    ? `Request No: ${selectedRequestNo || selectedRequestId} - ${selectedClient || "Selected Client"}`
                    : "Review all request activation keys across companies."}
                </CardDescription>
                <div className="text-xs font-medium text-slate-700">
                  {`Total Employee Count: ${totalEmployeeCount.toLocaleString()}`}
                  {totalCompanyCount > 0
                    ? ` across ${totalCompanyCount.toLocaleString()} compan${totalCompanyCount > 1 ? "ies" : "y"}`
                    : ""}
                </div>
              </div>

              {/* RIGHT SIDE ACTIONS */}
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  onClick={() => {
                    void processRequests("approve", approvableSelectedIds);
                  }}
                  disabled={disableActions || approvableSelectedIds.length === 0}
                  className="h-8 gap-1.5 px-2 text-xs"
                  aria-label="Approve selected"
                  title="Approve selected"
                >
                  {processingAction === "approve" ? (
                    <Spinner className="size-3.5" />
                  ) : (
                    <ThumbsUp className="size-3.5" />
                  )}
                  <span className="hidden sm:inline">
                    {processingAction === "approve" ? "Processing" : "Approve Selected"}
                  </span>
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    void processRequests("disapprove", disapprovableSelectedIds);
                  }}
                  disabled={disableActions || disapprovableSelectedIds.length === 0}
                  className="h-8 gap-1.5 px-2 text-xs border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800"
                  aria-label="Disapprove selected"
                  title="Disapprove selected"
                >
                  {processingAction === "disapprove" ? (
                    <Spinner className="size-3.5" />
                  ) : (
                    <ThumbsDown className="size-3.5" />
                  )}
                  <span className="hidden sm:inline">
                    {processingAction === "disapprove" ? "Processing" : "Disapprove Selected"}
                  </span>
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
          </CardContent>
        </Card>

        {loadError ? (
          <Alert variant="destructive" className="shrink-0">
            <AlertTitle>Load Failed</AlertTitle>
            <AlertDescription>{loadError}</AlertDescription>
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
                <table className="w-full min-w-[860px] border-collapse text-[11px] md:min-w-[980px]">
                  <thead>
                    <tr className="text-slate-600">
                      <th className="sticky top-0 z-10 bg-slate-100 px-2.5 py-2 text-left font-medium md:px-3">
                        <input
                          type="checkbox"
                          checked={allSelected}
                          onChange={toggleSelectAll}
                          disabled={disableActions}
                          className="size-4 accent-slate-900"
                        />
                      </th>
                      <th className="sticky top-0 z-10 bg-slate-100 px-2.5 py-2 text-left font-medium md:px-3">
                        Status
                      </th>
                      <th className="sticky top-0 z-10 bg-slate-100 px-2.5 py-2 text-left font-medium md:px-3">
                        Registered Name
                      </th>
                      <th className="sticky top-0 z-10 bg-slate-100 px-2.5 py-2 text-left font-medium md:px-3">
                        Trial Days
                      </th>
                      <th className="sticky top-0 z-10 bg-slate-100 px-2.5 py-2 text-left font-medium md:px-3">
                        Employee Count
                      </th>
                      <th className="sticky top-0 z-10 bg-slate-100 px-2.5 py-2 text-left font-medium md:px-3">
                        Is Permanent
                      </th>
                      <th className="sticky top-0 z-10 bg-slate-100 px-2.5 py-2 text-left font-medium md:px-3">
                        Unlimited Employees
                      </th>
                      <th className="sticky top-0 z-10 bg-slate-100 px-2.5 py-2 text-left font-medium md:px-3">
                        Optimization Date
                      </th>
                      <th className="sticky top-0 z-10 bg-slate-100 px-2.5 py-2 text-left font-medium md:px-3">
                        System Edition
                      </th>
                      <th className="sticky top-0 z-10 bg-slate-100 px-2.5 py-2 text-left font-medium md:px-3">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => {
                      const checked = selectedSet.has(row.RequestId);

                      return (
                        <tr key={row.RequestId} className="border-t border-slate-100 hover:bg-slate-50">
                          <td className="px-2.5 py-2 md:px-3">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleSelectRow(row.RequestId)}
                              disabled={disableActions}
                              className="size-4 accent-slate-900"
                            />
                          </td>
                          <td className="px-2.5 py-2 text-slate-800 md:px-3">{row.Status || "-"}</td>
                          <td className="px-2.5 py-2 text-slate-800 md:px-3">{row.RegisteredName || "-"}</td>
                          <td className="px-2.5 py-2 text-slate-800 md:px-3">{row.DaysTrial}</td>
                          <td className="px-2.5 py-2 text-slate-800 md:px-3">{row.EmployeeCount}</td>
                          <td className="px-2.5 py-2 md:px-3">
                            <Badge variant={row.IsPermanent ? "secondary" : "outline"}>
                              {booleanText(row.IsPermanent)}
                            </Badge>
                          </td>
                          <td className="px-2.5 py-2 md:px-3">
                            <Badge variant={row.IsUnlimitedEmployeeCount ? "secondary" : "outline"}>
                              {booleanText(row.IsUnlimitedEmployeeCount)}
                            </Badge>
                          </td>
                          <td className="px-2.5 py-2 text-slate-700 md:px-3">
                            {formatDate(row.OptimizationDate)}
                          </td>
                          <td className="px-2.5 py-2 text-slate-700 md:px-3">{row.SystemEdition || "-"}</td>
                          <td className="px-2.5 py-2 md:px-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <Button
                                type="button"
                                size="sm"
                                disabled={disableActions || row.FilingStatusId !== 1}
                                onClick={() => {
                                  void processRequests("approve", [row.RequestId]);
                                }}
                                className="h-7 gap-1 px-2 text-[11px]"
                                aria-label={`Approve request ${row.RequestId}`}
                                title="Approve"
                              >
                                {processingAction === "approve" ? (
                                  <Spinner className="size-3.5" />
                                ) : (
                                  <ThumbsUp className="size-3.5" />
                                )}
                                <span className="hidden sm:inline">Approve</span>
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={disableActions || row.FilingStatusId !== 1}
                                onClick={() => {
                                  void processRequests("disapprove", [row.RequestId]);
                                }}
                                className="h-7 gap-1 px-2 text-[11px] border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800"
                                aria-label={`Disapprove request ${row.RequestId}`}
                                title="Disapprove"
                              >
                                {processingAction === "disapprove" ? (
                                  <Spinner className="size-3.5" />
                                ) : (
                                  <ThumbsDown className="size-3.5" />
                                )}
                                <span className="hidden sm:inline">Disapprove</span>
                              </Button>
                            </div>
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
                  value={String(pageSizeOption)}
                  onChange={(event) => {
                    const value = event.target.value;
                    const parsed =
                      value === "all" ? "all" : (Number.parseInt(value, 10) as Exclude<PageSizeOption, "all">);
                    handlePageSizeChange(parsed);
                  }}
                  disabled={disableActions}
                  className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                >
                  {PAGE_SIZE_OPTIONS.map((option) => (
                    <option key={String(option.value)} value={String(option.value)}>
                      {option.label}
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
      <LoadingState
        show={isRefreshing || isNavigating || Boolean(processingAction)}
        message={
          isNavigating
            ? "Opening request overview..."
            : processingAction === "approve"
            ? "Processing approval..."
            : processingAction === "disapprove"
            ? "Processing disapproval..."
            : "Updating activation key requests..."
        }
      />
      <ConfirmDialog
        open={isLoadAllDialogOpen}
        title="Load all records?"
        description="This can take longer and may reduce browser performance for large result sets."
        confirmLabel="Load All"
        onConfirm={confirmLoadAll}
        onCancel={() => setIsLoadAllDialogOpen(false)}
        disabled={disableActions}
      />
      <ActionResultDialog
        open={isActionResultOpen}
        title={actionResultTitle}
        description={actionResultDescription}
        rows={actionResultRows}
        onClose={() => setIsActionResultOpen(false)}
      />
    </div>
  );
}

export default PendingRequestsPage;
