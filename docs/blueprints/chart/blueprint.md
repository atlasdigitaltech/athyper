# Shared chart — blueprint

**Status:** approved; A5.1a built through decision 25; A5.1b candidate sets proposed; revision 10 (10 October 2026).
- **A5.1b started (10 October 2026):** "go ahead". The validator carries the high-contrast length (decision 27). Five candidate sets pass with no findings and nothing relieved, and await approval before they become tokens (13.4a.11). Decision 28 is proposed.
- **Decisions 24–27 approved (10 October 2026):** "Approved". 24 and 25 are built into the validator (13.4a.10); 26 and 27 govern A5.1b, which may now proceed.
- **Decision 23 approved and built (10 October 2026):** "Decision 23: approved". Every pair of sequence colours is checked, not only palette neighbours (13.4a.9). Decisions 24–27 were proposed with it and approved next.
- **Decisions 20–22 approved (10 October 2026)** in the owner's words "Three proposals - Approved":
  - 21 (tones against series colours) and 22 (the 2:1 floor under relief) are built into the validator;
  - 20 (the runtime check of drawn pairs) belongs to the A5.2 component.

  Building them showed a gap in the approved neighbour rule; decision 23 is proposed to close it (13.4a.8).
- **Relief rule approved (10 October 2026)** in the owner's words "approved yes to the relief rule", in the scope audit round 13 gave it (13.4a.7). A series fill below 3:1 is allowed only with direct labels and the data table. Status tones, the axis and the grid's reference always meet 3:1. Built into the validator, with the grid rule corrected. Decisions 20–22 are proposed, not approved (13.4a.7).
- **A5.1a built (10 October 2026)** on the owner's instruction "go ahead and start build A5.1a", with reference to the [Neon Chart Prototype](../../prototypes/Neon%20Chart%20Prototype.html). The colour validator is in the theme package with its own tests (13.4a.6). No chart colour tokens exist yet: that is A5.1b, and the prototype's palette does not pass the validator (13.4a.6, point 5).
- **13.4a approved (10 October 2026).** The owner approved decisions 16–19 in these words: "16, 17, 18 and 19 approved". Where 13.4a and 13.4 differ, 13.4a governs:
  - the validator is A5.1a, built before the token sets (A5.1b);
  - colours are keyed;
  - colour by meaning comes through `resolveEntityStatusTone` plus an own-key check, reaching the component through the optional `toneOf` prop (13.3 amended);
  - Mono gets validated chromatic series;
  - colour comes from three sources only.

  No build instruction for A5 is recorded yet.
- **Revision 2** (audit round 11, section "Review disposition"):
  - closes the data-shape gap for the experience surfaces' `chart` block (Consumers);
  - folds 13.7 into the Consumers table, so there is one list of consumers;
  - says where 13.6 and 13.8 live.

  No approved decision changes.
- **Approval.** The owner approved this contract as the Entity list Aggregate blueprint's A5 decisions 9–15, in two steps:
  - "Decisions (section 14, 9–15): Approved";
  - decision 15 amended to its separated form, "Approved" (Aggregate status block, revision 8).
- **Moved here** on the owner's instruction ("go ahead") in a move-only commit (`6d9510f29`), verified line by line: every line removed from the Aggregate blueprint appears here unchanged. **Owner confirmation (10 October 2026):** after the audit's independent check of the move, the owner confirmed that the approval covers the moved text, in these words: "approved which covers the moved text".
- **Build:** no build instruction is recorded. A5.1 (chart colour tokens) comes first, then A5.2 (the contract and the component).
- **Authority.** This is shared Entity Framework work under [AGENTS.md](../../../AGENTS.md): its first consumer is the Entity list Summary. The component lives in the design system under the owner's front-end design-system authorization of 1 October 2026. This document gives no authority to adopt the chart anywhere: each consumer needs its own approved decision (Consumers, below).
- **Numbering.** Sections 13.1–13.5 and 13.7, and decisions 9, 10, 11, 13 and 15, keep their Aggregate numbers, so approvals and citations stay valid. 13.6 (Summary's use of the chart) and 13.8 (A5's steps, including A5.3) remain in the [Aggregate blueprint](../entity-list-aggregate/blueprint.md); the gaps here are those sections, not omissions. Update this document in place. Do not create competing chart plans.

## Consumers

Each consumer has its own adapter, its own approved decision and its own tests. The chart contract and component change only through this document, and a change that a consumer relies on updates that consumer's blueprint in the same change.

**The contract owns the data shape, not only the component.** Any surface that draws a chart, Entity list or not, gives the component `ChartDataV1`. A consumer whose data arrives in another shape converts it in its adapter or its data source; it never keeps a second shape beside the contract or a second renderer for it. This matters most where the shape is not yet in any contract. The experience surfaces' `chart` block names a registry data source (`registryRef(item.dataSource, …)` in `contract-platform-dashboard`), and its `number[]` shape is known only to the runtime that supplies it (`ExperienceDataResult` in `platform/shell/dashboard`).

