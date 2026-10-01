const { createApp } = require("./app");

if (require.main === module) {
  createApp().then(({ app }) => {
    const port = Number(process.env.PORT || 3000);
    const server = app.listen(port);
    server.on("listening", () => console.log(`Site aberto em http://localhost:${port}`));
    server.on("error", (error) => {
      if (error.code === "EADDRINUSE") {
        console.log(`O site já está aberto em http://localhost:${port}. Não é necessário iniciar o servidor novamente.`);
        process.exit(0);
      }
      console.error("Não foi possível iniciar:", error.message);
      process.exit(1);
    });
  }).catch((error) => {
    console.error("Não foi possível iniciar:", error.message);
    process.exit(1);
  });
}

module.exports = { createApp };
