const express = require("express");
const authRoutes = require("./auth.routes");
const activationKeyRequestRoutes = require("./activation-key-request.routes");
const { login } = require("../controllers/auth.controller");

const router = express.Router();

router.use("/auth", authRoutes);
router.use("/activation-key-requests", activationKeyRequestRoutes);
router.post("/login", login);

module.exports = router;
