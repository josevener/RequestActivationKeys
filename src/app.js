require("dotenv").config();

const cors = require("cors");
const express = require("express");
const helmet = require("helmet");
const morgan = require("morgan");

const { env } = require("./config/env");
const apiRouter = require("./routes");
const { errorHandler, notFoundHandler } = require("./middleware/error.middleware");

const app = express();

const corsOrigins = env.corsOrigin === "*"
  ? true
  : env.corsOrigin.split(",").map((origin) => origin.trim());

app.disable("x-powered-by");
app.use(helmet());
app.use(morgan(env.nodeEnv === "production" ? "combined" : "dev"));
app.use(cors({ origin: corsOrigins, credentials: true }));
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

app.use("/api", apiRouter);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = { app, env };
