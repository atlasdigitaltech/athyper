# Shared chart — blueprint

**Moved, not rewritten (10 October 2026).** Every section below was moved verbatim from the [Entity list Aggregate blueprint](../entity-list-aggregate/blueprint.md), revision 8, where the project owner approved it as the A5 chart contract (Aggregate decisions 9–15). This commit only moves it. Section and decision numbers keep their Aggregate numbers, so approvals and citations stay valid. The owner confirms after an independent diff check that the approval covers the moved text.

## Shape

**Status of this section:** approved (decisions 9–15, 10 October 2026; status block). Not built.

**Shape.** A chart is not a Summary feature but a platform component that Summary is the first to use. There are three layers, and only the third knows about Entities:

1. **A chart-data contract** (`@athyper/contract-platform-chart`): pure data, no fetching, no Entity types.
2. **A `Chart` component** in the design system (`@athyper/platform-ui`), drawn as hand-written SVG with theme tokens.
3. **One adapter per consumer.** Summary's adapter (`summaryChartData`, in `list-view`) turns the Summary response it already has into chart data. It sends no request.

The dependency direction is fixed:
- `platform-ui` imports only the chart contract;
- the adapter imports the chart contract and the Entity list contracts;
- nothing in the chart layer imports Entity code.

So a non-Entity consumer can use the chart without the Entity list contracts.

### 13.1 Current-state facts

Verified on 10 October 2026.

| Fact | Evidence | Consequence |
| --- | --- | --- |
| The theme defines no chart or series colour tokens | `packages/platform/foundation/theme/src/styles.css` has no `--a-chart-*` or series token | A5's first step is a design-system change: a validated categorical palette (13.4) |
| No chart library is a dependency anywhere in the workspace | no `recharts`, `echarts`, `d3`, `chart.js`, `visx`, `nivo` or `vega` in any package manifest | Hand-written SVG adds no dependency (decision 10) |
| Experience surfaces (Home, workspace) already declare a `chart` block, `visualization: "bar" \| "line" \| "donut" \| "metric"`, whose data is `chart?: readonly number[]`. It is rendered as the numbers in text | `contract-platform-dashboard` (`ExperienceBlock`), `platform/shell/dashboard` (`ExperienceDataResult`, block renderer) | An existing would-be consumer with no labels, units or exactness. A5 does not change it; adopting the chart there is a separate decision (13.8) |
| The Summary response carries exact decimals as text or JSON numbers, with withheld states | section 5.5, `parseGroupTotals` | The chart contract keeps exact text for anything shown (13.2) |
| Summary rows follow the server's order, by raw key; grouped Table orders a choice dimension by published choice order | `summaryRows`, `groupHeadings` | A status dimension would read alphabetically by code in Summary and its chart. Decision 14 aligns Summary with the published order |

### 13.2 The chart-data contract

```ts
// @athyper/contract-platform-chart
export interface ChartDataV1 {
  readonly schemaVersion: 1;
  /** The categories in the order the producer gives them; the chart never sorts. */
  readonly categories: readonly { readonly key: string; readonly label: string }[];  // 1–52
  readonly categoryAxis: {
    readonly label: string;
    /** The categories form a sequence (dates, periods), so a line is meaningful.
     * Set by the producer from its own ordering, never inferred by the chart. */
    readonly ordered: boolean;
  };
  /** One series per measure-and-column the producer charts; all share one unit. */
  readonly series: readonly ChartSeriesV1[];  // 1–8
  /** [series][category], aligned with `series` and `categories`. */
  readonly points: readonly (readonly ChartPointV1[])[];
  /** More categories, or more series, exist than are given. */
  readonly truncated?: { readonly categories?: true; readonly series?: true };
}

export interface ChartSeriesV1 {
  readonly key: string;
  readonly label: string;
  readonly valueKind: "count" | "integer" | "decimal" | "money";
  /** A currency or unit code shown with every value; one per chart. */
  readonly unit?: string;
  /** The series' values are parts of one whole: a count, or an additive sum in
   * one unit, all non-negative. Only then are shares, stacking, pies and an
   * "Others" slice meaningful. Set by the producer. */
  readonly partOfWhole: boolean;
  /** The server's total for the series, over every category including any not
   * given; the denominator of a share. Required for a part-of-whole series. */
  readonly total?: ChartPointV1;
  /** "Others": the categories not given, as one point. Only for a part-of-whole
   * series, and only when the producer can state it exactly (13.5). */
  readonly rest?: ChartPointV1;
}

export type ChartPointV1 =
  | { readonly kind: "value"; readonly value: string }  // an exact decimal, as text
  | { readonly kind: "notSummable" | "suppressed" | "mixedCurrency" | "unknownCurrency" | "empty" };
```