| Consumer | Status | Where it is decided |
| --- | --- | --- |
| Entity list Summary | Approved (A5.3), not built | [Aggregate blueprint](../entity-list-aggregate/blueprint.md) sections 13.6 and 13.8, decisions 12 and 14 |
| Experience surfaces' `chart` block (Home, workspace) | Candidate; not approved. Conditions of adoption: its registry data source returns `ChartDataV1`, so the shape moves with the component rather than beside it, and the `number[]` result is retired. The block's declared `visualization` (`bar`, `line`, `donut`, `metric`) is a request, not an instruction: `chartTypes(data)` decides, and an unavailable type renders its reason code's message, never an empty or misleading chart. `metric` is a single number, not a chart, and is decided with the block | A future owner decision, under the design-system authorization of 1 October 2026, recorded here |
| Board lane distribution, Matrix column comparison, a declared record-page metric section | Candidates; not approved | Each layout's own blueprint, then recorded here |
| "Add to Dashboard" | Out of scope | Needs its own owner instruction |

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

### 13.4a Colour: amendments to 13.4 (approved, revision 4; decisions 16–19)

**Why.** Approved 13.4 names "the dataviz skill's validator" as the check that runs in the theme's tests. Neither exists in the repository:
- the theme package has no test script and no tests;
- no code computes contrast, luminance or colour-vision separation;
- the dataviz skill is an authoring aid available to the assistant, not a repository test.

A palette checked by nothing ships on judgement. This amendment makes the check a deliverable and settles how colours are chosen in both Atlas families.

#### 13.4a.1 The validator comes first (replaces 13.4's sentence naming the dataviz validator)

- **A5.1 splits in two:**
  - **A5.1a**, a colour validator module;
  - **A5.1b**, the token sets, which must pass it.
- **Where it lives.** The validator lives in the design system's theme package (`@athyper/platform-theme`), not the chart package, because it outlives charts. The theme package gains a test script, and the validator runs over every token set.
- **What it does.** It is a pure module with deterministic inputs:
  - WCAG relative luminance and contrast ratio;
  - simulated protanopia, deuteranopia and tritanopia;
  - a perceptual distance (CIEDE2000). Its threshold is fixed in the module, and recorded in this document at the build with the reason for its value.
- **The criteria, per element class** (one ratio for everything would let grid lines pass at a contrast that dominates the data):

  | Element | Criterion |
  | --- | --- |
  | Each series fill, the single-series colour and the tone colours | At least 3:1 against the plot background |
  | Neighbouring series | Distinguishable from each other under each simulated deficiency, at the module's perceptual distance |
  | Axis lines | At least 3:1 against the background |
  | Grid lines | Lower contrast than every series fill, so the data dominates (an upper bound, not a minimum) |
  | Label text drawn on a fill | At least 4.5:1. Where a fill cannot carry a label, the label is drawn outside it |

- **Scope.** All six sets (Atlas Modern and Atlas Mono, each light, dark and high contrast) must pass. Forced colours uses system colours and is exempt, which is why direct labels are mandatory there (13.4a.4).

#### 13.4a.2 One colour role per job, as tokens (refines 13.4's token list)

| Token | Atlas Modern | Atlas Mono |
| --- | --- | --- |
| `--a-chart-single` (one series) | from the brand token | the family's ink (near black in light, near white in dark) |
| `--a-chart-1` … `--a-chart-8` (several series) | validated categorical hues | validated categorical hues, **not greys** (decision 16) |
| `--a-chart-neutral` ("Others") | neutral grey | neutral grey |
| `--a-chart-grid`, `--a-chart-axis` | greys within 13.4a.1 | greys within 13.4a.1 |
| Tones: neutral, success, warning, danger | the existing status tokens | the existing status tokens, already in colour in Mono |

- The values are hexes inside the six token sets.
- A mode or family switch is a token override, never a component branch.
- Dark mode is tuned on its own values, not inverted.
- High contrast uses fewer, more widely separated hues with heavier strokes.

#### 13.4a.3 Which colour a series or category gets (replaces 13.4's silence on assignment)

- **The three sources of colour.** Colour reaches a chart from exactly three sources: the theme's sequence, the brand token for a single series, and published metadata for meaning. It never comes from a user or tenant preference (decision 18).
- **Colour by meaning (decision 17).** A category or series that is a value of a field publishing `statusTones` takes its tone colour, decided by the resolver every other surface uses (`resolveEntityStatusTone`, `contract-platform-entity-runtime`). Badges, Board lanes, comparison chips and charts therefore cannot disagree.
  - **One correction to how it is used:** the resolver returns `"neutral"` both for a declared neutral tone and for a value with no tone. The adapter therefore first checks that the field's `statusTones` has the value as its own key. A value with no tone keeps its sequence colour; only a declared tone uses a tone colour.
  - A tone belongs to the field that declares it. Another field with a choice of the same name is not toned.
