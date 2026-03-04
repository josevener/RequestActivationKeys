const express = require("express");
const {
  listActivationKeyRequestSummariesHandler,
  listActivationKeyRequestSummaryFilterOptionsHandler,
  listActivationKeyRequests,
  approveActivationKeyRequestsHandler,
  disapproveActivationKeyRequestsHandler,
} = require("../controllers/activation-key-request.controller");
const { authenticate, enforceAllowlist } = require("../middleware/auth.middleware");

const router = express.Router();

router.get(
  "/summary/filter-options",
  authenticate,
  enforceAllowlist,
  listActivationKeyRequestSummaryFilterOptionsHandler
);
router.get("/summary", authenticate, enforceAllowlist, listActivationKeyRequestSummariesHandler);
router.get("/", authenticate, enforceAllowlist, listActivationKeyRequests);
router.post("/approve", authenticate, enforceAllowlist, approveActivationKeyRequestsHandler);
router.post("/disapprove", authenticate, enforceAllowlist, disapproveActivationKeyRequestsHandler);

module.exports = router;
