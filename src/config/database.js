const { env } = require("./env");

const databaseConfig = {
  user: env.db.user,
  password: env.db.password,
  server: env.db.server,
  database: env.db.database,
  port: env.db.port,
  options: {
    enableArithAbort: true,
    appName: "web-approval-backend",
    encrypt: env.db.encrypt,
    trustServerCertificate: env.db.trustServerCertificate,
  },
  pool: {
    max: env.db.poolMax,
    min: env.db.poolMin,
    idleTimeoutMillis: env.db.idleTimeoutMillis,
  },
  requestTimeout: env.db.requestTimeout,
  connectionTimeout: env.db.connectionTimeout,
};

module.exports = { databaseConfig };
