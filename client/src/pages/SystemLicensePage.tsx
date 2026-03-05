import type { AxiosError } from "axios";
import { ArrowLeft, PackagePlus, PanelRightClose, PanelRightOpen } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { LoadingState } from "@/components/ui/loading-state";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import api from "../api/axios";

type ClientDetails = {
  client_code: string | null;
  client_name: string | null;
  system: string | null;
  edition: string | null;
  server_license: string | null;
  server_id: string | null;
  request_code: string | null;
  key_type: string | null;
  is_unlimited_employee_count: boolean;
  is_no_database_needs_opt: boolean;
  employee_count: number;
  is_permanent: boolean;
  days_slow: number;
  days_trial: number;
};

type SelectedCompanyDetails = {
  code: string | null;
  name: string | null;
  registered_name: string | null;
  branch: string | null;
  tin: string | null;
  sss_no: string | null;
  hdmf_no: string | null;
  phic_no: string | null;
  tin_branch: string | null;
  sss_branch_code: string | null;
  hdmf_branch_code: string | null;
  phic_branch_code: string | null;
  registered_address: string | null;
  active: boolean;
  has_recruitment: boolean;
  has_webkiosk: boolean;
  allow_online_registration: boolean;
  is_system_auto_deactivate: boolean;
  allowable_temp_key_for_online_registration: number | null;
  remarks: string | null;
};

type LicensedCompany = {
  Id: number;
  RegisteredName: string | null;
  Branch: string | null;
  TIN: string | null;
  EmployeeCount: number;
  Edition: string | null;
  ServerLicense: string | null;
  IsPermanent: boolean;
  IsUnlimitedEmployeeCount: boolean;
  ESSEmployeeCount: number;
  IsESSUnlimitedEmployeeCount: boolean;
  HasWebkiosk: boolean;
  HasRecruitment: boolean;
  IsNoDatabaseNeedsOpt: boolean;
};

type SystemLicenseResponse = {
  detail_id: number;
  request_id: number;
  client_details: ClientDetails;
  selected_company_details: SelectedCompanyDetails;
  licensed_companies: {
    items: LicensedCompany[];
    summary: {
      total_employee_count: number;
      total_items: number;
    };
  };
};

const displayText = (value: unknown) => {
  if (value === null || value === undefined) {
    return "-";
  }

  const text = String(value).trim();
  return text.length > 0 ? text : "-";
};

const formatNumber = (value: unknown) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return "0";
  }

  return parsed.toLocaleString();
};

type ReadonlyFieldProps = {
  label: string;
  value: unknown;
};

function ReadonlyField({ label, value }: ReadonlyFieldProps) {
  const text = displayText(value);
  return (
    <div className="space-y-1">
      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <Input value={text} readOnly className="h-8 bg-slate-50 text-xs" title={text} />
    </div>
  );
}

type CheckboxFieldProps = {
  label: string;
  checked: boolean;
};

function CheckboxField({ label, checked }: CheckboxFieldProps) {
  return (
    <label className="flex items-center gap-2 text-xs text-slate-700">
      <input type="checkbox" checked={Boolean(checked)} readOnly disabled className="size-4 accent-slate-900" />
      {label}
    </label>
  );
}

function SystemLicensePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requestIdParam = searchParams.get("request_id");
  const detailIdParam = searchParams.get("detail_id");
  const requestNoParam = searchParams.get("request_no") || "";
  const clientParam = searchParams.get("client") || "";

  const requestId = Number.parseInt(String(requestIdParam || ""), 10);
  const detailId = Number.parseInt(String(detailIdParam || ""), 10);
  const hasValidRequestId = Number.isFinite(requestId) && requestId > 0;
  const hasValidDetailId = Number.isFinite(detailId) && detailId > 0;

  const [loading, setLoading] = useState(true);
  const [isNavigating, setIsNavigating] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<SystemLicenseResponse | null>(null);
  const [isLicensedSheetOpen, setIsLicensedSheetOpen] = useState(false);
  const [licensedSearch, setLicensedSearch] = useState("");

  useEffect(() => {
    if (!hasValidRequestId) {
      setError("Invalid request context");
      setLoading(false);
      return;
    }

    let mounted = true;
    const fetchData = async () => {
      try {
        setLoading(true);
        setError("");
        const response = await api.get<SystemLicenseResponse>("/api/activation_key_requests/system_license", {
          params: {
            request_id: requestId,
            ...(hasValidDetailId ? { detail_id: detailId } : {}),
          },
        });

        if (mounted) {
          setData(response.data);
        }
      } 
      catch (errorValue) {
        const axiosError = errorValue as AxiosError<{ message?: string }>;
        if (mounted) {
          setError(axiosError.response?.data?.message || "Failed to load system license");
        }
      } 
      finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    void fetchData();
    return () => {
      mounted = false;
    };
  }, [detailId, hasValidDetailId, hasValidRequestId, requestId]);

  useEffect(() => {
    // keep closed by default; user opens from edge trigger
    setIsLicensedSheetOpen(false);
  }, []);

  const licensedCompanies = data?.licensed_companies.items || [];
  const licensedSummary = data?.licensed_companies.summary;

  const filteredLicensedCompanies = useMemo(() => {
    const keyword = licensedSearch.trim().toLowerCase();
    if (!keyword) {
      return licensedCompanies;
    }

    return licensedCompanies.filter((row) =>
      [
        row.RegisteredName,
        row.Branch,
        row.TIN,
        row.Edition,
        row.ServerLicense,
      ]
        .map((value) => String(value || "").toLowerCase())
        .some((value) => value.includes(keyword))
    );
  }, [licensedCompanies, licensedSearch]);

  const totalLicensedEmployeeCount = useMemo(() => {
    if (licensedSearch.trim()) {
      return filteredLicensedCompanies.reduce((sum, row) => sum + (Number(row.EmployeeCount) || 0), 0);
    }

    if (licensedSummary?.total_employee_count !== undefined) {
      return Number(licensedSummary.total_employee_count) || 0;
    }

    return licensedCompanies.reduce((sum, row) => sum + (Number(row.EmployeeCount) || 0), 0);
  }, [filteredLicensedCompanies, licensedCompanies, licensedSearch, licensedSummary?.total_employee_count]);

  const handleBack = () => {
    if (!hasValidRequestId) {
      navigate("/requests/activation_keys");
      return;
    }

    setIsNavigating(true);
    const params = new URLSearchParams({
      request_id: String(requestId),
      request_no: requestNoParam,
      client: clientParam,
    });
    navigate(`/requests/activation_keys?${params.toString()}`);
  };

  const toggleLicensedSheetView = () => {
    setIsLicensedSheetOpen((previous) => !previous);
  };

  return (
    <div className="relative h-screen overflow-hidden bg-gradient-to-b from-slate-50 to-slate-100">
      <div className="mx-auto flex h-full w-full flex-col gap-2">
        <Card className="m-0 shrink-0 rounded-none border-slate-200">
          <CardHeader className="m-0 sm:px-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 flex-col gap-1">
                <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={handleBack}
                  disabled={isNavigating}
                  className="cursor-pointer"
                >
                  <ArrowLeft className="size-4" />
                </Button>
                <CardTitle className="text-sm text-slate-900 sm:text-base md:text-lg">System License</CardTitle>
              </div>
                <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-600">
                  <Badge variant="secondary" className="rounded-sm text-[11px]">
                    Request: {displayText(requestNoParam || data?.request_id)}
                  </Badge>
                  <Badge variant="outline" className="rounded-sm text-[11px]">
                    Client: {displayText(clientParam || data?.client_details.client_name)}
                  </Badge>
                  <Badge variant="outline" className="rounded-sm text-[11px]">
                    Total Employee Count: {formatNumber(totalLicensedEmployeeCount)}
                  </Badge>
                  <Badge variant="outline" className="rounded-sm text-[11px]">
                    Detail ID: {displayText(data?.detail_id)}
                  </Badge>
                </div>
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

        <div className="min-h-0 flex-1 overflow-auto">
          {loading ? (
            <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
              <Spinner />
              Loading system license...
            </div>
          ) : (
            <div className="grid gap-2 pb-2">
              <Card className="rounded-none border-slate-200 shadow-sm">
                <CardHeader className="px-3 py-2">
                  <CardTitle className="text-sm text-slate-900">Client Details</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-2 px-3 pb-3">
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    <ReadonlyField label="Client Code" value={data?.client_details.client_code} />
                    <ReadonlyField label="Client Name" value={data?.client_details.client_name} />
                    <ReadonlyField label="System" value={data?.client_details.system} />
                    <ReadonlyField label="Edition" value={data?.client_details.edition} />
                    <ReadonlyField label="Server License" value={data?.client_details.server_license} />
                    <ReadonlyField label="Server Id" value={data?.client_details.server_id} />
                    <ReadonlyField label="Request Code" value={data?.client_details.request_code} />
                    <ReadonlyField label="Key Type" value={data?.client_details.key_type} />
                    <ReadonlyField
                      label="Employee Count"
                      value={formatNumber(data?.client_details.employee_count || 0)}
                    />
                    <ReadonlyField label="No. of Trial Slow" value={data?.client_details.days_slow} />
                    <ReadonlyField label="No. of Trial Days" value={data?.client_details.days_trial} />
                  </div>

                  <div className="grid gap-2 rounded-md border border-slate-100 bg-slate-50/50 p-2 sm:grid-cols-2 lg:grid-cols-3">
                    <CheckboxField
                      label="Unlimited Employees"
                      checked={Boolean(data?.client_details.is_unlimited_employee_count)}
                    />
                    <CheckboxField
                      label="Remove DB Needs Optimization"
                      checked={Boolean(data?.client_details.is_no_database_needs_opt)}
                    />
                    <CheckboxField label="System Never Expires (Permanent)" checked={Boolean(data?.client_details.is_permanent)} />
                  </div>
                </CardContent>
              </Card>

              <Card className="rounded-none border-slate-200 shadow-sm">
                <CardHeader className="px-3 py-2">
                  <CardTitle className="text-sm text-slate-900">Selected Company Details</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-2 px-3 pb-3">
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    <ReadonlyField label="Code" value={data?.selected_company_details.code} />
                    <ReadonlyField label="Name" value={data?.selected_company_details.name} />
                    <ReadonlyField label="Registered Name" value={data?.selected_company_details.registered_name} />
                    <ReadonlyField label="Branch" value={data?.selected_company_details.branch} />
                    <ReadonlyField label="TIN" value={data?.selected_company_details.tin} />
                    <ReadonlyField label="SSS No" value={data?.selected_company_details.sss_no} />
                    <ReadonlyField label="HDMF No" value={data?.selected_company_details.hdmf_no} />
                    <ReadonlyField label="PHIC No" value={data?.selected_company_details.phic_no} />
                    <ReadonlyField label="TIN Branch Code" value={data?.selected_company_details.tin_branch} />
                    <ReadonlyField
                      label="SSS Branch Code"
                      value={data?.selected_company_details.sss_branch_code}
                    />
                    <ReadonlyField
                      label="HDMF Branch Code"
                      value={data?.selected_company_details.hdmf_branch_code}
                    />
                    <ReadonlyField
                      label="PHIC Branch Code"
                      value={data?.selected_company_details.phic_branch_code}
                    />
                  </div>

                  <ReadonlyField
                    label="Registered Address"
                    value={data?.selected_company_details.registered_address}
                  />

                  <div className="grid gap-2 rounded-md border border-slate-100 bg-slate-50/50 p-2 sm:grid-cols-2 lg:grid-cols-3">
                    <CheckboxField label="This license is active" checked={Boolean(data?.selected_company_details.active)} />
                    <CheckboxField
                      label="This license has Recruitment"
                      checked={Boolean(data?.selected_company_details.has_recruitment)}
                    />
                    <CheckboxField
                      label="This license has WebKiosk"
                      checked={Boolean(data?.selected_company_details.has_webkiosk)}
                    />
                    <CheckboxField
                      label="Allow Online Registration"
                      checked={Boolean(data?.selected_company_details.allow_online_registration)}
                    />
                    <CheckboxField
                      label="Deactivate automatically the system"
                      checked={Boolean(data?.selected_company_details.is_system_auto_deactivate)}
                    />
                  </div>

                  <ReadonlyField
                    label="No. of allowable temporary key(s) on online registration"
                    value={data?.selected_company_details.allowable_temp_key_for_online_registration}
                  />

                  <div className="flex flex-wrap items-center gap-2">
                    <Button type="button" variant="outline" className="h-8 cursor-pointer gap-1.5 text-xs">
                      <PackagePlus className="size-3.5" />
                      Generate Add Company Package
                    </Button>
                  </div>

                  <div className="space-y-1">
                    <div className="text-[11px] font-medium text-slate-600">Remarks</div>
                    <Textarea
                      value={displayText(data?.selected_company_details.remarks)}
                      readOnly
                      className="min-h-20 text-xs"
                    />
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>
      <Sheet
        open={isLicensedSheetOpen}
        onOpenChange={(open) => {
          setIsLicensedSheetOpen(open);
        }}
        overlayClassName="bg-slate-900/20 backdrop-blur-[1px]"
      >
        <SheetContent
          onOpenChange={(open) => {
            setIsLicensedSheetOpen(open);
          }}
          showHandle={false}
          className="!inset-0 !h-full !w-full !max-w-none !rounded-none"
        >
          <button
            type="button"
            onClick={toggleLicensedSheetView}
            className="absolute left-0 top-1/2 z-20 inline-flex h-12 w-8 -translate-y-1/2 items-center justify-center rounded-r-md border border-l-0 border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50 hover:text-slate-800 cursor-pointer"
            title="Close licensed companies"
            aria-label="Close licensed companies"
          >
            <PanelRightClose className="size-4 sm:size-5" />
          </button>
          <SheetHeader className="sticky top-0 z-20 bg-white">
            <SheetTitle>Licensed Company(ies)</SheetTitle>
            <SheetDescription>
              Opens full-screen from the right-side trigger on all screen sizes.
            </SheetDescription>
          </SheetHeader>
          <div className="sticky top-[53px] z-20 flex flex-wrap items-center gap-2 border-b border-slate-100 bg-white px-3 py-2">
            <Input
              value={licensedSearch}
              onChange={(event) => setLicensedSearch(event.target.value)}
              placeholder="Search registered name, branch, TIN, edition, server license"
              className="h-8 max-w-md text-xs"
            />
            <Badge variant="secondary" className="rounded-sm text-[11px]">
              Rows: {filteredLicensedCompanies.length}
            </Badge>
            <Badge variant="outline" className="rounded-sm text-[11px]">
              Total Employees: {formatNumber(totalLicensedEmployeeCount)}
            </Badge>
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            {filteredLicensedCompanies.length === 0 ? (
              <div className="flex h-full items-center justify-center p-4 text-sm text-muted-foreground">
                No licensed companies found.
              </div>
            ) : (
              <table className="w-full min-w-[1600px] border-collapse text-[11px]">
                <thead>
                  <tr className="text-slate-600">
                    <th className="sticky top-0 z-10 bg-slate-100 px-2.5 py-2 text-left font-medium">Registered Name</th>
                    <th className="sticky top-0 z-10 bg-slate-100 px-2.5 py-2 text-left font-medium">Branch</th>
                    <th className="sticky top-0 z-10 bg-slate-100 px-2.5 py-2 text-left font-medium">TIN</th>
                    <th className="sticky top-0 z-10 bg-slate-100 px-2.5 py-2 text-left font-medium">Employee Count</th>
                    <th className="sticky top-0 z-10 bg-slate-100 px-2.5 py-2 text-left font-medium">Edition</th>
                    <th className="sticky top-0 z-10 bg-slate-100 px-2.5 py-2 text-left font-medium">Server License</th>
                    <th className="sticky top-0 z-10 bg-slate-100 px-2.5 py-2 text-left font-medium">Permanent</th>
                    <th className="sticky top-0 z-10 bg-slate-100 px-2.5 py-2 text-left font-medium">Unlimited Employee</th>
                    <th className="sticky top-0 z-10 bg-slate-100 px-2.5 py-2 text-left font-medium">ESS Employee Count</th>
                    <th className="sticky top-0 z-10 bg-slate-100 px-2.5 py-2 text-left font-medium">ESS Unlimited Employee</th>
                    <th className="sticky top-0 z-10 bg-slate-100 px-2.5 py-2 text-left font-medium">Has WebKiosk</th>
                    <th className="sticky top-0 z-10 bg-slate-100 px-2.5 py-2 text-left font-medium">Has Recruitment</th>
                    <th className="sticky top-0 z-10 bg-slate-100 px-2.5 py-2 text-left font-medium">Remove DB Needs Optimization</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLicensedCompanies.map((row) => (
                    <tr key={row.Id} className="border-t border-slate-100 odd:bg-slate-50/40 hover:bg-slate-100/60">
                      <td className="px-2.5 py-2" title={displayText(row.RegisteredName)}>{displayText(row.RegisteredName)}</td>
                      <td className="px-2.5 py-2" title={displayText(row.Branch)}>{displayText(row.Branch)}</td>
                      <td className="px-2.5 py-2" title={displayText(row.TIN)}>{displayText(row.TIN)}</td>
                      <td className="px-2.5 py-2">{formatNumber(row.EmployeeCount)}</td>
                      <td className="px-2.5 py-2" title={displayText(row.Edition)}>{displayText(row.Edition)}</td>
                      <td className="px-2.5 py-2" title={displayText(row.ServerLicense)}>{displayText(row.ServerLicense)}</td>
                      <td className="px-2.5 py-2">
                        <input type="checkbox" checked={Boolean(row.IsPermanent)} readOnly disabled className="size-4 accent-slate-900" />
                      </td>
                      <td className="px-2.5 py-2">
                        <input type="checkbox" checked={Boolean(row.IsUnlimitedEmployeeCount)} readOnly disabled className="size-4 accent-slate-900" />
                      </td>
                      <td className="px-2.5 py-2">{formatNumber(row.ESSEmployeeCount)}</td>
                      <td className="px-2.5 py-2">
                        <input type="checkbox" checked={Boolean(row.IsESSUnlimitedEmployeeCount)} readOnly disabled className="size-4 accent-slate-900" />
                      </td>
                      <td className="px-2.5 py-2">
                        <input type="checkbox" checked={Boolean(row.HasWebkiosk)} readOnly disabled className="size-4 accent-slate-900" />
                      </td>
                      <td className="px-2.5 py-2">
                        <input type="checkbox" checked={Boolean(row.HasRecruitment)} readOnly disabled className="size-4 accent-slate-900" />
                      </td>
                      <td className="px-2.5 py-2">
                        <input type="checkbox" checked={Boolean(row.IsNoDatabaseNeedsOpt)} readOnly disabled className="size-4 accent-slate-900" />
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-slate-200 bg-slate-50 text-slate-700">
                    <td className="px-2.5 py-2 font-medium" colSpan={3}>Total Employee Count</td>
                    <td className="px-2.5 py-2 font-semibold">{formatNumber(totalLicensedEmployeeCount)}</td>
                    <td className="px-2.5 py-2" colSpan={9} />
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        </SheetContent>
      </Sheet>
      {!isLicensedSheetOpen ? (
        <button
          type="button"
          onClick={toggleLicensedSheetView}
          className="fixed right-0 top-1/2 z-[70] inline-flex h-14 w-8 -translate-y-1/2 items-center justify-center rounded-l-md border border-r-0 border-slate-200 bg-white text-slate-600 shadow-md hover:bg-slate-50 hover:text-slate-900 cursor-pointer"
          title="Open licensed companies full screen"
          aria-label="Open licensed companies full screen"
        >
          <PanelRightOpen className="size-4 sm:size-5" />
        </button>
      ) : null}
      <LoadingState show={isNavigating} message="Opening activation key requests..." />
    </div>
  );
}

export default SystemLicensePage;
