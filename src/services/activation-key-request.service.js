const { getPool, sql } = require("./db.service");
const { HttpError } = require("../utils/http-error");

const parsePaging = ({ page, pageSize, loadAll }) => {
  const safePage = Math.max(1, Number.parseInt(page, 10) || 1);
  if (loadAll) {
    return { safePage: 1, safePageSize: null, safeLoadAll: true };
  }

  const safePageSize = Math.max(1, Number.parseInt(pageSize, 10) || 50);
  return { safePage, safePageSize, safeLoadAll: false };
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
  } else {
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
    SELECT COUNT(1) AS TotalItems
    FROM tblActivationKeyRequestDetails ard
    WHERE ${whereClause}
  `);

  const totalItems = countResult.recordset[0]?.TotalItems || 0;
  if (safeLoadAll) {
    const loadAllRequest = pool.request();

    if (safeRequestId !== null && !Number.isNaN(safeRequestId) && safeRequestId > 0) {
      loadAllRequest.input("requestId", sql.Int, safeRequestId);
    }

    const loadAllResult = await loadAllRequest.query(`
      SELECT
        ard.Id AS RequestId,
        ard.KeyRequestId,
        ard.FilingStatusId,
        [Status] = CASE ard.FilingStatusId
          WHEN 1 THEN 'Filed'
          WHEN 2 THEN 'Approved'
          WHEN 3 THEN 'Disapproved'
          ELSE ''
        END,
        ard.DaysTrial,
        ard.EmployeeCount,
        ard.IsPermanent,
        ard.IsUnlimitedEmployeeCount,
        ard.OptimizationDate,
        se.Name AS SystemEdition
      FROM tblActivationKeyRequestDetails ard
      LEFT JOIN tblSystemEditions se ON se.Id = ard.SystemEditionId
      WHERE ${whereClause}
      ORDER BY ard.Id DESC
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
      ard.FilingStatusId,
      [Status] = CASE ard.FilingStatusId
        WHEN 1 THEN 'Filed'
        WHEN 2 THEN 'Approved'
        WHEN 3 THEN 'Disapproved'
        ELSE ''
      END,
      ard.DaysTrial,
      ard.EmployeeCount,
      ard.IsPermanent,
      ard.IsUnlimitedEmployeeCount,
      ard.OptimizationDate,
      se.Name AS SystemEdition
    FROM tblActivationKeyRequestDetails ard
    LEFT JOIN tblSystemEditions se ON se.Id = ard.SystemEditionId
    WHERE ${whereClause}
    ORDER BY ard.Id DESC
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

const parseApprovalResult = (recordset) => {
  const rows = Array.isArray(recordset) ? recordset : [];
  if (rows.length === 0) {
    return { success: false, warnings: ["No response from approval stored procedure"] };
  }

  const states = rows.map((row) => String(row.State || "").trim().toLowerCase());
  const warnings = rows.map((row) => row.Warning).filter(Boolean);
  const success = states.every((state) => state === "done");

  return { success, warnings };
};

const executeApproveRequest = async ({ request, requestId, userId }) => {
  const result = await request
    .input("KeyRequestId", sql.Int, requestId)
    .input("UserId", sql.Int, userId)
    .execute("dbo.uspApproveRegInfo");

  return parseApprovalResult(result.recordset);
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

    for (const requestId of requestIds) {
      const request = new sql.Request(transaction);
      const result = await executeApproveRequest({ request, requestId, userId: parsedUserId });
      approvalResults.push({ request_id: requestId, ...result });

      if (!result.success) {
        throw new HttpError(
          409,
          `Approval failed for request_id ${requestId}: ${result.warnings.join("; ")}`
        );
      }
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

module.exports = {
  listActivationKeyRequestSummaries,
  listActivationKeyRequestSummaryFilterOptions,
  listActivationKeyRequestDetails,
  approveActivationKeyRequests,
};
