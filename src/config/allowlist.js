const ALLOWED_USERNAMES = Object.freeze(
  [
    "jose.rafael", 
    "marvin", 
    "sharlyn", 
    "diana"
  ]);

const normalizeUsername = (username) => {
  const raw = String(username || "").trim().toLowerCase();

  if (!raw) {
    return raw;
  }

  // Accept equivalent LDAP forms:
  // - DOMAIN\username
  // - username@domain.tld
  const withoutDomainPrefix = raw.includes("\\") ? raw.split("\\").pop() : raw;
  const withoutDomainSuffix = withoutDomainPrefix.includes("@")
    ? withoutDomainPrefix.split("@")[0]
    : withoutDomainPrefix;

  return withoutDomainSuffix;
};

const allowedLookup = new Set(ALLOWED_USERNAMES.map(normalizeUsername));

const isAllowedUsername = (username) => allowedLookup.has(normalizeUsername(username));

module.exports = {
  ALLOWED_USERNAMES,
  isAllowedUsername,
  normalizeUsername,
};
