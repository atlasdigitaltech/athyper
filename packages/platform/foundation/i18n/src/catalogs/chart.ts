/** The shared chart's own copy (Shared chart blueprint 13.3): why a chart type
 * is unavailable, and the chart's accessible names, notices and data table.
 * Values, labels and withheld-value wording come from the consumer. */
export const chartMessages = {
  "chart.unavailable.CHART_NO_VALUES": ["There are no values to chart.", "Tiada nilai untuk dicartakan.", "لا توجد قيم لعرضها في المخطط."],
  "chart.unavailable.CHART_UNORDERED": [
    "A line needs a sequence, such as dates or periods.",
    "Garis memerlukan urutan, seperti tarikh atau tempoh.",
    "يحتاج الخط إلى تسلسل، مثل التواريخ أو الفترات.",
  ],
  "chart.unavailable.CHART_SERIES_COUNT": [
    "{max, plural, one {Choose one column to chart.} other {Choose between 2 and # columns to compare.}}",
    "{max, plural, one {Pilih satu lajur untuk dicartakan.} other {Pilih antara 2 hingga # lajur untuk dibandingkan.}}",
    "{max, plural, one {اختر عمودًا واحدًا لعرضه في المخطط.} other {اختر بين 2 و# أعمدة للمقارنة.}}",
  ],
  "chart.unavailable.CHART_NOT_PART_OF_WHOLE": [
    "These values aren't parts of one total.",
    "Nilai ini bukan bahagian daripada satu jumlah.",
    "هذه القيم ليست أجزاءً من إجمالي واحد.",
  ],
  "chart.unavailable.CHART_NEGATIVE": ["A pie can't show negative values.", "Carta pai tidak boleh menunjukkan nilai negatif.", "لا يمكن للمخطط الدائري عرض قيم سالبة."],
  "chart.unavailable.CHART_WITHHELD": [
    "Some values are withheld, so shares can't be shown.",
    "Sesetengah nilai ditahan, jadi bahagian tidak dapat ditunjukkan.",
    "بعض القيم محجوبة، لذا لا يمكن عرض الحصص.",
  ],
  "chart.unavailable.CHART_TOO_MANY_SLICES": [
    "Too many values for a pie; choose a column chart.",
    "Terlalu banyak nilai untuk carta pai; pilih carta lajur.",
    "القيم كثيرة جدًا لمخطط دائري؛ اختر مخططًا عموديًا.",
  ],
  "chart.unavailable.CHART_TRUNCATED": [
    "Only the first values are shown, so shares can't be shown.",
    "Hanya nilai pertama ditunjukkan, jadi bahagian tidak dapat ditunjukkan.",
    "تُعرض القيم الأولى فقط، لذا لا يمكن عرض الحصص.",
  ],
  "chart.type.column": ["Column chart", "Carta lajur", "مخطط عمودي"],
  "chart.type.bar": ["Bar chart", "Carta bar", "مخطط شريطي"],
  "chart.type.line": ["Line chart", "Carta garis", "مخطط خطي"],
  "chart.type.groupedColumn": ["Grouped column chart", "Carta lajur berkumpulan", "مخطط أعمدة مجمّعة"],
  "chart.type.stackedColumn": ["Stacked column chart", "Carta lajur bertindan", "مخطط أعمدة مكدّسة"],
  "chart.type.pie": ["Pie chart", "Carta pai", "مخطط دائري"],
  "chart.type.donut": ["Donut chart", "Carta donut", "مخطط حلقي"],
  "chart.summary": [
    "{type}: {categories, plural, one {# category} other {# categories}}, {series, plural, one {# series} other {# series}}.",
    "{type}: {categories} kategori, {series} siri.",
    "{type}: {categories} من الفئات، {series} من السلاسل.",
  ],
  "chart.point": ["{category}, {series}: {value}", "{category}, {series}: {value}", "{category}، {series}: {value}"],
  "chart.pointShare": ["{category}, {series}: {value}, {share}", "{category}, {series}: {value}, {share}", "{category}، {series}: {value}، {share}"],
  "chart.share": ["{share, number, percent}", "{share, number, percent}", "{share, number, percent}"],
  "chart.withheldHeading": ["Not charted", "Tidak dicartakan", "غير معروض في المخطط"],
  "chart.withheld": ["{category}: {state}", "{category}: {state}", "{category}: {state}"],
  "chart.withheldSeries": ["{category}, {series}: {state}", "{category}, {series}: {state}", "{category}، {series}: {state}"],
  "chart.truncatedCategories": [
    "Only the first categories are shown.",
    "Hanya kategori pertama ditunjukkan.",
    "تُعرض الفئات الأولى فقط.",
  ],
  "chart.truncatedSeries": ["Only the first columns are shown.", "Hanya lajur pertama ditunjukkan.", "تُعرض الأعمدة الأولى فقط."],
  "chart.showDataTable": ["Show data table", "Tunjukkan jadual data", "إظهار جدول البيانات"],
  "chart.hideDataTable": ["Hide data table", "Sembunyikan jadual data", "إخفاء جدول البيانات"],
  "chart.total": ["Total", "Jumlah", "الإجمالي"],
} as const;
