const ldap = require("ldapjs");
const { user } = require("../config/database");
require("dotenv").config();

function authenticateLDAP(username, password) {
  return new Promise((resolve, reject) => {
    const client = ldap.createClient({
      url: process.env.LDAP_URL,
      tlsOptions: {
        rejectUnauthorized: false
      },
      timeout: 5000,
      connectTimeout: 5000,
    });

    client.on("error", (err) => {
      reject("LDAP connection error");
    });

    const userDN = `${username}@${process.env.LDAP_DOMAIN}`;
    // const userDN = `JEONSOFT\\${username}`;

    client.bind(userDN, password, (err) => {
      if (err) {
        reject("Invalid LDAP credentials");
      } 
      else {
        resolve("Authenticated");
      }

      client.unbind();
    });
  });
}

module.exports = { authenticateLDAP };
