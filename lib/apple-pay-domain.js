const fs = require("node:fs/promises");
const path = require("node:path");

// Domain verification ONLY. This does not enable Apple Pay or generate certificates.
function registerApplePayDomain({ app, origin, dataDir, enabled = process.env.APPLE_PAY_DOMAIN_VERIFICATION === "1" }) {
  const routes = ["/.well-known/apple-developer-merchantid-domain-association",
    "/.well-known/apple-developer-merchantid-domain-association.txt"];
  app.get(routes, async (_req, res) => {
    if (!enabled || !origin.startsWith("https://")) return res.sendStatus(404);
    try {
      const root = await fs.realpath(dataDir);
      const file = await fs.realpath(path.join(root, "apple-pay", "domain-association.txt"));
      const relative = path.relative(root, file);
      if (relative.startsWith("..") || path.isAbsolute(relative)) return res.sendStatus(404);
      const stat = await fs.stat(file);
      if (!stat.isFile() || !stat.size || stat.size > 131072) return res.sendStatus(404);
      const content = await fs.readFile(file);
      if (/-----BEGIN .*?(?:PRIVATE KEY|CERTIFICATE)-----/.test(content.toString("utf8"))) return res.sendStatus(404);
      res.set("Cache-Control", "no-store").type("text/plain").send(content);
    } catch { res.sendStatus(404); }
  });
}

module.exports = { registerApplePayDomain };
