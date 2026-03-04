const { env } = require("../config/env");
const { authenticateUser } = require("../services/auth.service");
const { signAccessToken } = require("../services/token.service");
const { HttpError } = require("../utils/http-error");

const login = async (req, res, next) => {
  const { username, password } = req.body || {};
  const parsedUsername = String(username || "").trim();

  if (!parsedUsername || !password) {
    return next(new HttpError(400, "Username and password are required"));
  }

  try {
    const user = await authenticateUser({ username: parsedUsername, password });
    const accessToken = signAccessToken(user);

    return res.status(200).json({
      accessToken,
      tokenType: "Bearer",
      expiresIn: env.jwt.expiresIn,
      user,
    });
  } catch (error) {
    return next(error);
  }
};

const session = (req, res) => {
  return res.status(200).json({ user: req.user });
};

module.exports = { login, session };
