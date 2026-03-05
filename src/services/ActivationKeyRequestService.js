const { getPool, sql } = require("./DbService");
const { HttpError } = require("../utils/http-error");

const parsePaging = ({ page, pageSize, loadAll }) => {
  const safePage = Math.max(1, Number.parseInt(page, 10) || 1);
  if (loadAll) {
    return { safePage: 1, safePageSize: null, safeLoadAll: true };
  }

  const safePageSize = Math.max(1, Number.parseInt(pageSize, 10) || 50);
  return { safePage, safePageSize, safeLoadAll: false };
};

const extractRegInfoValue = (regInfo, key) => {
  if (typeof regInfo !== "string" || typeof key !== "string" || key.length === 0) {
    return null;
  }

  const marker = `${key}=`;
  const startIndex = regInfo.indexOf(marker);
  if (startIndex < 0) {
    return null;
  }

  const valueStartIndex = startIndex + marker.length;
  let valueEndIndex = regInfo.indexOf("\r\n", valueStartIndex);
  if (valueEndIndex < 0) {
    valueEndIndex = regInfo.indexOf("\n", valueStartIndex);
  }
  if (valueEndIndex < 0) {
    valueEndIndex = regInfo.length;
  }

  const value = regInfo.slice(valueStartIndex, valueEndIndex).trim();
  return value.length > 0 ? value : null;
};

const mapActivationKeyRequestDetailRows = (rows = []) =>
  rows.map((row) => {
    const mapped = { ...row };
    mapped.ActivationKey = extractRegInfoValue(mapped.RegInfoRaw, "ActivationKey");
    delete mapped.RegInfoRaw;
    return mapped;
  });

const getActivationKeyRequestInfo = async ({ pool, requestId }) => {
  const safeRequestId = Number.parseInt(requestId, 10);
  if (Number.isNaN(safeRequestId) || safeRequestId <= 0) {
    return null;
  }

  const result = await pool
    .request()
    .input("requestId", sql.Int, safeRequestId)
    .query(`
      SELECT TOP 1
        ar.RequestNo,
        [Date] = ar.DateRequested,
        c.Name AS Client,
        slt.Name AS ServerLicenseType,
        ar.DateAndTimeRequested,
        Remarks = ar.Reason
      FROM tblActivationKeyRequests ar
      LEFT JOIN tblClients c ON c.Id = ar.ClientId
      LEFT JOIN tblServerLicenseTypes slt ON slt.Id = ar.ServerLicenseTypeId
      WHERE ar.Id = @requestId
    `);

  const row = result.recordset[0];
  if (!row) {
    return null;
  }

  return {
    request_no: row.RequestNo || null,
    date: row.Date || null,
    client: row.Client || null,
    server_license_type: row.ServerLicenseType || null,
    date_and_time_request: row.DateAndTimeRequested || null,
    remarks: row.Remarks || null,
  };
};

const SUMMARY_DATASET_SQL = `
  WITH RequestStatsRaw AS (
    SELECT
      ar.Id,
      ar.RequestNo,
      ar.DateRequested,
      ar.CreationDate,
      ar.ModificationDate,
      c.Name AS Client,
      slt.Name AS ServerLicenseType,
      su1.UserName AS CreatedBy,
      su2.UserName AS ModifiedBy,
      AddOns = STUFF(
        (
          SELECT DISTINCT
            ' & ' + CASE
              WHEN ISNULL(ard2.AddOnsId, 0) = 0 THEN 'JPS'
              WHEN ard2.AddOnsId = 1 THEN 'ESS'
              WHEN ard2.AddOnsId = 2 THEN 'Import Text File'
              WHEN ard2.AddOnsId = 3 THEN 'Import Excel'
              ELSE 'OTHERS'
            END
          FROM tblActivationKeyRequestDetails ard2
          WHERE ard2.KeyRequestId = ar.Id
          FOR XML PATH(''), TYPE
        ).value('.', 'nvarchar(max)'),
        1,
        3,
        ''
      ),
      SUM(CASE WHEN ard.FilingStatusId > 0 THEN 1 ELSE 0 END) AS RCount,
      SUM(CASE WHEN ard.FilingStatusId = 2 THEN 1 ELSE 0 END) AS ACount,
      SUM(CASE WHEN ard.FilingStatusId = 3 THEN 1 ELSE 0 END) AS DCount
    FROM tblActivationKeyRequests ar
    LEFT JOIN tblActivationKeyRequestDetails ard ON ard.KeyRequestId = ar.Id
    LEFT JOIN tblServerLicenseTypes slt ON slt.Id = ar.ServerLicenseTypeId
    LEFT JOIN tblClients c ON c.Id = ar.ClientId
    LEFT JOIN tblSecurityUsers su1 ON su1.Id = ar.CreatedById
    LEFT JOIN tblSecurityUsers su2 ON su2.Id = ar.ModifiedById
    GROUP BY
      ar.Id,
      ar.RequestNo,
      ar.DateRequested,
      ar.CreationDate,
      ar.ModificationDate,
      c.Name,
      slt.Name,
      su1.UserName,
      su2.UserName
  ),
  RequestStats AS (
    SELECT
      rsr.Id AS RequestId,
      rsr.RequestNo,
      rsr.Client,
      rsr.ServerLicenseType,
      rsr.AddOns,
      [Date] = rsr.DateRequested,
      rsr.CreatedBy,
      rsr.CreationDate,
      rsr.ModifiedBy,
      rsr.ModificationDate,
      [Status] = CASE
        WHEN (rsr.RCount = rsr.ACount) AND (rsr.ACount > 0) THEN 'Approved'
        WHEN (rsr.RCount > rsr.ACount) AND (rsr.ACount > 0) THEN 'Partially Approved'
        WHEN (rsr.RCount = rsr.DCount) AND (rsr.DCount > 0) THEN 'Disapproved'
        WHEN (rsr.RCount > rsr.DCount) AND (rsr.DCount > 0) THEN 'Partially Disapproved'
        WHEN rsr.RCount > 0 AND rsr.ACount = 0 AND rsr.DCount = 0 THEN 'Filed'
        ELSE ''
      END
    FROM RequestStatsRaw rsr
  )
`;

