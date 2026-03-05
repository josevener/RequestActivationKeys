const { isAllowedUsername } = require("../config/allowlist");
const { verifyAccessToken } = require("../services/TokenService");

const parseBearerToken = (headerValue) => {
  if (!headerValue) {
    return null;
  }

  const [scheme, token] = headerValue.split(" ");
  if (scheme !== "Bearer" || !token) {
    return null;
  }

  return token;
};

const authenticate = (req, res, next) => {
  const token = parseBearerToken(req.headers.authorization);

  if (!token) {
    return res.status(401).json({ message: "Missing or invalid Authorization header" });
  }

  try {
    const payload = verifyAccessToken(token);

    req.user = {
      id: payload.sub,
      username: payload.username,
      displayName: payload.displayName,
    };

    return next();
  } catch (_error) {
    return res.status(401).json({ message: "Invalid or expired session token" });
  }
};

const enforceAllowlist = (req, res, next) => {
  if (!req.user || !isAllowedUsername(req.user.username)) {
    return res.status(403).json({ message: "You are not authorized to access this application" });
  }

  return next();
};

module.exports = { authenticate, enforceAllowlist };
