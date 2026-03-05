import type { AxiosError } from "axios";
import {
  ChevronLeft,
  ChevronRight,
  LogOut,
  Menu,
  RefreshCw,
  Search,
  SquareArrowOutUpRight,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { LoadingState } from "@/components/ui/loading-state";
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

type SummaryFilterOptionsResponse = {
  client?: string[];
};

type SearchByValue =
  | "request_no"
  | "client"
  | "server_license_type"
  | "add_ons"
  | "status"
  | "created_by"
  | "modified_by"
  | "all";

type PageSizeOption = 50 | 100 | 500 | 1000 | "all";

type DateRangePresetValue =
  | "all_dates_1990_2099"
  | "current_date"
  | "current_week"
  | "current_month"
  | "current_year"
  | "previous_date"
  | "previous_week"
  | "previous_month"
  | "previous_year"
  | "last_7_days"
  | "last_30_days"
  | "last_3_months"
  | "last_6_months"
  | "last_12_months"
  | "custom_date";

const PAGE_SIZE_OPTIONS: Array<{ value: PageSizeOption; label: string }> = [
  { value: 50, label: "50" },
  { value: 100, label: "100" },
  { value: 500, label: "500" },
  { value: 1000, label: "1000" },
  { value: "all", label: "Load All" },
];
const DEFAULT_SEARCH_BY: SearchByValue = "request_no";
const DEFAULT_DATE_RANGE_PRESET: DateRangePresetValue = "last_3_months";
const DEFAULT_PAGE_SIZE_OPTION: PageSizeOption = 50;

const SEARCH_BY_OPTIONS: Array<{ value: SearchByValue; label: string }> = [
  { value: "request_no", label: "Request No" },
  { value: "client", label: "Client" },
  { value: "server_license_type", label: "Server License Type" },
  { value: "add_ons", label: "Add Ons" },
  { value: "status", label: "Status" },
  { value: "created_by", label: "Created By" },
  { value: "modified_by", label: "Modified By" },
  { value: "all", label: "All Fields" },
];

const DATE_RANGE_OPTIONS: Array<{ value: DateRangePresetValue; label: string }> = [
  { value: "all_dates_1990_2099", label: "All Dates" },
  { value: "current_date", label: "Current Date" },
  { value: "current_week", label: "Current Week" },
  { value: "current_month", label: "Current Month" },
  { value: "current_year", label: "Current Year" },
  { value: "previous_date", label: "Previous Date" },
  { value: "previous_week", label: "Previous Week" },
  { value: "previous_month", label: "Previous Month" },
  { value: "previous_year", label: "Previous Year" },
  { value: "last_7_days", label: "Last 7 Days" },
  { value: "last_30_days", label: "Last 30 Days" },
  { value: "last_3_months", label: "Last 3 Months" },
  { value: "last_6_months", label: "Last 6 Months" },
  { value: "last_12_months", label: "Last 12 Months" },
  { value: "custom_date", label: "Custom Date" },
];

const isDateRangePresetValue = (value: string | null): value is DateRangePresetValue =>
  DATE_RANGE_OPTIONS.some((option) => option.value === value);

const parseIsoDate = (value: string | null) => {
  if (!value) {
    return "";
  }

  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
};

const toIsoDate = (value: Date) => {
  const local = new Date(value);
  local.setHours(0, 0, 0, 0);
  const year = local.getFullYear();
  const month = String(local.getMonth() + 1).padStart(2, "0");
  const day = String(local.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const addDays = (value: Date, days: number) => {
  const next = new Date(value);
  next.setDate(next.getDate() + days);
  return next;
};

const addMonths = (value: Date, months: number) => {
  const next = new Date(value);
  next.setMonth(next.getMonth() + months);
  return next;
};

const getStartOfWeek = (value: Date) => {
  const day = value.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  return addDays(value, offset);
};

const getEndOfWeek = (value: Date) => addDays(getStartOfWeek(value), 6);

const getStartOfMonth = (value: Date) => new Date(value.getFullYear(), value.getMonth(), 1);
const getEndOfMonth = (value: Date) => new Date(value.getFullYear(), value.getMonth() + 1, 0);
const getStartOfYear = (value: Date) => new Date(value.getFullYear(), 0, 1);
const getEndOfYear = (value: Date) => new Date(value.getFullYear(), 11, 31);

const getPresetDateRange = (preset: DateRangePresetValue): { from: string; to: string } | null => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  switch (preset) {
    case "all_dates_1990_2099":
      return { from: "1990-01-01", to: "2099-12-31" };
    case "current_date":
      return { from: toIsoDate(today), to: toIsoDate(today) };
    case "current_week": {
      const from = getStartOfWeek(today);
      const to = getEndOfWeek(today);
      return { from: toIsoDate(from), to: toIsoDate(to) };
    }
    case "current_month": {
      const from = getStartOfMonth(today);
      const to = getEndOfMonth(today);
      return { from: toIsoDate(from), to: toIsoDate(to) };
    }
    case "current_year": {
      const from = getStartOfYear(today);
      const to = getEndOfYear(today);
      return { from: toIsoDate(from), to: toIsoDate(to) };
    }
    case "previous_date": {
      const previous = addDays(today, -1);
      return { from: toIsoDate(previous), to: toIsoDate(previous) };
    }
    case "previous_week": {
      const previousWeekDate = addDays(today, -7);
      const from = getStartOfWeek(previousWeekDate);
      const to = getEndOfWeek(previousWeekDate);
      return { from: toIsoDate(from), to: toIsoDate(to) };
    }
    case "previous_month": {
      const previousMonthDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const from = getStartOfMonth(previousMonthDate);
      const to = getEndOfMonth(previousMonthDate);
      return { from: toIsoDate(from), to: toIsoDate(to) };
    }
    case "previous_year": {
      const previousYearDate = new Date(today.getFullYear() - 1, 0, 1);
      const from = getStartOfYear(previousYearDate);
      const to = getEndOfYear(previousYearDate);
      return { from: toIsoDate(from), to: toIsoDate(to) };
    }
    case "last_7_days":
      return { from: toIsoDate(addDays(today, -6)), to: toIsoDate(today) };
    case "last_30_days":
      return { from: toIsoDate(addDays(today, -29)), to: toIsoDate(today) };
    case "last_3_months":
      return { from: toIsoDate(addMonths(today, -3)), to: toIsoDate(today) };
    case "last_6_months":
      return { from: toIsoDate(addMonths(today, -6)), to: toIsoDate(today) };
    case "last_12_months":
      return { from: toIsoDate(addMonths(today, -12)), to: toIsoDate(today) };
    case "custom_date":
    default:
      return null;
  }
};

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
  const [searchParams, setSearchParams] = useSearchParams();
  const { logout } = useAuth();
  const [initialQuery] = useState(() => {
    const initialDateRangePreset = isDateRangePresetValue(searchParams.get("date_preset"))
      ? (searchParams.get("date_preset") as DateRangePresetValue)
      : DEFAULT_DATE_RANGE_PRESET;
    const presetDateRange = getPresetDateRange(initialDateRangePreset);
    const initialDateFromParam = parseIsoDate(searchParams.get("date_from"));
    const initialDateToParam = parseIsoDate(searchParams.get("date_to"));
    const initialDateFrom = initialDateFromParam || presetDateRange?.from || "";
    const initialDateTo = initialDateToParam || presetDateRange?.to || "";

    return {
      initialDateRangePreset,
      initialDateFrom,
      initialDateTo,
    };
  });

  const [rows, setRows] = useState<SummaryRow[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(Number(DEFAULT_PAGE_SIZE_OPTION));
  const [pageSizeOption, setPageSizeOption] = useState<PageSizeOption>(DEFAULT_PAGE_SIZE_OPTION);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const [searchBy, setSearchBy] = useState<SearchByValue>(DEFAULT_SEARCH_BY);
  const [searchText, setSearchText] = useState("");
  const [clientFilter, setClientFilter] = useState("all");
  const [dateRangePreset, setDateRangePreset] = useState<DateRangePresetValue>(initialQuery.initialDateRangePreset);
  const [dateFrom, setDateFrom] = useState(initialQuery.initialDateFrom);
  const [dateTo, setDateTo] = useState(initialQuery.initialDateTo);
  const [clientOptions, setClientOptions] = useState<string[]>([]);

  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [searchPanelOpen, setSearchPanelOpen] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);
  const [isLoadAllDialogOpen, setIsLoadAllDialogOpen] = useState(false);

  const updateOverviewUrl = useCallback(
    (
      nextDatePreset: DateRangePresetValue,
      nextDateFrom: string,
      nextDateTo: string
    ) => {
      const nextParams = new URLSearchParams();
      nextParams.set("date_preset", nextDatePreset);

      if (nextDateFrom) {
        nextParams.set("date_from", nextDateFrom);
      }

      if (nextDateTo) {
        nextParams.set("date_to", nextDateTo);
      }

      setSearchParams(nextParams, { replace: true });
    },
    [setSearchParams]
  );

  const buildSummaryParams = useCallback(
    (
      nextPage: number,
      nextPageSize: PageSizeOption,
      nextSearchBy: SearchByValue,
      nextSearchText: string,
      nextClient: string,
      nextDateFrom: string,
      nextDateTo: string
    ) => ({
      page: nextPage,
      page_size: nextPageSize,
      search_by: nextSearchBy,
      ...(nextSearchText.trim() ? { search_text: nextSearchText.trim() } : {}),
      ...(nextClient && nextClient !== "all" ? { client: nextClient } : {}),
      ...(nextDateFrom ? { date_from: nextDateFrom } : {}),
      ...(nextDateTo ? { date_to: nextDateTo } : {}),
    }),
    []
  );

  const fetchRows = useCallback(
    async (
      nextPage: number,
      nextPageSize: PageSizeOption,
      nextSearchBy: SearchByValue,
      nextSearchText: string,
      nextClient: string,
      nextDateFrom: string,
      nextDateTo: string,
      silent = false
    ) => {
      try {
        if (silent) {
          setIsRefreshing(true);
        } 
        else {
          setLoading(true);
        }

        setError("");

        const response = await api.get<SummaryResponse>("/api/activation-key-requests/summary", {
          params: buildSummaryParams(
            nextPage,
            nextPageSize,
            nextSearchBy,
            nextSearchText,
            nextClient,
            nextDateFrom,
            nextDateTo
          ),
        });

        const payload = response.data;
        const items = Array.isArray(payload.items) ? payload.items : [];
        const pagination = payload.pagination || {
          page: nextPage,
          page_size: nextPageSize === "all" ? items.length : nextPageSize,
          total_items: items.length,
          total_pages: 1,
        };

        setRows(items);
        setPage(pagination.page);
        setPageSize(pagination.page_size);
        setTotalItems(pagination.total_items);
        setTotalPages(pagination.total_pages);
      } 
      catch (errorValue) {
        const axiosError = errorValue as AxiosError<{ message?: string }>;
        setError(axiosError.response?.data?.message || "Failed to load request overview");
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
    [buildSummaryParams]
  );

  const fetchClientOptions = useCallback(async () => {
    try {
      const response = await api.get<SummaryFilterOptionsResponse>(
        "/api/activation-key-requests/summary/filter-options"
      );
      const clients = Array.isArray(response.data?.client)
        ? response.data.client.filter((value): value is string => Boolean(value && value.trim()))
        : [];
      setClientOptions(clients);
    } 
    catch (_error) {
      setClientOptions([]);
    }
  }, []);

  useEffect(() => {
    void fetchRows(
      1,
      DEFAULT_PAGE_SIZE_OPTION,
      DEFAULT_SEARCH_BY,
      "",
      "all",
      initialQuery.initialDateFrom,
      initialQuery.initialDateTo
    );
  }, [fetchRows, initialQuery]);

  useEffect(() => {
    void fetchClientOptions();
  }, [fetchClientOptions]);

  const disableActions = loading || isRefreshing || isNavigating;
  const showingFrom = rows.length === 0 ? 0 : (page - 1) * pageSize + 1;
  const showingTo = rows.length === 0 ? 0 : (page - 1) * pageSize + rows.length;

  const openActivationKeys = (row: SummaryRow) => {
    setIsNavigating(true);
    const params = new URLSearchParams({
      request_id: String(row.RequestId),
      request_no: row.RequestNo || "",
      client: row.Client || "",
    });

    navigate(`/requests/activation-keys?${params.toString()}`);
  };

  const handleSearch = () => {
    if (disableActions) {
      return;
    }

    if (dateFrom && dateTo && dateFrom > dateTo) {
      setError("From date must be on or before To date");
      return;
    }

    setPage(1);
    void fetchRows(1, pageSizeOption, searchBy, searchText, clientFilter, dateFrom, dateTo, true);
  };

  const handleClearSearch = () => {
    if (disableActions) {
      return;
    }

    const defaultRange = getPresetDateRange(DEFAULT_DATE_RANGE_PRESET);
    const nextDateFrom = defaultRange?.from || "";
    const nextDateTo = defaultRange?.to || "";

    setSearchBy(DEFAULT_SEARCH_BY);
    setSearchText("");
    setClientFilter("all");
    setPageSizeOption(DEFAULT_PAGE_SIZE_OPTION);
    setDateRangePreset(DEFAULT_DATE_RANGE_PRESET);
    setDateFrom(nextDateFrom);
    setDateTo(nextDateTo);
    setPage(1);
    void fetchRows(
      1,
      DEFAULT_PAGE_SIZE_OPTION,
      DEFAULT_SEARCH_BY,
      "",
      "all",
      nextDateFrom,
      nextDateTo,
      true
    );
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
    void fetchRows(
      boundedPage,
      pageSizeOption,
      searchBy,
      searchText,
      clientFilter,
      dateFrom,
      dateTo,
      true
    );
  };

  const handlePageSizeChange = (nextPageSize: PageSizeOption) => {
    if (disableActions) {
      return;
    }

    if (nextPageSize === "all") {
      setIsLoadAllDialogOpen(true);
      return;
    }

    setPage(1);
    setPageSizeOption(nextPageSize);
    void fetchRows(1, nextPageSize, searchBy, searchText, clientFilter, dateFrom, dateTo, true);
  };

  const confirmLoadAll = () => {
    if (disableActions) {
      return;
    }

    setIsLoadAllDialogOpen(false);
    setPage(1);
    setPageSizeOption("all");
    void fetchRows(1, "all", searchBy, searchText, clientFilter, dateFrom, dateTo, true);
  };

  const pageLabel = useMemo(() => `${page} / ${Math.max(1, totalPages)}`, [page, totalPages]);

  const handleDateRangePresetChange = (nextPreset: DateRangePresetValue) => {
    setDateRangePreset(nextPreset);
    const range = getPresetDateRange(nextPreset);

    if (range) {
      setDateFrom(range.from);
      setDateTo(range.to);
    }
  };

  useEffect(() => {
    updateOverviewUrl(dateRangePreset, dateFrom, dateTo);
  }, [dateFrom, dateRangePreset, dateTo, updateOverviewUrl]);

  return (
    <div className="relative h-screen overflow-hidden bg-gradient-to-b from-slate-50 to-slate-100">
      <div className="mx-auto flex h-full w-full flex-col gap-2">
        <Card className="m-0 shrink-0 rounded-none border-slate-200">
          <CardHeader className="m-0 sm:px-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <CardTitle className="text-sm leading-tight text-slate-900 sm:text-base md:text-lg">
                  Request Activation Keys
                </CardTitle>
                <CardDescription className="mt-1 text-[11px] sm:text-xs">
                  Search and open activation key requests for the selected record.
                </CardDescription>
              </div>

              <Button
                type="button"
                variant={searchPanelOpen ? "default" : "outline"}
                size="icon"
                className="h-8 w-8 shrink-0 cursor-pointer"
                aria-label={searchPanelOpen ? "Close search and actions panel" : "Open search and actions panel"}
                onClick={() => setSearchPanelOpen((prev) => !prev)}
              >
                {searchPanelOpen ? <X className="size-4" /> : <Menu className="size-4" />}
              </Button>
            </div>
          </CardHeader>

          <CardContent className={`${searchPanelOpen ? "block" : "hidden"} m-0 sm:px-3`}>
            <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  void fetchRows(
                    page,
                    pageSizeOption,
                    searchBy,
                    searchText,
                    clientFilter,
                    dateFrom,
                    dateTo,
                    true
                  );
                }}
                disabled={disableActions}
                className="h-8 w-full gap-1.5 text-xs sm:w-auto cursor-pointer"
              >
                {isRefreshing ? <Spinner className="size-3.5" /> : <RefreshCw className="size-3.5" />}
                Refresh
              </Button>

              <Button
                type="button"
                variant="ghost"
                onClick={logout}
                disabled={disableActions}
                className="h-8 w-full gap-1.5 bg-red-500 text-xs text-white hover:bg-red-600 hover:text-white sm:w-auto cursor-pointer"
              >
                <LogOut className="size-3.5" />
                Logout
              </Button>
            </div>

            <div className="text-xs font-medium text-slate-700">Filters</div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-[160px_minmax(0,1fr)_200px_170px_120px_120px_96px_96px]">
              <div className="sm:col-span-1">
                <label className="mb-1 block text-[11px] text-muted-foreground" htmlFor="search-by">
                  Field
                </label>
                <select
                  id="search-by"
                  value={searchBy}
                  onChange={(event) => setSearchBy(event.target.value as SearchByValue)}
                  className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                  disabled={disableActions}
                >
                  {SEARCH_BY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-1 lg:col-span-1">
                <label className="mb-1 block text-[11px] text-muted-foreground" htmlFor="search-text">
                  Search Text
                </label>
                <input
                  id="search-text"
                  value={searchText}
                  onChange={(event) => setSearchText(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      handleSearch();
                    }
                  }}
                  className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                  placeholder="Type value to search"
                  disabled={disableActions}
                />
              </div>

              <div className="sm:col-span-1">
                <label className="mb-1 block text-[11px] text-muted-foreground" htmlFor="date-range-preset">
                  Date Range
                </label>
                <select
                  id="date-range-preset"
                  value={dateRangePreset}
                  onChange={(event) => handleDateRangePresetChange(event.target.value as DateRangePresetValue)}
                  className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                  disabled={disableActions}
                >
                  {DATE_RANGE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-1">
                <label className="mb-1 block text-[11px] text-muted-foreground" htmlFor="client-filter">
                  Client
                </label>
                <select
                  id="client-filter"
                  value={clientFilter}
                  onChange={(event) => setClientFilter(event.target.value)}
                  className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                  disabled={disableActions}
                >
                  <option value="all">All Clients</option>
                  {clientOptions.map((client) => (
                    <option key={client} value={client}>
                      {client}
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-1">
                <label className="mb-1 block text-[11px] text-muted-foreground" htmlFor="date-from">
                  From
                </label>
                <input
                  id="date-from"
                  type="date"
                  value={dateFrom}
                  onChange={(event) => {
                    setDateRangePreset("custom_date");
                    setDateFrom(event.target.value);
                  }}
                  className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                  disabled={disableActions}
                />
              </div>

              <div className="sm:col-span-1">
                <label className="mb-1 block text-[11px] text-muted-foreground" htmlFor="date-to">
                  To
                </label>
                <input
                  id="date-to"
                  type="date"
                  value={dateTo}
                  onChange={(event) => {
                    setDateRangePreset("custom_date");
                    setDateTo(event.target.value);
                  }}
                  className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                  disabled={disableActions}
                />
              </div>

              <div className="self-end sm:col-span-1">
                <Button
                  type="button"
                  onClick={handleSearch}
                  disabled={disableActions}
                  className="h-8 w-full gap-1.5 text-xs cursor-pointer"
                >
                  <Search className="size-3.5" />
                  Search
                </Button>
              </div>

              <div className="self-end sm:col-span-1">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleClearSearch}
                  disabled={disableActions}
                  className="h-8 w-full gap-1.5 text-xs cursor-pointer"
                >
                  <X className="size-3.5" />
                  Clear
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {error ? (
          <Alert variant="destructive" className="shrink-0">
            <AlertTitle>Load Failed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <Card className="mb-2 flex min-h-0 flex-1 flex-col overflow-hidden rounded-none border-slate-200">
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
                <table className="w-full min-w-[1220px] border-collapse text-xs sm:text-sm">
                  <thead>
                    <tr className="text-slate-600">
                      <th className="sticky top-0 z-10 bg-slate-100 px-2 py-2 text-left font-medium sm:px-3" />
                      <th className="sticky top-0 z-10 bg-slate-100 px-2 py-2 text-left font-medium sm:px-3">
                        Request No
                      </th>
                      <th className="sticky top-0 z-10 bg-slate-100 px-2 py-2 text-left font-medium sm:px-3">
                        Client
                      </th>
                      <th className="sticky top-0 z-10 bg-slate-100 px-2 py-2 text-left font-medium sm:px-3">
                        Server License / Type
                      </th>
                      <th className="sticky top-0 z-10 bg-slate-100 px-2 py-2 text-left font-medium sm:px-3">
                        Add Ons
                      </th>
                      <th className="sticky top-0 z-10 bg-slate-100 px-2 py-2 text-left font-medium sm:px-3">
                        Date
                      </th>
                      <th className="sticky top-0 z-10 bg-slate-100 px-2 py-2 text-left font-medium sm:px-3">
                        Created By
                      </th>
                      <th className="sticky top-0 z-10 bg-slate-100 px-2 py-2 text-left font-medium sm:px-3">
                        Creation Date
                      </th>
                      <th className="sticky top-0 z-10 bg-slate-100 px-2 py-2 text-left font-medium sm:px-3">
                        Modified By
                      </th>
                      <th className="sticky top-0 z-10 bg-slate-100 px-2 py-2 text-left font-medium sm:px-3">
                        Modification Date
                      </th>
                      <th className="sticky top-0 z-10 bg-slate-100 px-2 py-2 text-left font-medium sm:px-3">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.RequestId} className="border-t border-slate-100 hover:bg-slate-50">
                        <td className="px-2 py-2 sm:px-3">
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="outline"
                            className="h-7 w-7 cursor-pointer"
                            aria-label={`Open activation keys for request ${row.RequestNo || row.RequestId}`}
                            title="Open activation keys"
                            onClick={() => openActivationKeys(row)}
                          >
                            <SquareArrowOutUpRight className="size-3.5 text-green-600" />
                          </Button>
                        </td>
                        <td className="px-2 py-2 text-slate-800 sm:px-3">{row.RequestNo || "-"}</td>
                        <td className="px-2 py-2 text-slate-800 sm:px-3">{row.Client || "-"}</td>
                        <td className="px-2 py-2 text-slate-700 sm:px-3">{row.ServerLicenseType || "-"}</td>
                        <td className="px-2 py-2 text-slate-700 sm:px-3">{row.AddOns || "-"}</td>
                        <td className="px-2 py-2 text-slate-700 sm:px-3">{formatDate(row.Date)}</td>
                        <td className="px-2 py-2 text-slate-700 sm:px-3">{row.CreatedBy || "-"}</td>
                        <td className="px-2 py-2 text-slate-700 sm:px-3">{formatDate(row.CreationDate)}</td>
                        <td className="px-2 py-2 text-slate-700 sm:px-3">{row.ModifiedBy || "-"}</td>
                        <td className="px-2 py-2 text-slate-700 sm:px-3">{formatDate(row.ModificationDate)}</td>
                        <td className="px-2 py-2 text-slate-800 sm:px-3">{row.Status || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="flex shrink-0 flex-col gap-1.5 border-t border-slate-100 sm:flex-row sm:items-center sm:justify-between px-3">
              <p className="text-[11px] text-muted-foreground">
                Showing {showingFrom}-{showingTo} of {totalItems}
              </p>

              <div className="flex flex-wrap items-center gap-1.5">
                <label className="text-[11px] text-muted-foreground" htmlFor="request-overview-page-size">
                  Rows
                </label>
                <select
                  id="request-overview-page-size"
                  value={String(pageSizeOption)}
                  onChange={(event) => {
                    const value = event.target.value;
                    const parsed =
                      value === "all" ? "all" : (Number.parseInt(value, 10) as Exclude<PageSizeOption, "all">);
                    handlePageSizeChange(parsed);
                  }}
                  disabled={disableActions}
                  className="h-7 rounded-md border border-input bg-background px-1.5 text-[11px]"
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
                  className="h-7 gap-1 px-1.5 text-[11px]"
                >
                  <ChevronLeft className="size-3.5" />
                  <span className="hidden sm:inline">Prev</span>
                </Button>
                <span className="min-w-14 text-center text-[11px] text-muted-foreground">Page {pageLabel}</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(page + 1)}
                  disabled={disableActions || page >= totalPages}
                  className="h-7 gap-1 px-1.5 text-[11px]"
                >
                  <span className="hidden sm:inline">Next</span>
                  <ChevronRight className="size-3.5" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      <LoadingState
        show={isRefreshing || isNavigating}
        message={isNavigating ? "Opening activation key requests..." : "Updating request list..."}
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
    </div>
  );
}

export default RequestOverviewPage;