const normalizeSummarySearch = (search = {}) => {
  const searchByRaw = String(search.searchBy || "request_no").trim().toLowerCase();
  const searchTextRaw = String(search.searchText || "").trim();

  const allowed = new Set([
    "request_no",
    "client",
    "server_license_type",
    "add_ons",
    "status",
    "created_by",
    "modified_by",
    "all",
  ]);

  return {
    searchBy: allowed.has(searchByRaw) ? searchByRaw : "request_no",
    searchText: searchTextRaw.length > 0 ? searchTextRaw : null,
  };
};

const applySummarySearch = (request, search = {}) => {
  const normalized = normalizeSummarySearch(search);
  request.input("SearchBy", sql.NVarChar(50), normalized.searchBy);
  request.input("SearchText", sql.NVarChar(255), normalized.searchText);
  request.input("SearchTextLike", sql.NVarChar(255), normalized.searchText ? `%${normalized.searchText}%` : null);
};

const normalizeSummaryFilters = (filters = {}) => {
  const clientRaw = String(filters.client || "").trim();
  const dateFromRaw = String(filters.dateFrom || "").trim();
  const dateToRaw = String(filters.dateTo || "").trim();

  return {
    client: clientRaw.length > 0 ? clientRaw : null,
    dateFrom: dateFromRaw.length > 0 ? dateFromRaw : null,
    dateTo: dateToRaw.length > 0 ? dateToRaw : null,
  };
};

const applySummaryFilters = (request, filters = {}) => {
  const normalized = normalizeSummaryFilters(filters);
  request.input("ClientFilter", sql.NVarChar(255), normalized.client);
  request.input("DateFrom", sql.VarChar(10), normalized.dateFrom);
  request.input("DateTo", sql.VarChar(10), normalized.dateTo);
};

const SUMMARY_FILTER_WHERE_SQL = `
  WHERE
    (
      @SearchText IS NULL
      OR (@SearchBy = 'request_no' AND rs.RequestNo LIKE @SearchTextLike)
      OR (@SearchBy = 'client' AND rs.Client LIKE @SearchTextLike)
      OR (@SearchBy = 'server_license_type' AND rs.ServerLicenseType LIKE @SearchTextLike)
      OR (@SearchBy = 'add_ons' AND rs.AddOns LIKE @SearchTextLike)
      OR (@SearchBy = 'status' AND rs.[Status] LIKE @SearchTextLike)
      OR (@SearchBy = 'created_by' AND rs.CreatedBy LIKE @SearchTextLike)
      OR (@SearchBy = 'modified_by' AND rs.ModifiedBy LIKE @SearchTextLike)
      OR (
        @SearchBy = 'all'
        AND (
          rs.RequestNo LIKE @SearchTextLike
          OR rs.Client LIKE @SearchTextLike
          OR rs.ServerLicenseType LIKE @SearchTextLike
          OR rs.AddOns LIKE @SearchTextLike
          OR rs.[Status] LIKE @SearchTextLike
          OR rs.CreatedBy LIKE @SearchTextLike
          OR rs.ModifiedBy LIKE @SearchTextLike
        )
      )
    )
    AND (@ClientFilter IS NULL OR rs.Client = @ClientFilter)
    AND (@DateFrom IS NULL OR CONVERT(date, rs.[Date]) >= CONVERT(date, @DateFrom))
    AND (@DateTo IS NULL OR CONVERT(date, rs.[Date]) <= CONVERT(date, @DateTo))
`;

const listActivationKeyRequestSummaries = async ({ page, pageSize, loadAll, search, filters }) => {
  const pool = await getPool();
  const { safePage, safePageSize, safeLoadAll } = parsePaging({ page, pageSize, loadAll });

  const countRequest = pool.request();
  applySummarySearch(countRequest, search);
  applySummaryFilters(countRequest, filters);

  const countResult = await countRequest.query(`
    ${SUMMARY_DATASET_SQL}
    SELECT COUNT(1) AS TotalItems
    FROM RequestStats rs
    ${SUMMARY_FILTER_WHERE_SQL}
  `);

  const totalItems = countResult.recordset[0]?.TotalItems || 0;
  if (safeLoadAll) {
    const loadAllRequest = pool.request();
    applySummarySearch(loadAllRequest, search);
    applySummaryFilters(loadAllRequest, filters);

    const loadAllResult = await loadAllRequest.query(`
      ${SUMMARY_DATASET_SQL}
      SELECT
        rs.RequestId,
        rs.RequestNo,
        rs.Client,
        rs.ServerLicenseType,
        rs.AddOns,
        rs.[Date],
        rs.CreatedBy,
        rs.CreationDate,
        rs.ModifiedBy,
        rs.ModificationDate,
        rs.[Status]
      FROM RequestStats rs
      ${SUMMARY_FILTER_WHERE_SQL}
      ORDER BY rs.CreationDate DESC, rs.RequestId DESC
    `);

    return {
      items: loadAllResult.recordset,
      pagination: {
        page: 1,
        page_size: totalItems,
        total_items: totalItems,
        total_pages: 1,
        has_prev: false,
        has_next: false,
      },
    };
  }

  const totalPages = totalItems === 0 ? 1 : Math.ceil(totalItems / safePageSize);
  const effectivePage = Math.min(safePage, totalPages);
  const offset = (effectivePage - 1) * safePageSize;

  const listRequest = pool
    .request()
    .input("offset", sql.Int, offset)
    .input("pageSize", sql.Int, safePageSize);
  applySummarySearch(listRequest, search);
  applySummaryFilters(listRequest, filters);

  const result = await listRequest.query(`
    ${SUMMARY_DATASET_SQL}
    SELECT
      rs.RequestId,
      rs.RequestNo,
      rs.Client,
      rs.ServerLicenseType,
      rs.AddOns,
      rs.[Date],
      rs.CreatedBy,
      rs.CreationDate,
      rs.ModifiedBy,
      rs.ModificationDate,
      rs.[Status]
    FROM RequestStats rs
    ${SUMMARY_FILTER_WHERE_SQL}
    ORDER BY rs.CreationDate DESC, rs.RequestId DESC
    OFFSET @offset ROWS
    FETCH NEXT @pageSize ROWS ONLY
  `);

  return {
    items: result.recordset,
    pagination: {
      page: effectivePage,
      page_size: safePageSize,
      total_items: totalItems,
      total_pages: totalPages,
      has_prev: effectivePage > 1,
      has_next: effectivePage < totalPages,
    },
  };
};

