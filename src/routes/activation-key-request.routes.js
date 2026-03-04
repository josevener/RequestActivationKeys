const express = require("express");
const {
  listActivationKeyRequestSummariesHandler,
  listActivationKeyRequests,
  approveActivationKeyRequestsHandler,
} = require("../controllers/activation-key-request.controller");
const { authenticate, enforceAllowlist } = require("../middleware/auth.middleware");

const router = express.Router();

router.get("/summary", authenticate, enforceAllowlist, listActivationKeyRequestSummariesHandler);
router.get("/", authenticate, enforceAllowlist, listActivationKeyRequests);
router.post("/approve", authenticate, enforceAllowlist, approveActivationKeyRequestsHandler);

module.exports = router;