- **Carrying the tone to the component.** The chart-data format stays shape-only, with no tone field in `ChartDataV1`. The component gains one optional prop, `toneOf(key) => "neutral" | "success" | "warning" | "danger" | undefined`, defined in the chart contract with the same four tones and no Entity import. Summary's adapter implements it from the resolver. This amends 13.3's prop list (decision 17); a tone field in the data format was the alternative, with its field-and-value provenance.
- **Stable sequence colours (decision 19).** A series or category is coloured by its **key**, never by its position in the array, so filtering one away does not recolour the rest.
  - **Where a fixed reference list exists**, the key keeps one colour for good. A choice or boolean value takes the colour of its position in the field's published choice order (wrapping after 8).
  - **Where none exists** (a reference or a date bucket), colours follow the key's position among the keys the producer gives, in the producer's order. They stay the same as long as that set of keys stays the same; filtering can recolour, and the legend says which is which. A hash of the key was rejected: with 8 colours, two keys in one chart would collide.
- **Drawing order** stays the producer's order in every case. Colour and order are separate properties.

#### 13.4a.4 Direct labels everywhere (extends 13.3)

- Data points carry direct labels wherever they fit: a value or share on or beside the mark, and series names at line ends.
- This is what makes a chart readable without colour, so it is the strongest help for colour-blind readers in every mode.
- It is mandatory under forced colours, where the chart's hues are replaced by system colours.
- The legend remains, and colour is never the only cue.

#### 13.4a.5 Atlas Mono

- **Decision 16** gives Mono chromatic chart series: data joins status as the second place Mono keeps colour, because a series told apart by colour carries meaning, and greys stop being distinguishable after three or four series.
- **The rule's source is amended with it.** At the A5.1b build, `atlas-mono.ts`'s comment changes from "chroma reserved for status colors" to "chroma reserved for status colours and validated chart series". The constraint and its exception then live in one file, and this document cites it.
- **The alternative, rejected but reasonable:** keep Mono absolutely greyscale by limiting its charts to one series (in ink) and pointing to the data table for more. It was rejected because it removes grouped and stacked charts from one theme only. The same link would then show a different chart, or none, depending on the viewer's theme.

#### 13.4a.6 Build record (A5.1a, 10 October 2026)

1. **Where it lives.** `packages/platform/foundation/theme/src/colour-validator.ts`, exported as `@athyper/platform-theme/colour-validator`. The theme package's first test script is `node --import tsx --test`, the temporal package's convention, which `pnpm test` (`turbo test`) runs. Test files are excluded from the package typecheck, as in temporal.
2. **What it computes.**
   - WCAG 2.x relative luminance and contrast ratio.
   - Colour-vision deficiency simulation with the Machado, Oliveira and Fernandes (2009) matrices at full severity, applied in linear RGB.
   - CIEDE2000 colour difference over CIELAB (D65), as 13.4a.1 specifies. The prototype measured OKLab distance instead; the approved metric was kept.
3. **What it checks** (`validateChartColours`, one set = one family in one mode). Each finding names the element and, for distances, the vision:
   - `CHART_FILL_CONTRAST`: each sequence, single, neutral and tone fill at least 3:1 against the plot surface.
   - `CHART_NEIGHBOUR_DISTANCE`: neighbouring sequence colours under normal vision and each deficiency.
   - `CHART_AXIS_CONTRAST`: the axis at least 3:1.
   - `CHART_GRID_DOMINATES`: the grid not lower in contrast than every fill.
   - `CHART_COLOUR_SEQUENCE_LENGTH`: exactly 8 sequence colours.

   Labels are reported, not failed: each fill names the label ink with the highest contrast and whether it reaches 4.5:1. If it does not, the label is drawn outside the mark.
4. **The distance thresholds** (`CHART_COLOUR_CRITERIA`): **15** for neighbours under normal vision and **10** under each simulated deficiency, in CIEDE2000 units. They were calibrated on reference pairs, all in the tests:

   | Palette or pair | Closest neighbours | Against 15 / 10 |
   | --- | --- | --- |
   | Okabe–Ito, the reference colour-blind-safe palette | 42.9 normal; 14.0 protanopia, 15.7 deuteranopia, 32.9 tritanopia | Passes with margin |
   | Two near-identical blues | 3.3 | Fails |
   | Red against green, under deuteranopia | 4.6 | Fails |

   The CIEDE2000 implementation matches Sharma, Wu and Dalal's (2005) published test data to four decimals.
