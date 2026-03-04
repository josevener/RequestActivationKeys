const express = require("express");

const { login, session } = require("../controllers/auth.controller");
const { authenticate, enforceAllowlist } = require("../middleware/auth.middleware");

const router = express.Router();

router.post("/login", login);
router.get("/session", authenticate, enforceAllowlist, session);

module.exports = router;