const listActivationKeyRequestSummaryFilterOptions = async () => {
  const pool = await getPool();

  const result = await pool.request().query(`
    ${SUMMARY_DATASET_SQL}
    SELECT *
    INTO #RequestStats
    FROM RequestStats;

    SELECT TOP 200 rs.RequestNo AS Value
    FROM #RequestStats rs
    WHERE rs.RequestNo IS NOT NULL AND rs.RequestNo <> ''
    GROUP BY rs.RequestNo
    ORDER BY MAX(rs.CreationDate) DESC;

    SELECT TOP 200 rs.Client AS Value
    FROM #RequestStats rs
    WHERE rs.Client IS NOT NULL AND rs.Client <> ''
    GROUP BY rs.Client
    ORDER BY rs.Client;

    SELECT TOP 200 rs.ServerLicenseType AS Value
    FROM #RequestStats rs
    WHERE rs.ServerLicenseType IS NOT NULL AND rs.ServerLicenseType <> ''
    GROUP BY rs.ServerLicenseType
    ORDER BY rs.ServerLicenseType;

    SELECT TOP 200 rs.AddOns AS Value
    FROM #RequestStats rs
    WHERE rs.AddOns IS NOT NULL AND rs.AddOns <> ''
    GROUP BY rs.AddOns
    ORDER BY rs.AddOns;

    SELECT TOP 50 rs.[Status] AS Value
    FROM #RequestStats rs
    WHERE rs.[Status] IS NOT NULL AND rs.[Status] <> ''
    GROUP BY rs.[Status]
    ORDER BY rs.[Status];

    SELECT TOP 200 rs.CreatedBy AS Value
    FROM #RequestStats rs
    WHERE rs.CreatedBy IS NOT NULL AND rs.CreatedBy <> ''
    GROUP BY rs.CreatedBy
    ORDER BY rs.CreatedBy;

    SELECT TOP 200 rs.ModifiedBy AS Value
    FROM #RequestStats rs
    WHERE rs.ModifiedBy IS NOT NULL AND rs.ModifiedBy <> ''
    GROUP BY rs.ModifiedBy
    ORDER BY rs.ModifiedBy;

    DROP TABLE #RequestStats;
  `);

  const toValues = (rows = []) => rows.map((row) => row.Value);

  return {
    request_no: toValues(result.recordsets[0]),
    client: toValues(result.recordsets[1]),
    server_license_type: toValues(result.recordsets[2]),
    add_ons: toValues(result.recordsets[3]),
    status: toValues(result.recordsets[4]),
    created_by: toValues(result.recordsets[5]),
    modified_by: toValues(result.recordsets[6]),
  };
};

