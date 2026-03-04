const config = {
    // SQL Server credentials loaded securely from environment variables
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    server: process.env.DB_SERVER,
    database: process.env.DB_NAME,
    port: parseInt(process.env.DB_PORT),

    options: {
        enableArithAbort: true,
        appName: "my-application",
        encrypt: false,               // Set true when using Azure SQL or TLS-required servers
        trustServerCertificate: true, // Needed for self-signed certs / local dev to avoid SSL errors
    },

    pool: {
        max: 10,                   // Maximum simultaneous DB connections
        min: 0,                    // Minimum idle connections to keep open
        idleTimeoutMillis: 300000, // Close idle connections after 5 mins to free resources
    },

    requestTimeout: 300000,  // Max time a query is allowed to run (5 mins)
    connectionTimeout: 60000 // Max time allowed to establish a DB connection (60s)
}

module.exports = config