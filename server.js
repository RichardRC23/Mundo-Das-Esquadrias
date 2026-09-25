const { createApp } = require("./app");

if (require.main === module) {
  createApp().then(({ app }) => {
    const port = Number(process.env.PORT || 3000);
    const server = app.listen(port, () => console.log(`Site aberto em http://localhost:${port}`));
    server.on("error", (error) => {
      console.error("Não foi possível iniciar:", error.message);
      process.exit(1);
    });
  }).catch((error) => {
    console.error("Não foi possível iniciar:", error.message);
    process.exit(1);
  });
}

module.exports = { createApp };
