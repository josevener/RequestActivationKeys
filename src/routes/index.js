const express = require("express");
const authRoutes = require("./auth");
const activationKeyRequestRoutes = require("./activation_key_request");
const { login } = require("../controllers/AuthController");

const router = express.Router();

router.use("/auth", authRoutes);
router.use("/activation_key_requests", activationKeyRequestRoutes);
router.post("/login", login);

module.exports = router;