const listActivationKeyRequestDetails = async ({ status, page, pageSize, loadAll, requestId }) => {
  const pool = await getPool();
  const { safePage, safePageSize, safeLoadAll } = parsePaging({ page, pageSize, loadAll });
  const normalizedStatus = String(status || "pending").trim().toLowerCase();
  const safeRequestId =
    requestId === undefined || requestId === null
      ? null
      : Number.parseInt(requestId, 10);

  const whereConditions = [];

  if (normalizedStatus === "all") {
    whereConditions.push("ard.FilingStatusId > 0");
  } 
  else {
    whereConditions.push("ard.FilingStatusId = 1");
    whereConditions.push("ard.ApprovedById IS NULL");
    whereConditions.push("ard.ApprovalDate IS NULL");
  }

  if (safeRequestId !== null && !Number.isNaN(safeRequestId) && safeRequestId > 0) {
    whereConditions.push("ard.KeyRequestId = @requestId");
  }

  const whereClause = whereConditions.join("\n      AND ");

  const countRequest = pool.request();
  if (safeRequestId !== null && !Number.isNaN(safeRequestId) && safeRequestId > 0) {
    countRequest.input("requestId", sql.Int, safeRequestId);
  }

  const countResult = await countRequest.query(`
    SELECT
      COUNT(1) AS TotalItems,
      COALESCE(SUM(ISNULL(ard.EmployeeCount, 0)), 0) AS TotalEmployeeCount
    FROM tblActivationKeyRequestDetails ard
    WHERE ${whereClause}
  `);

  const totalItems = countResult.recordset[0]?.TotalItems || 0;
  const currentRequestTotalEmployeeCount = countResult.recordset[0]?.TotalEmployeeCount || 0;
  const clientScopeSummary =
    safeRequestId !== null && !Number.isNaN(safeRequestId) && safeRequestId > 0
      ? await getClientScopeEmployeeSummary({ pool, requestId: safeRequestId })
      : { totalEmployeeCount: 0, companyCount: 0 };
  const effectiveTotalEmployeeCount =
    safeRequestId !== null && !Number.isNaN(safeRequestId) && safeRequestId > 0
      ? clientScopeSummary.totalEmployeeCount
      : currentRequestTotalEmployeeCount;
  const requestInfo =
    safeRequestId !== null && !Number.isNaN(safeRequestId) && safeRequestId > 0
      ? await getActivationKeyRequestInfo({ pool, requestId: safeRequestId })
      : null;
  if (safeLoadAll) {
    const loadAllRequest = pool.request();

    if (safeRequestId !== null && !Number.isNaN(safeRequestId) && safeRequestId > 0) {
      loadAllRequest.input("requestId", sql.Int, safeRequestId);
    }

    const loadAllResult = await loadAllRequest.query(`
      SELECT
        ard.Id AS RequestId,
        ard.KeyRequestId,
        ard.RegInfo AS RegInfoRaw,
        NULLIF(LTRIM(RTRIM(ard.Branch)), '') AS Branch,
        ard.TIN,
        ard.SSSno AS SSS,
        ard.PHIC,
        ard.RequestCode,
        ard.ServerId,
        s.Name AS [System],
        RegisteredName = COALESCE(NULLIF(ard.RegisteredName, ''), c.Name),
        ard.FilingStatusId,
        [Status] = CASE ard.FilingStatusId
          WHEN 1 THEN 'Filed'
          WHEN 2 THEN 'Approved'
          WHEN 3 THEN 'Disapproved'
          ELSE ''
        END,
        AddOns = CASE
          WHEN ISNULL(ard.AddOnsId, 0) = 0 THEN 'JPS'
          WHEN ard.AddOnsId = 1 THEN 'ESS'
          WHEN ard.AddOnsId = 2 THEN 'Import Text File'
          WHEN ard.AddOnsId = 3 THEN 'Import Excel'
          ELSE COALESCE(NULLIF(sa.Name, ''), 'OTHERS')
        END,
        KeyType = COALESCE(CAST(kt.KeyType AS NVARCHAR(100)), CAST(ard.KeyType AS NVARCHAR(100))),
        ard.DaysTrial,
        ard.EmployeeCount,
        ard.IsPermanent,
        ard.IsUnlimitedEmployeeCount,
        DateApproved = ard.ApprovalDate,
        ApprovedBy = su.UserName,
        ard.OptimizationDate,
        se.Name AS SystemEdition
      FROM tblActivationKeyRequestDetails ard
      LEFT JOIN tblSystemEditions se ON se.Id = ard.SystemEditionId
      LEFT JOIN tblSystems s ON s.Id = ard.SystemId
      LEFT JOIN tblSystemAddOns sa ON sa.Id = ard.AddOnsId
      LEFT JOIN tblKeyTypes kt ON kt.Id = ard.KeyType
      LEFT JOIN tblSecurityUsers su ON su.Id = ard.ApprovedById
      LEFT JOIN tblClients c ON c.Id = ard.ClientId
      WHERE ${whereClause}
      ORDER BY ard.Id DESC
    `);

    return {
      items: mapActivationKeyRequestDetailRows(loadAllResult.recordset),
      request_info: requestInfo,
      summary: {
        total_employee_count: effectiveTotalEmployeeCount,
        total_company_count: clientScopeSummary.companyCount,
      },
      pagination: {
        page: 1,
        page_size: totalItems,
        total_items: totalItems,
        total_pages: 1,
        has_prev: false,
        has_next: false,
      },
    };
  }

  const totalPages = totalItems === 0 ? 1 : Math.ceil(totalItems / safePageSize);
  const effectivePage = Math.min(safePage, totalPages);
  const offset = (effectivePage - 1) * safePageSize;

  const detailsRequest = pool
    .request()
    .input("offset", sql.Int, offset)
    .input("pageSize", sql.Int, safePageSize);

  if (safeRequestId !== null && !Number.isNaN(safeRequestId) && safeRequestId > 0) {
    detailsRequest.input("requestId", sql.Int, safeRequestId);
  }

  const result = await detailsRequest.query(`
    SELECT
      ard.Id AS RequestId,
      ard.KeyRequestId,
      ard.RegInfo AS RegInfoRaw,
      NULLIF(LTRIM(RTRIM(ard.Branch)), '') AS Branch,
      ard.TIN,
      ard.SSSno AS SSS,
      ard.PHIC,
      ard.RequestCode,
      ard.ServerId,
      s.Name AS [System],
      RegisteredName = COALESCE(NULLIF(ard.RegisteredName, ''), c.Name),
      ard.FilingStatusId,
      [Status] = CASE ard.FilingStatusId
        WHEN 1 THEN 'Filed'
        WHEN 2 THEN 'Approved'
        WHEN 3 THEN 'Disapproved'
        ELSE ''
      END,
      AddOns = CASE
        WHEN ISNULL(ard.AddOnsId, 0) = 0 THEN 'JPS'
        WHEN ard.AddOnsId = 1 THEN 'ESS'
        WHEN ard.AddOnsId = 2 THEN 'Import Text File'
        WHEN ard.AddOnsId = 3 THEN 'Import Excel'
        ELSE COALESCE(NULLIF(sa.Name, ''), 'OTHERS')
      END,
      KeyType = COALESCE(CAST(kt.KeyType AS NVARCHAR(100)), CAST(ard.KeyType AS NVARCHAR(100))),
      ard.DaysTrial,
      ard.EmployeeCount,
      ard.IsPermanent,
      ard.IsUnlimitedEmployeeCount,
      DateApproved = ard.ApprovalDate,
      ApprovedBy = su.UserName,
      ard.OptimizationDate,
      se.Name AS SystemEdition
    FROM tblActivationKeyRequestDetails ard
    LEFT JOIN tblSystemEditions se ON se.Id = ard.SystemEditionId
    LEFT JOIN tblSystems s ON s.Id = ard.SystemId
    LEFT JOIN tblSystemAddOns sa ON sa.Id = ard.AddOnsId
    LEFT JOIN tblKeyTypes kt ON kt.Id = ard.KeyType
    LEFT JOIN tblSecurityUsers su ON su.Id = ard.ApprovedById
    LEFT JOIN tblClients c ON c.Id = ard.ClientId
    WHERE ${whereClause}
    ORDER BY ard.Id DESC
    OFFSET @offset ROWS
    FETCH NEXT @pageSize ROWS ONLY
  `);

  return {
    items: mapActivationKeyRequestDetailRows(result.recordset),
    request_info: requestInfo,
    summary: {
      total_employee_count: effectiveTotalEmployeeCount,
      total_company_count: clientScopeSummary.companyCount,
    },
    pagination: {
      page: effectivePage,
      page_size: safePageSize,
      total_items: totalItems,
      total_pages: totalPages,
      has_prev: effectivePage > 1,
      has_next: effectivePage < totalPages,
    },
  };
};

