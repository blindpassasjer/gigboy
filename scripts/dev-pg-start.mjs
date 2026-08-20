import EmbeddedPostgres from "embedded-postgres";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "..", ".pgdata");

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: "gigboy",
  password: "devpassword",
  port: 5432,
  persistent: true,
});

const fresh = !fs.existsSync(dataDir);

if (fresh) {
  await pg.initialise();
}
await pg.start();

if (fresh) {
  await pg.createDatabase("gigboy");
}

console.log("embedded postgres ready on port 5432, db=gigboy user=gigboy");