**Rules of the contract:**
- **The chart never computes a total.** It draws the points it is given, and computes a share only as point ÷ `total`, both from the producer.
- **Exact text for everything shown.** Data labels, tooltips and the data table use the point's decimal text, formatted by the consumer's formatter. The component converts to a number **only for geometry** (bar lengths, slice angles, line positions), where rounding to a pixel is invisible.
- **One unit per chart.** Series with different units or currencies are never drawn on one axis. There is no dual axis.
- **A parser validates every payload,** in the same style as the list contracts: alignment of `points` with `series` and `categories`, the bounds, decimal text, and the part-of-whole rules (a `rest` only on a part-of-whole series, a `total` required there).
- **Labels only.** Categories and series carry readable labels. A producer must not put identifiers in a label; Summary's adapter uses the same server labels as the grid.

### 13.3 The `Chart` component

```ts
<Chart
  data={ChartDataV1}
  type="column" | "bar" | "line" | "stackedColumn" | "groupedColumn" | "pie" | "donut"
  dataLabel="value" | "percentage" | "none"
  caption={string}                                    // the chart's accessible name
  format={(point: string, series: ChartSeriesV1) => string}  // the consumer's locale formatting
  stateLabel={(kind, series) => string}                // the consumer's words for withheld points
  onSelect?={(category: string, series: string) => void}     // a drill-down, when the consumer offers one
/>
```

- **Type availability** comes from one exported function, `chartTypes(data)`, which returns each type as available or unavailable with a reason code. The consumer's type picker shows unavailable types disabled with their reason, the same pattern as the list's unavailable modes. The codes and their messages are published here, not invented in the build:

  | Code | Message (English; `chart.unavailable.*`, three locales) |
  | --- | --- |
  | `CHART_NO_VALUES` | "There are no values to chart." |
  | `CHART_UNORDERED` | "A line needs a sequence, such as dates or periods." |
  | `CHART_SERIES_COUNT` | "Choose between 2 and 8 columns to compare." |
  | `CHART_NOT_PART_OF_WHOLE` | "These values aren't parts of one total." This covers averages, minimums, maximums, distinct counts, balances and mixed currencies |
  | `CHART_NEGATIVE` | "A pie can't show negative values." |
  | `CHART_WITHHELD` | "Some values are withheld, so shares can't be shown." |
  | `CHART_TOO_MANY_SLICES` | "Too many values for a pie; choose a column chart." |
  | `CHART_TRUNCATED` | "Only the first values are shown, so shares can't be shown." |

  A point's own state (`notSummable`, `suppressed`, `mixedCurrency`, `unknownCurrency`) keeps the Summary's existing messages, passed through `stateLabel`. The chart codes say why a chart *type* is unavailable, and never restate why a *value* is withheld.

  | Type | Available when | Otherwise |
  | --- | --- | --- |
  | `column`, `bar` | one series, at least one value | `CHART_NO_VALUES` |
  | `line` | `categoryAxis.ordered`, one series | `CHART_UNORDERED` |
  | `groupedColumn` | 2–8 series | `CHART_SERIES_COUNT` |
  | `stackedColumn` | 2–8 series, all part-of-whole, one unit | `CHART_NOT_PART_OF_WHOLE` |
  | `pie`, `donut` | one part-of-whole series; all values ≥ 0; no withheld point; at most 6 slices including "Others"; not truncated, or truncated with an exact `rest` | `CHART_NOT_PART_OF_WHOLE`, `CHART_NEGATIVE`, `CHART_WITHHELD`, `CHART_TOO_MANY_SLICES`, `CHART_TRUNCATED` |

