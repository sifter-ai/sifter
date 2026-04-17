import chalk from "chalk";
import Table from "cli-table3";

export function isJsonMode(forceJson: boolean): boolean {
  return forceJson || !process.stdout.isTTY;
}

export function printJson(data: unknown): void {
  process.stdout.write(JSON.stringify(data, null, 2) + "\n");
}

export function printTable(rows: Record<string, unknown>[]): void {
  if (rows.length === 0) {
    console.log(chalk.dim("(no results)"));
    return;
  }
  const keys = Object.keys(rows[0]!);
  const table = new Table({ head: keys.map(k => chalk.cyan(k)) });
  for (const row of rows) {
    table.push(keys.map(k => {
      const v = row[k];
      return v == null ? chalk.dim("—") : String(v);
    }));
  }
  console.log(table.toString());
}

export function autoFormat(data: unknown, forceJson: boolean): void {
  if (isJsonMode(forceJson)) {
    printJson(data);
  } else if (Array.isArray(data)) {
    printTable(data as Record<string, unknown>[]);
  } else {
    printTable([data as Record<string, unknown>]);
  }
}

export function ok(msg: string): void {
  console.log(chalk.green("✓") + " " + msg);
}

export function err(msg: string): void {
  console.error(chalk.red("✗") + " " + msg);
}
