const sql = require("mssql")
const config = require("../config/database")

let poolPromise = null

async function connectToDatabase() {
    try {
        // Reuse the same connection pool instead of creating a new one per request
        if (!poolPromise) {
            poolPromise = new sql.ConnectionPool(config).connect()
        }

        // Wait until the pool is ready and return it
        const pool = await poolPromise
        return pool
    } 
    catch (err) {
        console.log(`${new Date()} connectToDatabase >> Database connection failed:`, err)
        throw err
    }
}

module.exports = { connectToDatabase, sql }