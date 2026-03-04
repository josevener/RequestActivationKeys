const notFoundHandler = (_req, res) => {
  res.status(404).json({ message: "Route not found" });
};

const errorHandler = (error, _req, res, _next) => {
  const statusCode = error.statusCode || 500;
  const message = statusCode >= 500 ? "Internal server error" : error.message;

  if (statusCode >= 500) {
    console.error(error);
  }

  const response = { message };
  if (statusCode < 500 && error.details !== undefined) {
    response.details = error.details;
  }

  res.status(statusCode).json(response);
};

module.exports = { notFoundHandler, errorHandler };