const getSystemLicenseView = async ({ requestId, detailId }) => {
  const safeRequestId = Number.parseInt(requestId, 10);
  const safeDetailId =
    detailId === undefined || detailId === null ? null : Number.parseInt(detailId, 10);

  const pool = await getPool();
  const detailRequest = pool.request().input("requestId", sql.Int, safeRequestId);
  if (safeDetailId !== null && !Number.isNaN(safeDetailId) && safeDetailId > 0) {
    detailRequest.input("detailId", sql.Int, safeDetailId);
  }

  const detailResult = await detailRequest.query(`
    SELECT TOP 1
      ard.Id AS DetailId,
      ard.KeyRequestId,
      ard.ClientId,
      c.Code AS ClientCode,
      c.Name AS ClientName,
      s.Name AS SystemName,
      se.Name AS SystemEdition,
      slt.Name AS ServerLicenseType,
      ard.ServerId,
      ard.RequestCode,
      KeyType = COALESCE(CAST(kt.KeyType AS NVARCHAR(100)), CAST(ard.KeyType AS NVARCHAR(100))),
      ard.IsUnlimitedEmployeeCount,
      ard.IsNoDatabaseNeedsOpt,
      ard.EmployeeCount,
      ard.IsPermanent,
      ard.DaysSlow,
      ard.DaysTrial,
      ard.RegisteredName,
      NULLIF(LTRIM(RTRIM(ard.Branch)), '') AS Branch,
      ard.TIN,
      ard.SSSno,
      ard.PHIC,
      ard.RegisteredAddress,
      ard.HasRecruitment,
      ard.HasWebkiosk,
      ar.Reason AS RequestRemarks
    FROM tblActivationKeyRequestDetails ard
    INNER JOIN tblActivationKeyRequests ar ON ar.Id = ard.KeyRequestId
    LEFT JOIN tblClients c ON c.Id = ard.ClientId
    LEFT JOIN tblSystems s ON s.Id = ard.SystemId
    LEFT JOIN tblSystemEditions se ON se.Id = ard.SystemEditionId
    LEFT JOIN tblServerLicenseTypes slt ON slt.Id = ar.ServerLicenseTypeId
    LEFT JOIN tblKeyTypes kt ON kt.Id = ard.KeyType
    WHERE ard.KeyRequestId = @requestId
      AND (@detailId IS NULL OR ard.Id = @detailId)
    ORDER BY
      CASE WHEN @detailId IS NOT NULL AND ard.Id = @detailId THEN 0 ELSE 1 END,
      ard.Id DESC
  `);

  const selectedDetail = detailResult.recordset[0];
  if (!selectedDetail) {
    throw new HttpError(404, "System license detail not found for the selected request");
  }

  const selectedLicenseResult = await pool
    .request()
    .input("clientId", sql.Int, selectedDetail.ClientId)
    .input("requestCode", sql.NVarChar(100), selectedDetail.RequestCode || null)
    .input("registeredName", sql.NVarChar(255), selectedDetail.RegisteredName || null)
    .input("branch", sql.NVarChar(255), selectedDetail.Branch || null)
    .query(`
      SELECT TOP 1
        l.Id,
        l.Code,
        l.Name,
        l.RegisteredName,
        NULLIF(LTRIM(RTRIM(l.Branch)), '') AS Branch,
        l.TIN,
        l.SSSNo,
        l.HDMFNo,
        l.PHICNo,
        l.TINBranch,
        l.SSSBranchCode,
        l.HDMFBranchCode,
        l.PHICBranchCode,
        l.RegisteredAddress,
        l.Active,
        l.HasRecruitment,
        l.HasWebkiosk,
        l.AllowOnlineRegistration,
        l.IsSystemAutoDeactivate,
        l.AllowableTempKeyForOnlineRegistration,
        l.Remarks,
        l.ServerId,
        l.RequestCode,
        l.KeyType,
        l.EmployeeCount,
        l.IsUnlimitedEmployeeCount,
        l.IsNoDatabaseNeedsOpt,
        l.IsPermanent,
        l.DaysSlow,
        l.DaysTrial
      FROM tblLicenses l
      WHERE l.ClientId = @clientId
      ORDER BY
        CASE
          WHEN @requestCode IS NOT NULL
            AND UPPER(LTRIM(RTRIM(ISNULL(l.RequestCode, '')))) = UPPER(LTRIM(RTRIM(@requestCode)))
          THEN 0 ELSE 1
        END,
        CASE
          WHEN @registeredName IS NOT NULL
            AND UPPER(LTRIM(RTRIM(ISNULL(l.RegisteredName, '')))) = UPPER(LTRIM(RTRIM(@registeredName)))
          THEN 0 ELSE 1
        END,
        CASE
          WHEN UPPER(LTRIM(RTRIM(ISNULL(l.Branch, '')))) = UPPER(LTRIM(RTRIM(ISNULL(@branch, ''))))
          THEN 0 ELSE 1
        END,
        l.Id DESC
    `);

  const selectedLicense = selectedLicenseResult.recordset[0] || null;

  const licensedCompaniesResult = await pool
    .request()
    .input("clientId", sql.Int, selectedDetail.ClientId)
    .query(`
      ;WITH StartClient AS (
        SELECT @clientId AS ClientId
      ),
      Ancestors AS (
        SELECT c.Id, c.ClientOfId
        FROM tblClients c
        JOIN StartClient sc ON sc.ClientId = c.Id
        UNION ALL
        SELECT p.Id, p.ClientOfId
        FROM tblClients p
        JOIN Ancestors a ON a.ClientOfId = p.Id
      ),
      RootClient AS (
        SELECT TOP 1 a.Id AS RootClientId
        FROM Ancestors a
        WHERE a.ClientOfId IS NULL
      ),
      ResolvedRoot AS (
        SELECT rc.RootClientId
        FROM RootClient rc
        UNION ALL
        SELECT sc.ClientId
        FROM StartClient sc
        WHERE NOT EXISTS (SELECT 1 FROM RootClient)
      ),
      ScopeClients AS (
        SELECT c.Id
        FROM tblClients c
        JOIN ResolvedRoot rr ON rr.RootClientId = c.Id
        UNION ALL
        SELECT child.Id
        FROM tblClients child
        JOIN ScopeClients parentScope ON child.ClientOfId = parentScope.Id
      ),
      DistinctScopeClients AS (
        SELECT DISTINCT sc.Id
        FROM ScopeClients sc
      )
      SELECT
        l.Id,
        l.RegisteredName,
        NULLIF(LTRIM(RTRIM(l.Branch)), '') AS Branch,
        l.TIN,
        l.EmployeeCount,
        se.Name AS Edition,
        slt.Name AS ServerLicense,
        l.IsPermanent,
        l.IsUnlimitedEmployeeCount,
        l.ESSEmployeeCount,
        l.IsESSUnlimitedEmployeeCount,
        l.HasWebkiosk,
        l.HasRecruitment,
        l.IsNoDatabaseNeedsOpt
      FROM tblLicenses l
      JOIN DistinctScopeClients sc ON sc.Id = l.ClientId
      LEFT JOIN tblSystemEditions se ON se.Id = l.SystemEditionId
      LEFT JOIN tblServerLicenseTypes slt ON slt.Id = l.ServerLicenseTypeId
      ORDER BY l.RegisteredName, l.Branch, l.Id DESC
      OPTION (MAXRECURSION 100);
    `);

  const licensedCompanies = licensedCompaniesResult.recordset || [];
  const totalEmployeeCount = licensedCompanies.reduce(
    (sum, item) => sum + (Number(item.EmployeeCount) || 0),
    0
  );

  return {
    detail_id: selectedDetail.DetailId,
    request_id: selectedDetail.KeyRequestId,
    client_details: {
      client_code: selectedDetail.ClientCode || null,
      client_name: selectedDetail.ClientName || null,
      system: selectedDetail.SystemName || null,
      edition: selectedDetail.SystemEdition || null,
      server_license: selectedDetail.ServerLicenseType || null,
      server_id: selectedLicense?.ServerId || selectedDetail.ServerId || null,
      request_code: selectedLicense?.RequestCode || selectedDetail.RequestCode || null,
      key_type: selectedLicense?.KeyType || selectedDetail.KeyType || null,
      is_unlimited_employee_count:
        selectedLicense?.IsUnlimitedEmployeeCount ?? selectedDetail.IsUnlimitedEmployeeCount ?? false,
      is_no_database_needs_opt:
        selectedLicense?.IsNoDatabaseNeedsOpt ?? selectedDetail.IsNoDatabaseNeedsOpt ?? false,
      employee_count: selectedLicense?.EmployeeCount ?? selectedDetail.EmployeeCount ?? 0,
      is_permanent: selectedLicense?.IsPermanent ?? selectedDetail.IsPermanent ?? false,
      days_slow: selectedLicense?.DaysSlow ?? selectedDetail.DaysSlow ?? 0,
      days_trial: selectedLicense?.DaysTrial ?? selectedDetail.DaysTrial ?? 0,
    },
    selected_company_details: {
      code: selectedLicense?.Code || null,
      name: selectedLicense?.Name || selectedDetail.ClientName || null,
      registered_name: selectedLicense?.RegisteredName || selectedDetail.RegisteredName || null,
      branch: selectedLicense?.Branch || selectedDetail.Branch || null,
      tin: selectedLicense?.TIN || selectedDetail.TIN || null,
      sss_no: selectedLicense?.SSSNo || selectedDetail.SSSno || null,
      hdmf_no: selectedLicense?.HDMFNo || null,
      phic_no: selectedLicense?.PHICNo || selectedDetail.PHIC || null,
      tin_branch: selectedLicense?.TINBranch || null,
      sss_branch_code: selectedLicense?.SSSBranchCode || null,
      hdmf_branch_code: selectedLicense?.HDMFBranchCode || null,
      phic_branch_code: selectedLicense?.PHICBranchCode || null,
      registered_address: selectedLicense?.RegisteredAddress || selectedDetail.RegisteredAddress || null,
      active: selectedLicense?.Active ?? false,
      has_recruitment: selectedLicense?.HasRecruitment ?? selectedDetail.HasRecruitment ?? false,
      has_webkiosk: selectedLicense?.HasWebkiosk ?? selectedDetail.HasWebkiosk ?? false,
      allow_online_registration: selectedLicense?.AllowOnlineRegistration ?? false,
      is_system_auto_deactivate: selectedLicense?.IsSystemAutoDeactivate ?? false,
      allowable_temp_key_for_online_registration:
        selectedLicense?.AllowableTempKeyForOnlineRegistration ?? null,
      remarks: selectedLicense?.Remarks || selectedDetail.RequestRemarks || null,
    },
    licensed_companies: {
      items: licensedCompanies,
      summary: {
        total_employee_count: totalEmployeeCount,
        total_items: licensedCompanies.length,
      },
    },
  };
};

