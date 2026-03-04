const parseBoolean = (value, defaultValue = false) => {
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }

  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
};

const toInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: toInt(process.env.PORT, 5000),
  corsOrigin: process.env.CORS_ORIGIN || "*",
  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN || "8h",
    issuer: process.env.JWT_ISSUER || "web-approval-app",
    audience: process.env.JWT_AUDIENCE || "web-approval-users",
  },
  db: {
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    server: process.env.DB_SERVER,
    database: process.env.DB_NAME,
    port: toInt(process.env.DB_PORT, 2019),
    encrypt: parseBoolean(process.env.DB_ENCRYPT, false),
    trustServerCertificate: parseBoolean(process.env.DB_TRUST_SERVER_CERTIFICATE, true),
    poolMax: toInt(process.env.DB_POOL_MAX, 10),
    poolMin: toInt(process.env.DB_POOL_MIN, 0),
    idleTimeoutMillis: toInt(process.env.DB_IDLE_TIMEOUT_MS, 300000),
    requestTimeout: toInt(process.env.DB_REQUEST_TIMEOUT_MS, 300000),
    connectionTimeout: toInt(process.env.DB_CONNECTION_TIMEOUT_MS, 60000),
  },
  ldap: {
    url: process.env.LDAP_URL,
    domain: process.env.LDAP_DOMAIN,
  },
};

const requiredKeys = [
  ["JWT_SECRET", env.jwt.secret],
  ["DB_USER", env.db.user],
  ["DB_PASS", env.db.password],
  ["DB_SERVER", env.db.server],
  ["DB_NAME", env.db.database],
  ["LDAP_URL", env.ldap.url],
  ["LDAP_DOMAIN", env.ldap.domain],
];

const missing = requiredKeys.filter(([, value]) => !value).map(([key]) => key);

if (missing.length > 0) {
  throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
}

module.exports = { env };
