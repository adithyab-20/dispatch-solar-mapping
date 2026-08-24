import { fmt, monthLabel, MONTH_ORDER } from "@/lib/detail";

export interface MonthTableRow {
  label: string;
  unit: string;
  /** Twelve values in canonical month order. */
  values: number[];
  /** The stored annual figure, or null when none was persisted — never derived. */
  annual: number | null;
  decimals: number;
}

const th: React.CSSProperties = {
  textAlign: "right",
  padding: "5px 6px",
  fontWeight: 500,
  fontSize: "9.5px",
  letterSpacing: ".06em",
  textTransform: "uppercase",
  color: "var(--faint)",
  borderBottom: "1px solid var(--rule-strong)",
};

const td: React.CSSProperties = {
  textAlign: "right",
  padding: "5px 6px",
  color: "var(--ink)",
  borderBottom: "1px solid var(--grid)",
};

/**
 * The backing table for a chart: the same numbers as months-as-columns, so a
 * value is always readable without the chart, and unit-explicit per row
 * (UI brief §5). On small screens the wrapper scrolls sideways.
 */
export function MonthTable({ rows, caption }: { rows: MonthTableRow[]; caption: string }) {
  return (
    <div className="month-table-scroll">
      <table
        className="mono"
        style={{ width: "100%", borderCollapse: "collapse", fontSize: "10.5px" }}
      >
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <th
              scope="col"
              style={{ ...th, textAlign: "left", padding: "5px 8px 5px 0" }}
            >
              Metric
            </th>
            {MONTH_ORDER.map((m) => (
              <th scope="col" key={m} style={th}>
                {monthLabel(m)}
              </th>
            ))}
            <th
              scope="col"
              style={{ ...th, color: "var(--ink)", fontWeight: 600, padding: "5px 0 5px 10px" }}
            >
              Annual
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <th
                scope="row"
                style={{
                  padding: "5px 8px 5px 0",
                  color: "var(--ink)",
                  borderBottom: "1px solid var(--grid)",
                  whiteSpace: "nowrap",
                  fontWeight: 400,
                  textAlign: "left",
                }}
              >
                {row.label} <span style={{ color: "var(--faint)" }}>{row.unit}</span>
              </th>
              {row.values.map((v, i) => (
                <td key={i} style={td}>
                  {fmt(v, row.decimals)}
                </td>
              ))}
              <td style={{ ...td, fontWeight: 600, padding: "5px 0 5px 10px" }}>
                {row.annual === null ? "—" : fmt(row.annual, row.decimals)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
