const ldap = require("ldapjs");
const { env } = require("../config/env");

const authenticateLdap = (username, password) =>
  new Promise((resolve, reject) => {
    const client = ldap.createClient({
      url: env.ldap.url,
      tlsOptions: { rejectUnauthorized: false },
      timeout: 5000,
      connectTimeout: 5000,
    });

    const userDn = `${username}@${env.ldap.domain}`;

    client.on("error", () => reject(new Error("LDAP connection error")));

    client.bind(userDn, password, (error) => {
      if (error) {
        reject(new Error("Invalid credentials"));
      } 
      else {
        resolve();
      }

      client.unbind();
    });
  });

module.exports = { authenticateLdap };