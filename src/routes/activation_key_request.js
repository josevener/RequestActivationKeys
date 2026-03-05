const express = require("express");
const {
  listActivationKeyRequestSummariesHandler,
  listActivationKeyRequestSummaryFilterOptionsHandler,
  listActivationKeyRequests,
  getSystemLicenseViewHandler,
  approveActivationKeyRequestsHandler,
  disapproveActivationKeyRequestsHandler,
} = require("../controllers/ActivationKeyRequestController");
const { authenticate, enforceAllowlist } = require("../middleware/AuthMiddleware");

const router = express.Router();

router.get(
  "/summary/filter_options",
  authenticate,
  enforceAllowlist,
  listActivationKeyRequestSummaryFilterOptionsHandler
);
router.get("/summary", authenticate, enforceAllowlist, listActivationKeyRequestSummariesHandler);
router.get("/", authenticate, enforceAllowlist, listActivationKeyRequests);
router.get("/system_license", authenticate, enforceAllowlist, getSystemLicenseViewHandler);
router.post("/approve", authenticate, enforceAllowlist, approveActivationKeyRequestsHandler);
router.post("/disapprove", authenticate, enforceAllowlist, disapproveActivationKeyRequestsHandler);

module.exports = router;

