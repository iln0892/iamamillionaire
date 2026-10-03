import { writeFile, cp } from "node:fs/promises";
await writeFile("docs/.nojekyll", "");
await cp("node_modules/sql.js/dist/sql-wasm.wasm", "docs/sql-wasm.wasm");