5. **The prototype's palettes, run through it** (input to A5.1b, not a finding against A5.1a):

   | Set (prototype values) | Result, re-run with the relief rule and named elements (revision 6) |
   | --- | --- |
   | Atlas Modern light | Sequence 3 (2.8), sequence 4 (2.2) and sequence 5 (2.7) are now **relieved**. Fails on the prototype's warning tone (1.8), and on sequence 4 and 5 at 8.2 under tritanopia |
   | Atlas Modern dark | Passes; nothing relieved |
   | Atlas Mono light | Fails only on the prototype's warning tone (1.8) |
   | Atlas Mono dark | Fails on sequence 4 and 5 at 9.3 under tritanopia |

   **The tone failures are the prototype's, not the theme's.** 13.4a.2 makes chart tones the theme's existing status tokens, and those all pass in every family and mode. Warning `#b54708` measures 5.43:1 on white, and the lowest tone anywhere is 5.43:1. No tone needs re-choosing in A5.1b. A5.1b must still re-choose sequence 4 or 5 in both families, for tritanopia.

   A5.1b must therefore choose values, not copy the prototype's. The light-mode fill result is the one the prototype's review raised. Two of its proposals bear on it, and neither is built because neither is approved:
   - a relief rule (a fill under 3:1 allowed only with a direct label and the data table);
   - a tone-against-sequence distance check.

   The other prototype review items (line series, mixed units in the parser, stacked guards, category caps, zero totals, percent rounding, line gaps, key collisions, chart roles, `--a-chart-ring`) are proposals for A5.2, recorded in the prototype and awaiting the owner.
6. **Verified (first build):** 7 tests (luminance and contrast, the published CIEDE2000 data, Lab and greys under every deficiency, the calibration pairs, a passing set and a deterministic report, each finding code, label ink). Package typecheck and the design-system, UI-system, style-token and deployment-profile gates are clean.

#### 13.4a.7 The relief rule (approved, revision 6) and what it leaves open

**The rule.** A fill below 3:1 is allowed only when all three hold:
- it is a **series** fill (a sequence colour, the single-series colour or "Others");
- every mark drawn in it carries a **direct label**;
- the **data table** is available.

**Status tones** identify by meaning, and the same tone appears on badges and Board lanes, which have no labels and no data table, so tones always meet 3:1. So do the **axis** and the **grid's reference**. Relief exists so pale yellows, oranges and pinks can identify series on light surfaces, where 3:1 against white would exclude them.

**In the validator (built):**
- each fill has a `role` (`series` or `tone`);
- a series fill under 3:1 is reported in `relieved` and does not fail the set; a tone under 3:1 fails with `CHART_FILL_CONTRAST`;
- **the grid rule is corrected.** The grid is measured against the 3:1 criterion, not against the weakest actual fill. The first build used the weakest fill, so a relieved 2.2:1 fill would have forced the grid below visibility (audit round 13, finding 1).
- One new test covers relief for a series fill, refusal for the same colour as a tone, and the grid keeping its reference. 8 tests pass.

**The component's side (A5.2).** Marks drawn in a relieved colour must carry direct labels: the component reads `relieved` from the set it draws with and must not hide those labels to save space. The data table is always available already (13.3).

**Approved on 10 October 2026 (status block):**

20. **Keyed colours keep their guarantee at runtime** (audit round 13, finding 4). The neighbour check covers adjacent palette positions. With colours assigned by key (decision 19), two series far apart in the palette can be drawn side by side. The component therefore checks the adjacent pairs it is actually drawing, with the same `colourDistance` and thresholds: an assertion in development builds and a test case for each adapter.
21. **Status tones against the series colours.** Any tone must stand apart from every sequence colour, under every simulated vision, at the neighbour thresholds. Otherwise "Approved" and an arbitrary category could look alike in one chart. All the primitives exist; the check is not built.
22. **A floor under relief.** As approved, relief has no lower bound: a near-invisible series fill would pass as relieved if its marks are labelled. Recommended: a relieved fill must still reach **2:1**, so a mark is visible at all. The prototype's relieved colours (2.2 to 2.8) pass it; Okabe-Ito's yellow (1.32 on white) would not.

#### 13.4a.8 Build record (decisions 21 and 22) and the all-pairs gap

**Built:**
- `CHART_TONE_DISTANCE`: every status tone against every sequence colour, under normal vision and each deficiency, at the neighbour thresholds (15 and 10).
- `CHART_RELIEF_FLOOR`: a relieved series fill under 2:1 fails (`CHART_COLOUR_CRITERIA.reliefFloor`).
- The test fixture now uses the theme's own light status tones. 10 tests pass.

**Decision 21 is satisfiable.** Measured against the theme's light tones, the reference palettes miss only a few tone-to-series pairs: Okabe-Ito 6 of 128, Tableau 10 3 of 128, the prototype 7 of 128. A search found 8-colour sets at 3:1 that clear every tone under every vision. It constrains A5.1b; it does not block it.

**The gap: neighbours are checked by position, but colours are assigned by key.** The approved rule compares only neighbouring sequence positions (1–2, 2–3, …). Building decision 21 surfaced it:
- a search for a passing set returned eight alternating dark and light reds;
- its positions 1 and 3 (`#5c2323`, `#691616`) measure 2.6 apart for normal vision, yet the set passed because they are not neighbours.

