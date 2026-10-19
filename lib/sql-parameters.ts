// Convert positional SQLite parameters without touching question marks in literals.
export function postgresParameters(sql: string) {
  let number = 0;
  let quote = "";
  let output = "";
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (quote) {
      output += ch;
      if (ch === quote) {
        if (sql[i + 1] === quote) {
          output += sql[++i];
        } else quote = "";
      }
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      output += ch;
    } else output += ch === "?" ? "$" + ++number : ch;
  }
  return output;
}
