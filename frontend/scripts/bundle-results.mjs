// Converts the committed experiment CSVs into typed JSON shipped in the bundle,
// so every analytics route renders with the backend absent.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const source = join(here, "..", "..", "results", "full");
const target = join(here, "..", "src", "lib", "results", "data");

const EXPERIMENTS = [
  "e1_formulation",
  "e2_encoding",
  "e3_solvers",
  "e4_qaoa",
  "e5_pseudoknot",
];

/** Coerce one CSV cell to a JS value.
 *
 *  Empty and `nan` become null, and null MEANS INDETERMINATE — never false and
 *  never zero. In e3_solvers.csv an empty `found_ground_state` marks a run whose
 *  instance exceeded the exact solver's variable ceiling, so the gate could not be
 *  decided. Rendering that as a failure would invert the finding.
 *
 *  Anything numeric becomes a number, which makes one column mixed-type:
 *  `overlap_penalty` in e1 holds the sentinel "adaptive" alongside 5.0 and 20.0,
 *  so it arrives as `number | "adaptive"`. Compare it numerically or against the
 *  sentinel — `=== "5.0"` will not match, because the value is the number 5.
 */
function parseValue(raw) {
  if (raw === "" || raw === "NA") return null;
  if (raw === "True") return true;
  if (raw === "False") return false;
  if (raw === "nan") return null;
  const num = Number(raw);
  return Number.isNaN(num) || raw.trim() === "" ? raw : num;
}

/** Split one CSV record into fields (RFC 4180: quoted fields may contain commas,
 *  and "" is an escaped quote).
 *
 *  This is a character scan rather than a regex on purpose. A regex of the form
 *  /("([^"]|"")*"|[^,]*)/g over a record loses alignment the moment a field is
 *  empty, because the alternation matches a zero-length string and the match list
 *  stops corresponding to the fields. On these files that silently blanked every
 *  column AFTER an empty one — in e3_solvers.csv the 270 rows with an empty
 *  `found_ground_state` lost `was_repaired`, `attribution` and `runtime_seconds`.
 *  Row counts and the header still looked right, so nothing failed loudly.
 */
function splitRecord(line) {
  const fields = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      fields.push(field);
      field = "";
    } else {
      field += ch;
    }
  }
  fields.push(field);
  return fields;
}

function parseCsv(text) {
  const [header, ...lines] = text.trim().split("\n");
  const columns = splitRecord(header);
  return lines.map((line, index) => {
    const cells = splitRecord(line);
    if (cells.length !== columns.length) {
      // Fail loudly. A row that parses to the wrong width is corrupt data, and
      // padding it with nulls is how wrong numbers reach a chart.
      throw new Error(
        `${columns.length} columns expected but row ${index + 2} has ${cells.length}: ${line.slice(0, 120)}`
      );
    }
    const row = {};
    columns.forEach((column, i) => {
      row[column] = parseValue(cells[i]);
    });
    return row;
  });
}

mkdirSync(target, { recursive: true });
for (const name of EXPERIMENTS) {
  const path = join(source, `${name}.csv`);
  if (!existsSync(path)) {
    // The generated JSON is committed, so the frontend builds from a checkout of
    // frontend/ alone -- which is what lets it deploy without the Python side of
    // the repository present. Regenerate by running this with results/full in
    // place; only then is a missing CSV an error.
    if (existsSync(join(target, `${name}.json`))) {
      console.log(`kept committed ${name}.json (no CSV at ${path})`);
      continue;
    }
    throw new Error(
      `Missing ${path} and no committed ${name}.json. Run \`make reproduce\` first.`
    );
  }
  const rows = parseCsv(readFileSync(path, "utf8"));
  writeFileSync(join(target, `${name}.json`), JSON.stringify(rows));
  console.log(`bundled ${name}: ${rows.length} rows`);
}