- **Data labels.** `value` shows the formatted exact text. `percentage` is offered only for a part-of-whole series, computed as point ÷ `total`. `none` shows no labels.
- **Axes.**
  - A value axis for column, bar and line starts at zero, so a bar's length is its value.
  - Ticks are "nice" round values computed from the given points.
  - **Direction (decision 15, as amended):**
    - The chart's chrome mirrors with the document direction: plot origin, value-axis side and label padding, legend position, tooltip anchoring.
    - A categorical axis mirrors too: in a right-to-left locale the first category is on the right.
    - A **time axis** (`categoryAxis.ordered`) runs earliest on the left in every locale. A time axis's direction is a physical convention cued by its label, not reading order.
    - Labels are localized and bidi-correct either way.
    - The chart's data table follows the document direction, as the Summary grid does.
- **Withheld points.** A point that is not a value is not drawn, and is not a zero. The chart lists each one under it in the consumer's words, for example "Cash: Closing net total, not summed across Fiscal period".
- **Truncation.** When `truncated` is set, a notice under the chart says the chart shows the first categories or series, and nothing implies completeness. A pie is unavailable unless an exact `rest` is given.
- **Legend.** It is shown for multiple series and for pies. Long labels end in an ellipsis; the full label is in the tooltip and the data table. There is no "legend length" setting.
- **Interaction and accessibility.**
  - The chart is one tab stop; the arrow keys move between points (roving focus, the tree grid's pattern).
  - Each point has an accessible name: category, series, formatted value, and share when shown.
  - Enter calls `onSelect`.
  - The SVG has `role="img"` with the caption and a one-line summary.
  - The data itself is always available as a table: for Summary, its own grid (13.6); for other consumers, a "Show data table" disclosure rendered by the component from the same `ChartDataV1`.
- **Motion.** None beyond a short fade on data change, removed under `prefers-reduced-motion`.

### 13.4 Chart colour tokens (A5's first step)

- **What the theme gains:** a categorical palette, `--a-chart-1` … `--a-chart-8`, plus `--a-chart-rest` (a neutral for "Others") and `--a-chart-grid`/`--a-chart-axis`, defined for light and dark themes and every brand theme the theme package carries.
- **Validated, not chosen by eye.** Each colour against the surface for non-text contrast (at least 3:1); adjacent series for separation under the common colour-vision deficiencies; and the text colours used for data labels on each fill. The dataviz skill's validator runs as part of the theme's tests, so a palette edit that breaks contrast fails.
- **Colour supports, never carries, meaning.** Series also differ by legend order and label, and in a stacked column by position; a withheld point is text.
- **The gates** (`policy:design-system`, `policy:style-tokens:strict`) stay clean: the component uses only tokens.

### 13.5 "Others"

- `rest` is exact only for a count, or a sum of an additive field in one unit: the server's total minus the given points, by exact decimal subtraction.
- It is never given for an average, minimum, maximum, distinct count or semi-additive balance, where "total minus shown" means nothing, or when any given point is withheld.
- The adapter computes it; the chart only draws it. Its label is the consumer's "Others" text, and its colour is `--a-chart-rest`.
- Without a `rest`, a truncated pie is unavailable (`CHART_TRUNCATED`), and the column chart shows the truncation notice.

### 13.7 Other consumers (not in A5)

The component is built for reuse, but A5 adopts it only in Summary. Each later use is its own decision, with its own adapter and tests:
- inside the Entity Framework: Board's lane distribution, Matrix's column comparison, and a declared metric section on a record page (which would need published metadata);
- outside it: the experience surfaces' `chart` block, whose data contract (`number[]`) would move to `ChartDataV1`, under the design-system authorization of 1 October 2026;
- "Add to Dashboard" stays out of scope.

### Build steps (moved from Aggregate 13.8)

| Step | Delivers | Acceptance |
| --- | --- | --- |
| **A5.1** | Chart colour tokens (13.4) in the theme, validated | The validator in the theme's tests; light, dark and brand themes; gates clean |
| **A5.2** | `@athyper/contract-platform-chart` (types, parser, `chartTypes`) and the `Chart` component | Contract tests over every rule in 13.2 and the availability table in 13.3; jsdom tests for labels, states, truncation, keyboard and the data table; a package-ownership row (foundation section 9, point 4) |

## Decisions (moved from Aggregate section 14)

9. **A reusable chart in three layers:** a platform chart-data contract, `@athyper/contract-platform-chart` (not in the Entity list contracts), a design-system `Chart` component, and one adapter per consumer (section 13).
10. **Hand-written SVG with theme tokens,** no chart library (13.1, 13.3).
11. **The chart types and their guardrails** in the 13.3 availability table:
    - pies and donuts only for one part-of-whole series of at most 6 slices;
    - "Others" only where exact (13.5);
    - no area, "Combination" or 3-D chart, and no dual axis.
13. **Chart colour tokens as A5's first step,** validated in the theme's tests (13.4).
15. **Right to left, separated (amended and approved, revision 8):** the chart's chrome and a categorical axis mirror with the document direction; a time axis stays earliest on the left in every locale; labels are localized and bidi-correct in both (13.3). As first written, it mirrored time axes too.

## Rejected options (moved from Aggregate section 18)

| Option | Why not |
| --- | --- |
| A chart library (ECharts, Recharts, visx, Chart.js) | Brings its own colours, tooltips, legends and right-to-left assumptions, which would have to be suppressed for a narrow set of types; and a bundle cost. Hand-written SVG keeps tokens, dark mode, RTL and accessibility in our hands (decision 10) |
| A chart contract inside the Entity list contracts | Every non-Entity consumer would import the Entity list contracts; the chart is a platform contract (decision 9) |
| Area, "Combination", 3-D and dual-axis charts | 3-D distorts values; two axes invite false correlation and mix units; area adds little over line for the dimensions here |
| Totals or shares computed from drawn points | Wrong for every non-additive measure and whenever categories are cut off; the chart uses the producer's totals |
| "Others" for averages, minimums, maximums, distinct counts or balances | "Total minus shown" has no meaning for them (13.5) |
| One tab stop per chart point | Up to 52 × 8 tab stops; the chart is one tab stop with arrow keys |

## Review disposition (moved from Aggregate section 19)

| Review | Finding | Disposition |
| --- | --- | --- |
| Audit round 9 | A5: three layers, SVG, the type set with pie and "Others" guardrails, Top / Bottom N later, the contract as a platform contract | Section 13; decisions 9–12 |
| Author, on audit round 9 | No chart colour tokens exist; exact text for display but numbers for geometry; Top / Bottom N shares a capability with Matrix's "Lowest on n items"; Summary rows should follow the published choice order; a new package needs its ownership row | Decisions 13 and 14; 13.1–13.3; A6; 13.8 (A5.2) |
| Author | The experience surfaces' `chart` block (`number[]`, rendered as text) is an existing would-be consumer | Recorded (13.1, 13.7); not changed in A5 |
| Owner (10 October 2026) | "Decisions (section 14, 9–15): Approved" | Status block; section 13 approved |
| Audit round 10 | Decision 15: separate the axis from the content, mirroring chrome and categorical axes but keeping time axes earliest on the left; the spec should assert it | Approved by the owner ("Approved"); 13.3, 13.6, decision 15 |
| Audit round 10 | List the unavailable-type reason codes in the blueprint, not only in code | The codes were already in the 13.3 availability table; revision 8 adds their messages and separates them from value states |
