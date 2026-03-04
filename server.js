const { app, env } = require("./src/app");

app.listen(env.port, () => {
  console.log(`Backend listening on http://127.0.0.1:${env.port}`);
});