const getClientScopeEmployeeSummary = async ({ pool, requestId }) => {
  const safeRequestId = Number.parseInt(requestId, 10);
  if (Number.isNaN(safeRequestId) || safeRequestId <= 0) {
    return {
      totalEmployeeCount: 0,
      companyCount: 0,
    };
  }

  const result = await pool
    .request()
    .input("requestId", sql.Int, safeRequestId)
    .query(`
      ;WITH StartClient AS (
        SELECT TOP 1 ar.ClientId
        FROM tblActivationKeyRequests ar
        WHERE ar.Id = @requestId
      ),
      Ancestors AS (
        SELECT c.Id, c.ClientOfId
        FROM tblClients c
        JOIN StartClient sc ON sc.ClientId = c.Id
        UNION ALL
        SELECT p.Id, p.ClientOfId
        FROM tblClients p
        JOIN Ancestors a ON a.ClientOfId = p.Id
      ),
      RootClient AS (
        SELECT TOP 1 a.Id AS RootClientId
        FROM Ancestors a
        WHERE a.ClientOfId IS NULL
      ),
      ResolvedRoot AS (
        SELECT rc.RootClientId
        FROM RootClient rc
        UNION ALL
        SELECT sc.ClientId
        FROM StartClient sc
        WHERE NOT EXISTS (SELECT 1 FROM RootClient)
      ),
      ScopeClients AS (
        SELECT c.Id
        FROM tblClients c
        JOIN ResolvedRoot rr ON rr.RootClientId = c.Id
        UNION ALL
        SELECT child.Id
        FROM tblClients child
        JOIN ScopeClients parentScope ON child.ClientOfId = parentScope.Id
      ),
      DistinctScopeClients AS (
        SELECT DISTINCT sc.Id
        FROM ScopeClients sc
      ),
      LicenseCompanyRows AS (
        SELECT
          CompanyKey = CAST(l.ClientId AS VARCHAR(20))
            + '|'
            + UPPER(LTRIM(RTRIM(ISNULL(l.RegisteredName, ''))))
            + '|'
            + UPPER(LTRIM(RTRIM(ISNULL(l.Branch, '')))),
          EffectiveEmployeeCount = CASE
            WHEN ISNULL(l.IsUnlimitedEmployeeCount, 0) = 1
              THEN ISNULL(NULLIF(l.EmployeeCount, 0), 0)
            ELSE ISNULL(l.EmployeeCount, 0)
          END
        FROM tblLicenses l
        JOIN DistinctScopeClients sc ON sc.Id = l.ClientId
        WHERE ISNULL(l.Active, 1) = 1
      ),
      LicenseByCompany AS (
        SELECT
          lcr.CompanyKey,
          MAX(ISNULL(lcr.EffectiveEmployeeCount, 0)) AS EffectiveEmployeeCount
        FROM LicenseCompanyRows lcr
        GROUP BY lcr.CompanyKey
      ),
      LicenseSummary AS (
        SELECT
          COUNT(1) AS CompanyCount,
          COALESCE(SUM(ISNULL(lbc.EffectiveEmployeeCount, 0)), 0) AS TotalEmployeeCount
        FROM LicenseByCompany lbc
      ),
      PurchasedByClient AS (
        SELECT
          sc.Id AS ClientId,
          MAX(
            CASE
              WHEN ISNULL(cpl.IsUnlimitedEmployees, 0) = 1
                THEN ISNULL(NULLIF(cpl.NoOfUnliEmployees, 0), ISNULL(cpl.EmployeeCount, 0))
              ELSE ISNULL(cpl.EmployeeCount, 0)
            END
          ) AS EffectiveEmployeeCount
        FROM DistinctScopeClients sc
        LEFT JOIN tblClientPurchasedLicense cpl ON cpl.ClientId = sc.Id
        GROUP BY sc.Id
      ),
      PurchasedSummary AS (
        SELECT
          COUNT(1) AS CompanyCount,
          COALESCE(SUM(ISNULL(pbc.EffectiveEmployeeCount, 0)), 0) AS TotalEmployeeCount
        FROM PurchasedByClient pbc
      )
      SELECT
        CASE
          WHEN ISNULL(ls.CompanyCount, 0) > 0 THEN ISNULL(ls.TotalEmployeeCount, 0)
          ELSE ISNULL(ps.TotalEmployeeCount, 0)
        END AS TotalEmployeeCount,
        CASE
          WHEN ISNULL(ls.CompanyCount, 0) > 0 THEN ISNULL(ls.CompanyCount, 0)
          ELSE ISNULL(ps.CompanyCount, 0)
        END AS CompanyCount
      FROM LicenseSummary ls
      CROSS JOIN PurchasedSummary ps
      OPTION (MAXRECURSION 100);
    `);

  return {
    totalEmployeeCount: result.recordset[0]?.TotalEmployeeCount || 0,
    companyCount: result.recordset[0]?.CompanyCount || 0,
  };
};

