const sql = require("mssql");
const { databaseConfig } = require("../config/database");

let poolPromise;

const getPool = async () => {
  if (!poolPromise) {
    poolPromise = new sql.ConnectionPool(databaseConfig).connect();
  }

  return poolPromise;
};

module.exports = { getPool, sql };
