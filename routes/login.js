const express = require("express");
const router = express.Router();
const { connectToDatabase, sql } = require("../helpers/database_connection");
const { authenticateLDAP } = require("../helpers/ldap");

router.post("/", async (req, res) => {
  const { username, password } = req.body;

  try {
    if (!username || !password) {
      return res.status(400).json({ message: "Username and password required" });
    }
    
    // Authenticate via LDAP
    await authenticateLDAP(username, password);
    
    // Connect to database
    const pool = await connectToDatabase();

    const result = await pool
      .request()
      .input("LDAPUserName", sql.VarChar, username)
      .query(`
        SELECT Id, LoginName, DisplayName, UserName 
        FROM tblSecurityUsers
        WHERE LDAPUserName = @LDAPUserName
      `);

    if (result.recordset.length === 0) {
      return res.status(403).json({
        message: "User authenticated but not registered in system",
      });
    }

    const user = result.recordset[0];

    return res.json({
      message: "Login successful",
      user,
    });

  } 
  catch (err) {
    console.log(`${new Date()} >> Login Error:`, err);
    return res.status(401).json({ message: "Username or password incorrect" });
  }
});

module.exports = router;