const { isAllowedUsername, normalizeUsername } = require("../config/allowlist");
const { getPool, sql } = require("./DbService");
const { authenticateLdap } = require("./LdapService");
const { HttpError } = require("../utils/http-error");

const findSecurityUser = async (username) => {
  const pool = await getPool();

  const result = await pool
    .request()
    .input("username", sql.NVarChar(255), username)
    .query(`
      SELECT TOP 1
        Id,
        UserName,
        LoginName,
        DisplayName,
        LDAPUserName
      FROM tblSecurityUsers
      WHERE UserName = @username
         OR LoginName = @username
         OR LDAPUserName = @username
    `);

  return result.recordset[0] || null;
};

const getUsernameCandidates = (user, fallbackUsername) => {
  const values = [fallbackUsername, user.UserName, user.LoginName, user.LDAPUserName]
    .filter(Boolean)
    .map((value) => String(value).trim());

  const seen = new Set();
  const unique = [];

  for (const value of values) {
    const key = value.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(value);
    }
  }

  return unique;
};

const authenticateUser = async ({ username, password }) => {
  const parsedUsername = String(username || "").trim();

  try {
    await authenticateLdap(parsedUsername, password);
  } 
  catch (_error) {
    throw new HttpError(401, "Invalid username or password");
  }

  const user = await findSecurityUser(parsedUsername);

  if (!user) {
    throw new HttpError(401, "Invalid username or password");
  }

  const usernameCandidates = getUsernameCandidates(user, parsedUsername);
  const allowedUsername = usernameCandidates.find((candidate) => isAllowedUsername(candidate));

  if (!allowedUsername) {
    throw new HttpError(403, "You are not authorized to access this application");
  }

  const resolvedUsername = normalizeUsername(allowedUsername);

  return {
    id: user.Id,
    username: resolvedUsername,
    displayName: user.DisplayName || resolvedUsername,
  };
};

module.exports = { authenticateUser };