const parseApprovalResult = (recordset) => {
  const rows = Array.isArray(recordset) ? recordset : [];
  if (rows.length === 0) {
    return {
      success: false,
      warnings: ["No response from approval stored procedure"],
      details: [
        {
          line_no: 1,
          value: "",
          warning: "No response from approval stored procedure",
          state: "Failed",
        },
      ],
    };
  }

  const details = rows.map((row, index) => ({
    line_no: index + 1,
    value: row.Value == null ? "" : String(row.Value),
    warning: row.Warning == null ? "" : String(row.Warning),
    state: row.State == null ? "" : String(row.State),
  }));

  const states = details.map((row) => row.state.trim().toLowerCase());
  const warnings = details.map((row) => row.warning).filter(Boolean);
  const success = states.every((state) => state === "done");

  return { success, warnings, details };
};

const executeValidateRequest = async ({ request, requestId, userId }) => {
  const result = await request
    .input("KeyRequestId", sql.Int, requestId)
    .input("UserId", sql.Int, userId)
    .input("ValidateOnly", sql.Bit, 1)
    .execute("dbo.uspApproveRegInfo");

  return parseApprovalResult(result.recordset);
};

const updateFilingStatus = async ({ request, requestId, filingStatusId }) => {
  const result = await request
    .input("RequestId", sql.Int, requestId)
    .input("FilingStatusId", sql.Int, filingStatusId)
    .query(`
      UPDATE ard
      SET FilingStatusId = @FilingStatusId
      FROM tblActivationKeyRequestDetails ard
      WHERE ard.Id = @RequestId
        AND ard.FilingStatusId = 1
        AND ard.ApprovedById IS NULL
        AND ard.ApprovalDate IS NULL;

      SELECT @@ROWCOUNT AS AffectedRows;
    `);

  return result.recordset[0]?.AffectedRows || 0;
};

