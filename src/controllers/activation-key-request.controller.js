const { HttpError } = require("../utils/http-error");
const {
  listActivationKeyRequestSummaries,
  listActivationKeyRequestSummaryFilterOptions,
  listActivationKeyRequestDetails,
  approveActivationKeyRequests,
} = require("../services/activation-key-request.service");

const parsePaging = (req) => {
  const rawPage = req.query.page;
  const rawPageSize = req.query.page_size;

  const page = rawPage === undefined ? 1 : Number.parseInt(String(rawPage), 10);

  if (Number.isNaN(page) || page < 1) {
    throw new HttpError(400, "page must be a positive integer");
  }

  if (rawPageSize === undefined) {
    return { page, pageSize: 50, loadAll: false };
  }

  const rawPageSizeValue = String(rawPageSize).trim().toLowerCase();
  if (rawPageSizeValue === "all") {
    return { page: 1, pageSize: null, loadAll: true };
  }

  const pageSize = Number.parseInt(rawPageSizeValue, 10);
  if (Number.isNaN(pageSize) || pageSize < 1 || pageSize > 1000) {
    throw new HttpError(400, "page_size must be an integer between 1 and 1000, or 'all'");
  }

  return { page, pageSize, loadAll: false };
};

const parseSummarySearch = (req) => {
  const searchByRaw = String(req.query.search_by || "request_no").trim().toLowerCase();
  const searchText = String(req.query.search_text || "").trim();
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

  if (!allowed.has(searchByRaw)) {
    throw new HttpError(
      400,
      "search_by must be one of: request_no, client, server_license_type, add_ons, status, created_by, modified_by, all"
    );
  }

  return {
    searchBy: searchByRaw,
    searchText,
  };
};

const parseDateOnly = (value, fieldName) => {
  const raw = String(value || "").trim();

  if (!raw) {
    return null;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw new HttpError(400, `${fieldName} must be in YYYY-MM-DD format`);
  }

  const [yearRaw, monthRaw, dayRaw] = raw.split("-");
  const year = Number.parseInt(yearRaw, 10);
  const month = Number.parseInt(monthRaw, 10);
  const day = Number.parseInt(dayRaw, 10);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    Number.isNaN(date.getTime()) ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) {
    throw new HttpError(400, `${fieldName} is not a valid calendar date`);
  }

  return raw;
};

const parseSummaryFilters = (req) => {
  const clientRaw = String(req.query.client || "").trim();
  const normalizedClient = !clientRaw || clientRaw.toLowerCase() === "all" ? null : clientRaw;
  const dateFrom = parseDateOnly(req.query.date_from, "date_from");
  const dateTo = parseDateOnly(req.query.date_to, "date_to");

  if (dateFrom && dateTo && dateFrom > dateTo) {
    throw new HttpError(400, "date_from must be on or before date_to");
  }

  return {
    client: normalizedClient,
    dateFrom,
    dateTo,
  };
};

const listActivationKeyRequestSummariesHandler = async (req, res, next) => {
  try {
    const { page, pageSize, loadAll } = parsePaging(req);
    const search = parseSummarySearch(req);
    const filters = parseSummaryFilters(req);
    const requests = await listActivationKeyRequestSummaries({
      page,
      pageSize,
      loadAll,
      search,
      filters,
    });
    return res.status(200).json(requests);
  } catch (error) {
    return next(error);
  }
};

const listActivationKeyRequestSummaryFilterOptionsHandler = async (_req, res, next) => {
  try {
    const options = await listActivationKeyRequestSummaryFilterOptions();
    return res.status(200).json(options);
  } catch (error) {
    return next(error);
  }
};

const listActivationKeyRequests = async (req, res, next) => {
  const status = String(req.query.status || "").trim().toLowerCase();
  const rawRequestId = req.query.request_id;
  if (!["pending", "all"].includes(status)) {
    return next(new HttpError(400, "status must be either pending or all"));
  }

  let requestId;
  if (rawRequestId !== undefined) {
    requestId = Number.parseInt(String(rawRequestId), 10);
    if (Number.isNaN(requestId) || requestId < 1) {
      return next(new HttpError(400, "request_id must be a positive integer"));
    }
  }

  try {
    const { page, pageSize, loadAll } = parsePaging(req);
    const requests = await listActivationKeyRequestDetails({
      status,
      page,
      pageSize,
      loadAll,
      requestId,
    });
    return res.status(200).json(requests);
  } catch (error) {
    return next(error);
  }
};

const parseRequestIds = (payload) => {
  const { request_ids: requestIds } = payload || {};

  if (requestIds === undefined) {
    throw new HttpError(400, "request_ids is required");
  }

  if (!Array.isArray(requestIds)) {
    throw new HttpError(400, "request_ids must be an array");
  }

  if (requestIds.length === 0) {
    throw new HttpError(400, "request_ids must not be empty");
  }

  const parsed = requestIds.map((id) => Number.parseInt(id, 10));

  if (parsed.some((id) => Number.isNaN(id) || id <= 0)) {
    throw new HttpError(400, "request_ids must contain positive integer values only");
  }

  const uniqueCount = new Set(parsed).size;
  if (uniqueCount !== parsed.length) {
    throw new HttpError(400, "request_ids must not contain duplicate values");
  }

  return parsed;
};

const approveActivationKeyRequestsHandler = async (req, res, next) => {
  try {
    const requestIds = parseRequestIds(req.body);
    const result = await approveActivationKeyRequests({
      requestIds,
      userId: req.user && req.user.id,
    });

    return res.status(200).json({
      message: "Activation key request(s) approved successfully",
      ...result,
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  listActivationKeyRequestSummariesHandler,
  listActivationKeyRequestSummaryFilterOptionsHandler,
  listActivationKeyRequests,
  approveActivationKeyRequestsHandler,
};
