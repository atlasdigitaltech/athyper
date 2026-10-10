# Shared chart — blueprint

**Status:** approved; A5.1a built, with decisions 21 and 22; revision 7 (10 October 2026).
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

23. **Every pair of sequence colours is distinct, not only neighbours,** at the same thresholds (15 normal, 10 under each deficiency). It is the palette-time form of decision 20's guarantee, and Okabe-Ito shows it is attainable. Decision 20's runtime check stays as the guard for adapters. Until 23 is approved, the validator keeps the approved neighbour rule.

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