const buildBatchDetailRows = (results, { markSuccessfulAsIgnored = false } = {}) => {
  const rows = [];
  let lineNo = 1;

  for (const result of results) {
    const requestIdLabel = `${result.request_id}`;
    const baseDetails =
      Array.isArray(result.details) && result.details.length > 0
        ? result.details
        : [
            {
              value: requestIdLabel,
              warning: Array.isArray(result.warnings) ? result.warnings.join("; ") : "",
              state: result.success ? "Done" : "Failed",
            },
          ];

    for (const detail of baseDetails) {
      const detailValue = detail?.value == null ? "" : String(detail.value).trim();
      const prefixedValue =
        detailValue.length > 0 && detailValue !== String(result.request_id)
          ? `${detailValue}`
          : requestIdLabel;
      const detailState = detail?.state == null ? "" : String(detail.state).trim();

      rows.push({
        line_no: lineNo,
        value: prefixedValue,
        warning: detail?.warning == null ? "" : String(detail.warning),
        state:
          markSuccessfulAsIgnored && result.success
            ? "Ignored"
            : detailState.length > 0
            ? detailState
            : result.success
            ? "Done"
            : "Failed",
      });

      lineNo += 1;
    }
  }

  return rows;
};

const approveActivationKeyRequests = async ({ requestIds, userId }) => {
  const parsedUserId = Number.parseInt(userId, 10);
  if (Number.isNaN(parsedUserId)) {
    throw new HttpError(401, "Invalid session user context");
  }

  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  const approvalResults = [];
  let started = false;

  try {
    await transaction.begin(sql.ISOLATION_LEVEL.READ_COMMITTED);
    started = true;

    const validationResults = [];

    for (const requestId of requestIds) {
      const validationRequest = new sql.Request(transaction);
      const validation = await executeValidateRequest({
        request: validationRequest,
        requestId,
        userId: parsedUserId,
      });

      validationResults.push({
        request_id: requestId,
        success: validation.success,
        warnings: validation.warnings,
        details: validation.details,
      });
    }

    if (validationResults.some((item) => !item.success)) {
      throw new HttpError(
        409,
        "Approval failed for one or more selected requests",
        buildBatchDetailRows(validationResults)
      );
    }

    for (const validation of validationResults) {
      const requestId = validation.request_id;
      const updateRequest = new sql.Request(transaction);
      const affectedRows = await updateFilingStatus({
        request: updateRequest,
        requestId,
        filingStatusId: 2,
      });

      approvalResults.push({
        request_id: requestId,
        success: affectedRows > 0,
        warnings:
          affectedRows > 0
            ? validation.warnings
            : ["Request is no longer pending and cannot be approved"],
        details:
          affectedRows > 0
            ? validation.details
            : [
                {
                  line_no: 1,
                  value: String(requestId),
                  warning: "Request is no longer pending and cannot be approved",
                  state: "Failed",
                },
              ],
      });
    }

    if (approvalResults.some((item) => !item.success)) {
      throw new HttpError(
        409,
        "Approval failed for one or more selected requests",
        buildBatchDetailRows(approvalResults, { markSuccessfulAsIgnored: true })
      );
    }

    await transaction.commit();
    started = false;

    return {
      approved_request_ids: requestIds,
      results: approvalResults,
    };
  } catch (error) {
    if (started) {
      try {
        await transaction.rollback();
      } catch (_rollbackError) {}
    }
    throw error;
  }
};

const disapproveActivationKeyRequests = async ({ requestIds, userId }) => {
  const parsedUserId = Number.parseInt(userId, 10);
  if (Number.isNaN(parsedUserId)) {
    throw new HttpError(401, "Invalid session user context");
  }

  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  const disapprovalResults = [];
  let started = false;

  try {
    await transaction.begin(sql.ISOLATION_LEVEL.READ_COMMITTED);
    started = true;

    for (const requestId of requestIds) {
      const updateRequest = new sql.Request(transaction);
      const affectedRows = await updateFilingStatus({
        request: updateRequest,
        requestId,
        filingStatusId: 3,
      });
      const success = affectedRows > 0;

      disapprovalResults.push({
        request_id: requestId,
        success,
        warnings: success
          ? ["Successfully Disapproved"]
          : ["Request is no longer pending and cannot be disapproved"],
        details: [
          {
            line_no: 1,
            value: String(requestId),
            warning: success
              ? "Successfully Disapproved"
              : "Request is no longer pending and cannot be disapproved",
            state: success ? "Done" : "Failed",
          },
        ],
      });
    }

    if (disapprovalResults.some((item) => !item.success)) {
      throw new HttpError(
        409,
        "Disapproval failed for one or more selected requests",
        buildBatchDetailRows(disapprovalResults, { markSuccessfulAsIgnored: true })
      );
    }

    await transaction.commit();
    started = false;

    return {
      disapproved_request_ids: requestIds,
      results: disapprovalResults,
    };
  } 
  catch (error) {
    if (started) {
      try {
        await transaction.rollback();
      } catch (_rollbackError) {}
    }
    throw error;
  }
};

module.exports = {
  listActivationKeyRequestSummaries,
  listActivationKeyRequestSummaryFilterOptions,
  listActivationKeyRequestDetails,
  getSystemLicenseView,
  approveActivationKeyRequests,
  disapproveActivationKeyRequests,
};