With colours keyed (decision 19), any two palette colours can be drawn side by side. Decision 20's runtime check would then catch the clash only on a user's screen, not when the palette is chosen.

All pairs, at the same thresholds:

| Palette | Closest pair (normal / protanopia / deuteranopia / tritanopia) |
| --- | --- |
| Okabe-Ito | 21.7 / 12.2 / 11.6 / 10.9: passes all pairs at 15 and 10 |
| Tableau 10 (first 8) | 18.1 / 4.1 / 0.7 / 8.0 |
| The prototype | 13.3 / 4.7 / 5.5 / 5.5 |

A search also found 8-colour sets at 3:1 on white that pass all pairs and clear every light tone. The test fixture is one.

**Proposed, not approved:**

23. **Every pair of sequence colours is distinct, not only neighbours,** at the same thresholds (15 normal, 10 under each deficiency). It is the palette-time form of decision 20's guarantee, and Okabe-Ito shows it is attainable. Decision 20's runtime check stays as the guard for the pairs a particular chart draws. **Approved and built** (13.4a.9).

#### 13.4a.9 Decision 23 built, a worked example, and what A5.1b inherits

**Built:**
- `CHART_NEIGHBOUR_DISTANCE` now covers all 28 pairs. A finding names both positions, for example "sequence 1 and 3".
- The report's `closestPairs` gives the closest pair per vision.
- A new test: eight alternating reds fail on positions 1 and 3, and Okabe-Ito's colours pass every pair (closest 21.7 normal; tritanopia's closest pair is 2 and 4). 11 tests pass.
- The relief test now relieves position 2. A pale amber at position 4 sat too close to the fixture's coral once every pair counted, which is the rule working.

**The deficiency bounds now bind.** The rule does not tighten normal vision; it extends the colour-blind bounds to every pair, where hue-only differences collapse. Okabe-Ito's closest pairs show the margins: 6.7 to spare for normal vision, 0.9 under tritanopia. A5.1b is choosing against the colour-blind floors.

