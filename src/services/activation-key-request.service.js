const { getPool, sql } = require("./db.service");
const { HttpError } = require("../utils/http-error");

const parsePaging = ({ page, pageSize }) => {
  const safePage = Math.max(1, Number.parseInt(page, 10) || 1);
  const safePageSize = Math.max(1, Number.parseInt(pageSize, 10) || 20);
  return { safePage, safePageSize };
};

const listActivationKeyRequestSummaries = async ({ page, pageSize }) => {
  const pool = await getPool();
  const { safePage, safePageSize } = parsePaging({ page, pageSize });

  const countResult = await pool.request().query(`
    SELECT COUNT(1) AS TotalItems
    FROM tblActivationKeyRequests ar
  `);

  const totalItems = countResult.recordset[0]?.TotalItems || 0;
  const totalPages = totalItems === 0 ? 1 : Math.ceil(totalItems / safePageSize);
  const effectivePage = Math.min(safePage, totalPages);
  const offset = (effectivePage - 1) * safePageSize;

  const result = await pool
    .request()
    .input("offset", sql.Int, offset)
    .input("pageSize", sql.Int, safePageSize)
    .query(`
    WITH RequestStats AS (
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
    )
    SELECT
      rs.Id AS RequestId,
      rs.RequestNo,
      rs.Client,
      rs.ServerLicenseType,
      AddOns = NULLIF(
        STUFF(
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
            WHERE ard2.KeyRequestId = rs.Id
            FOR XML PATH(''), TYPE
          ).value('.', 'nvarchar(max)'),
          1,
          3,
          ''
        ),
        'JPS'
      ),
      [Date] = rs.DateRequested,
      rs.CreatedBy,
      rs.CreationDate,
      rs.ModifiedBy,
      rs.ModificationDate,
      [Status] = CASE
        WHEN (rs.RCount = rs.ACount) AND (rs.ACount > 0) THEN 'Approved'
        WHEN (rs.RCount > rs.ACount) AND (rs.ACount > 0) THEN 'Partially Approved'
        WHEN (rs.RCount = rs.DCount) AND (rs.DCount > 0) THEN 'Disapproved'
        WHEN (rs.RCount > rs.DCount) AND (rs.DCount > 0) THEN 'Partially Disapproved'
        WHEN rs.RCount > 0 AND rs.ACount = 0 AND rs.DCount = 0 THEN 'Filed'
        ELSE ''
      END
    FROM RequestStats rs
    ORDER BY rs.CreationDate DESC, rs.Id DESC
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

const listActivationKeyRequestDetails = async ({ status, page, pageSize, requestId }) => {
  const pool = await getPool();
  const { safePage, safePageSize } = parsePaging({ page, pageSize });
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
  listActivationKeyRequestDetails,
  approveActivationKeyRequests,
};
