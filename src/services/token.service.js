const jwt = require("jsonwebtoken");
const { env } = require("../config/env");

const signAccessToken = (user) =>
  jwt.sign(
    {
      sub: String(user.id),
      username: user.username,
      displayName: user.displayName,
    },
    env.jwt.secret,
    {
      expiresIn: env.jwt.expiresIn,
      issuer: env.jwt.issuer,
      audience: env.jwt.audience,
    }
  );

const verifyAccessToken = (token) =>
  jwt.verify(token, env.jwt.secret, {
    issuer: env.jwt.issuer,
    audience: env.jwt.audience,
  });

module.exports = { signAccessToken, verifyAccessToken };