**A worked example that passes everything** (the test fixture; light surface `#ffffff`; the theme's own light tones; found by search). It is evidence that the criteria can be met together, not the proposed palette:

| | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Colour | `#4d1a1a` | `#cc8066` | `#a18a17` | `#1a4d3b` | `#008f83` | `#0070e0` | `#002a66` | `#0038e0` |
| Contrast on white | 14.21 | 3.07 | 3.41 | 9.68 | 3.99 | 4.78 | 13.79 | 7.95 |

Its closest pairs:
- normal vision: 17.1 (7 and 8);
- protanopia: 11.5 (1 and 4);
- deuteranopia: 10.0 (2 and 3);
- tritanopia: 10.3 (5 and 6).

No colour is relieved, and every colour clears every tone. Two blues at 6 and 8, and a narrow 10.0 under deuteranopia, show how tight the search is. A5.1b should look for something wider and more even.

**A correction to audit round 14:** Okabe-Ito has **three** colours below 3:1 on white (orange 2.25, sky 2.31, yellow 1.32), not five. Its point stands: part of Okabe-Ito's separation comes from colours a light chart cannot use at 3:1.

**Proposed for A5.1b; approved 10 October 2026 ("Approved"):**

24. **The neutral tone does two jobs; separate them.** Audit round 14 proposed excluding the neutral tone from decision 21, since it is deliberately unobtrusive. Measured, the collision it predicted is real: the theme's neutral tone (`#5b6578`) and a typical "Others" grey (`#6b6b75`) are only **6.0** apart for normal vision. A pie of statuses with a neutral status and an "Others" slice would show two indistinguishable greys. Recommended:
    - exclude the neutral tone from decision 21, as the audit proposes;
    - add a check that the neutral tone and `--a-chart-neutral` ("Others") are distinct at 15/10, so "Others" takes a clearly lighter grey. As a series colour, relief applies to it.
25. **Status against status.** Measured on the theme's real tokens, the three meaningful tones are not all distinct:
    - in light mode (both families), warning and danger are 10.8 apart for normal vision and **4.7 under deuteranopia**;
    - in dark mode, success and danger are 8.2 under deuteranopia;
    - high contrast passes.

    The tones are the design system's, used across the product, where badges also carry text. Recommended: the validator reports tone pairs below 15/10 (`CHART_TONE_PAIR_DISTANCE`, informational). A chart showing two such tones together direct-labels those marks, as relief does, so meaning never rests on hue alone. Re-choosing the status tokens themselves is a design-system decision for the owner, outside A5.
26. **Accepted sets are locked in the theme's tests.** Once a set passes, its values are asserted in a test as the accepted set for that family and mode, so a later edit cannot quietly break it. This is the ratchet discipline of the design-system gate.
27. **Default palettes do not use relief, and high contrast is its own set:**
    - The six default sets aim for eight colours at 3:1. Relief stays a safety valve for later custom sets or consumers that need a specific pale fill, not a budget for the defaults.
    - High-contrast sets are recorded separately rather than derived. They may hold fewer colours (recommended 5), so they clear the all-pairs bounds with room to spare.
    - Under high contrast the chart then caps its series at that count, and `CHART_SERIES_COUNT` gives the reason. That cap is the honest price, and it affects A5.2.

#### 13.4a.10 Decisions 24 and 25 built; what A5.1b must do

**Built:**
- **Decision 24.** The neutral tone is no longer checked against the sequence (decision 21 covers success, warning and danger). A new failing check, `CHART_NEUTRAL_DISTANCE`, requires the neutral tone and `--a-chart-neutral` ("Others") to be distinct at 15/10 under every vision.
- **Decision 25.** The report's `tonePairs` lists pairs of meaningful tones below 15/10 as `CHART_TONE_PAIR_DISTANCE`. They do not fail the set. The theme's light warning and danger appear there at 4.7 under deuteranopia. A5.2's renderer reads `tonePairs` to direct-label marks when both tones of a listed pair are drawn.
- The test fixture's "Others" grey is now `#94949c`: 3.01:1 on white, so not relieved, and 18.9 or more from the neutral tone under every vision. The old `#6b6b75` is kept in a test as the failing case (6.0).
- 13 tests pass; the theme package typechecks.

**A5.1b, under decisions 26 and 27:**
- six sets, one per family and mode; the four default sets reach eight colours at 3:1 with nothing relieved;
- the two high-contrast sets are recorded on their own, with five colours;
- each accepted set's exact values are asserted in the theme's tests, with its report (no findings; the expected `tonePairs`);
- the tokens are added to the theme with the values the tests assert.

The high-contrast cap of five (`CHART_SERIES_COUNT`) is A5.2's; the validator's eight-colour length check gains a high-contrast length of five in A5.1b.

#### 13.4a.11 A5.1b: candidate sets (proposed, not yet tokens)

**Built:** `CHART_COLOUR_CRITERIA.sequenceLength` (8) and `HIGH_CONTRAST_CHART_COLOUR_CRITERIA` (5), so a high-contrast set is checked at its own length (decision 27). 14 tests pass.

**How each set's fixed inputs come from the theme** (not chosen for the chart):

| Input | Source |
| --- | --- |
| Plot surface | `--a-surface` of the family and mode |
| Success, warning, danger tones | `--a-success`, `--a-warning`, `--a-danger` |
| Neutral tone | `--a-muted-foreground`. The neutral badge's fill is `--a-muted`, too pale for a mark, so the chart uses the family's muted ink |
| Label inks | `--a-surface` and `--a-foreground` |
| Single series | Modern: the brand in light (`#234b84`), and the dark-mode primary mix in dark (`#b9c5d8`). Mono: the family's ink. High contrast: the brand (`#ffff00`) |

**High contrast is one set for both families,** because the theme's high-contrast tokens are already identical across families ("an accessibility mode, not a brand"). That makes five distinct sets for the six family-and-mode combinations.

**How the sets were found.** A search started from the prototype's palettes and moved each colour as little as possible. It aimed at least 10% above every floor, with each colour at 3:1 or more. Two further limits kept the results usable:
- a ceiling on contrast, so light sets hold no near-black colours and dark sets no near-white ones;
- a floor on chroma, so no colour reads as grey. Mono is also capped at chroma 55, so it stays quieter than Modern.

The search also kept every colour apart from the set's "Others" grey. The validator does not check that yet (decision 28).

| Set | Sequence | Others | Grid | Axis | Closest pair: normal / prot. / deut. / trit. |
| --- | --- | --- | --- | --- | --- |
| Modern light | `#054e8d` `#c18304` `#2098f6` `#89385a` `#af71b6` `#6250d6` `#e93288` `#51a062` | `#8e94a0` | `#e3e8ef` | `#8a94a6` | 16.8 / 11.0 / 11.1 / 11.1 |
| Modern dark | `#527ffa` `#b27d06` `#eb92af` `#1f7746` `#2ca08e` `#ac9fea` `#ce0c38` `#b825ae` | `#6b7486` | `#2a3850` | `#6b7a93` | 17.4 / 11.2 / 11.0 / 11.3 |
| Mono light | `#4365bd` `#969231` `#86214e` `#0899f4` `#b1806c` `#534280` `#906175` `#0c8a99` | `#949494` | `#e6e6e6` | `#8c8c8c` | 16.5 / 11.2 / 11.0 / 11.0 |
| Mono dark | `#82a6f3` `#97851e` `#7c6387` `#dec5eb` `#9f664e` `#8775d4` `#159f92` `#eb8fb7` | `#707070` | `#333333` | `#7a7a7a` | 16.6 / 11.9 / 11.1 / 11.1 |
| High contrast (both) | `#4a78d0` `#faa825` `#f8c3ff` `#b1578d` `#05a7c2` | `#9a9a9a` | `#3a3a3a` | `#ffffff` | 24.4 / 13.0 / 13.1 / 13.0 |

Every set:
- passes with no findings, and no colour is relieved;
- has its "Others" grey at 3:1 or more, and at least 15/10 from the neutral tone (decision 24);
- has the axis at 3:1 or more and the grid below 3:1.

Sequence order is greedy: each next colour is the one farthest from those already placed, so a chart with few series gets the most separated colours. `tonePairs` holds what decision 25 measured: light warning and danger (4.7 under deuteranopia), and dark success and danger (8.2). High contrast reports none.

**On approval,** the sets become tokens:
- `--a-chart-1` … `--a-chart-8`, `--a-chart-single`, `--a-chart-neutral`, `--a-chart-grid` and `--a-chart-axis`, in `tokens.ts` and `styles.css`;
- under high contrast, `--a-chart-6` … `--a-chart-8` are set to `initial`, so nothing inherits a light value;
- a theme test locks each set's values and its validator report (decision 26), and checks that `styles.css` declares the same values;
- `atlas-mono.ts`'s comment is amended (13.4a.5).

**Quieter Mono (owner request, 10 October 2026).** Asked whether Mono should be colour or black and white, the author recommended keeping decision 16, with evidence:
- Light Mono fits at most four greys that reach 3:1 and are 15 apart; dark fits three.
- Keeping them apart from the neutral tone and "Others" leaves one.

Single-series Mono charts are already drawn in ink. The owner asked for quieter colours instead. Two further levels were searched, and every level passes with no findings and nothing relieved:

| Mono level | Light sequence | Dark sequence | Highest / average chroma (light; dark) | Above the floors (light / dark) |
| --- | --- | --- | --- | --- |
| First candidates | as in the table above | as in the table above | 55 / 40; 55 / 38 | 10% / 10% |
| **Quieter (recommended)** | `#4d4481` `#9a934a` `#4499d8` `#13524a` `#7f728b` `#b66d6d` `#8f4b68` `#5870b3` | `#95a3eb` `#857a33` `#e6c4e5` `#5da190` `#835a84` `#5079bc` `#586f4f` `#a48bb0` | 40 / 32; 40 / 30 | 10% / 10% |
| Quietest | `#50619a` `#a58c51` `#906175` `#384f3d` `#7c90cc` `#594067` `#72886e` `#098a98` | `#7fa5e2` `#82773a` `#ab8683` `#dec5eb` `#837bb7` `#845a83` `#a3c9bd` `#586e51` | 35 / 27; 35 / 26 | 9% / 5% |

For comparison, Modern averages chroma 56. Going lower still passes, but light mode's margin shrinks: about 8% at a cap of 30, and about 3% at 25, where the colours read as tinted greys. Dark has more room because its colours can range further in lightness. The recommendation is the quieter level, the calmest that keeps the full 10% margin in both modes.

`--a-chart-neutral` is the name 13.4a.2 gives the "Others" token. 13.4 and 13.5 still say `--a-chart-rest` and are read as `--a-chart-neutral`.

**Proposed (not approved):**

28. **"Others" stands apart from every sequence colour,** at 15/10 under every vision (`CHART_OTHERS_DISTANCE`, failing). "Others" is drawn beside the series it summarises, and a series that looks like "Others" reads as part of the remainder. The candidate sets already meet it, at 4% (Modern light) to 31% (high contrast) above the floors.

### 13.5 "Others"

- `rest` is exact only for a count, or a sum of an additive field in one unit: the server's total minus the given points, by exact decimal subtraction.
- It is never given for an average, minimum, maximum, distinct count or semi-additive balance, where "total minus shown" means nothing, or when any given point is withheld.
- The adapter computes it; the chart only draws it. Its label is the consumer's "Others" text, and its colour is `--a-chart-rest`.
- Without a `rest`, a truncated pie is unavailable (`CHART_TRUNCATED`), and the column chart shows the truncation notice.

### 13.7 Other consumers (not in A5)

Folded into the Consumers table (revision 2), so there is one list. What the table does not carry: A5 adopts the chart only in Summary, and each later use needs its own adapter and tests. A record-page metric section would also need published metadata declaring it.

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

## Decisions 16–19 (13.4a; approved on 10 October 2026, status block)

16. **Atlas Mono gets validated chromatic chart series,** amending `atlas-mono.ts`'s rule at the build. The rejected alternative is greyscale with one series.
17. **Colour by meaning** comes from each field's published `statusTones`, through `resolveEntityStatusTone` plus an own-key check. It reaches the component through an optional `toneOf` prop, with no field in `ChartDataV1`. This amends 13.3's prop list.
18. **The three sources of colour:** the theme's sequence, the brand token for a single series, and metadata for meaning. No palette preference and no free colour picking, for users or tenants.
19. **The validator first,** in the theme package with a test script: A5.1a, then the token sets in A5.1b, against the per-element criteria in 13.4a.1. Colours are keyed, not positional, as 13.4a.3 states.

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
| Audit round 11 | The move is verbatim and the numbering deliberate | Confirmed; the numbering note now says where 13.6 and 13.8 live |
| Audit round 11 | "One contract" is enforceable for components but not data shapes: the dashboard's chart block names a registry data source whose `number[]` shape no contract fixes | Closed: the Consumers section states that the contract owns the data shape for any chart, and the dashboard row makes `ChartDataV1` from its data source a condition of adoption; AGENTS.md says the same |
| Audit round 11 | 13.7 duplicates the Consumers table | 13.7 folded into the table, keeping only what the table does not carry |
| Owner (10 October 2026) | "approved which covers the moved text" | Status block: the Aggregate A5 approval covers this document's moved sections |
| Audit round 11 | A dashboard block's declared visualization must be a request, not an instruction | Recorded in the dashboard row: `chartTypes(data)` decides and an unavailable type shows its reason |
| Audit round 12 | The validator named in 13.4 does not exist; the theme package has no tests | Confirmed. 13.4a.1 makes it A5.1a in the theme package, before any colour; decision 19 |
| Audit round 12 | Positional colours reshuffle when a series is filtered away | Confirmed, and refined: keying by key is stable for good only where a fixed reference list exists (published choice order). Otherwise colours follow the given keys' order, and a hash was rejected for collisions (13.4a.3) |
| Audit round 12 | Colour by meaning needs no change to the approved data format: reuse `resolveEntityStatusTone` | Adopted for the decision: the resolver decides. Corrected in two places: the resolver cannot tell "no tone" from "neutral", so an own-key check precedes it; and the tone still has to reach the component, so an optional `toneOf` prop amends 13.3 (decision 17) |
| Audit round 12 | Amend Mono's source comment, and record the greyscale alternative | 13.4a.5; decision 16 |
| Audit round 12 | Tokens, not raw hexes, in the deliverable; scope the 3:1 criterion per element; direct labels as a rule, not a fallback | 13.4a.2, 13.4a.1, 13.4a.4 |
| Owner (10 October 2026) | "16, 17, 18 and 19 approved" | Status block; 13.4a approved and governs where it differs from 13.4 |
| Owner (10 October 2026) | "go ahead and start build A5.1a" (with the Neon Chart Prototype) | Built: 13.4a.6 |
| Owner (10 October 2026) | "approved yes to the relief rule" | Built in the scope below (13.4a.7) |
| Audit round 13, finding 1 | The grid rule takes the weakest actual fill as its reference, so relief would make the grid invisible | Fixed: the reference is the 3:1 criterion (13.4a.7) |
| Audit round 13, finding 2 | Scope relief to series fills; status tones always meet 3:1; re-choose the warning tone | Scope adopted. Corrected: the theme's real warning tone passes (5.43:1); only the prototype's tone value failed, so nothing is re-chosen (13.4a.6, point 5) |
| Audit round 13, finding 3 | Name the failing elements | Re-run and named (13.4a.6, point 5). The first record had the names in the validator's output but not in the table |
| Audit round 13, finding 4 | Keyed colours can put non-adjacent palette colours side by side | Proposed as decision 20 (13.4a.7) |
| Audit round 13 | Approve the tone-against-sequence check | Proposed as decision 21; the owner approved only the relief rule this round |
| Author | Relief has no lower bound | Proposed as decision 22 (13.4a.7) |
| Owner (10 October 2026) | "Three proposals - Approved" (decisions 20–22) | 21 and 22 built; 20 is A5.2's (13.4a.8) |
| Author, building 21 | The neighbour rule checks positions while colours are keyed; a degenerate palette passes | Measured and proposed as decision 23 (13.4a.8) |
| Owner (10 October 2026) | "Decision 23: approved" | Built (13.4a.9) |
| Audit round 14 | Exclude the neutral tone from decision 21 | Measured: the neutral tone and "Others" grey are 6.0 apart. Proposed as decision 24, with a neutral-vs-Others check |
| Audit round 14 | Add a status-against-status check | Measured: the theme's warning and danger are 4.7 apart under deuteranopia (light). Proposed as decision 25 (informational, plus direct labels) |
| Audit round 14 | Lock accepted sets; no relief in the defaults; separate high-contrast sets with fewer colours | Proposed as decisions 26 and 27 |
| Audit round 14 | Record the found set | Recorded as the worked example (13.4a.9) |
| Audit round 14 | "Okabe-Ito has five colours below 3:1" | Corrected: three (13.4a.9) |
| Owner (10 October 2026) | "Approved" (decisions 24–27) | 24 and 25 built (13.4a.10); 26 and 27 govern A5.1b |
| Owner (10 October 2026) | "go ahead" (A5.1b) | High-contrast length built; five candidate sets proposed with measurements (13.4a.11); decision 28 proposed |
| Owner (10 October 2026) | Mono: colour or black and white? Then "try the quieter Mono palette" | Colour kept (decision 16), with measured grey limits; two quieter Mono levels found, the chroma-40 level recommended (13.4a.11) |
