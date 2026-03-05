const express = require("express");

const { login, session } = require("../controllers/AuthController");
const { authenticate, enforceAllowlist } = require("../middleware/AuthMiddleware");

const router = express.Router();

router.post("/login", login);
router.get("/session", authenticate, enforceAllowlist, session);

module.exports = router;
