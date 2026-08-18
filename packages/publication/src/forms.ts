/** 文学体裁的唯一展示事实源。未知体裁保留原值，避免导入时丢失信息。 */
export const literaryFormLabels: Readonly<Record<string, string>> = {
  qijue: "七绝",
  wujue: "五绝",
  qilv: "七律",
  wulv: "五律",
  ci: "词",
  dayou: "打油诗",
  zayan: "杂言",
  siyan: "四言",
  saoti: "骚体",
  xinshi: "新诗",
  sanwen: "散文",
  suibi: "随笔",
  duilian: "对联",
  teshu: "特殊体裁"
};

export const literaryFormOrder = [
  "qijue", "wujue", "qilv", "wulv", "ci", "siyan", "zayan", "saoti", "dayou", "xinshi", "sanwen", "suibi", "duilian", "teshu"
] as const;

export function literaryFormLabel(form: string): string {
  return literaryFormLabels[form] ?? form;
}

export function compareLiteraryForms(left: string, right: string): number {
  const leftIndex = literaryFormOrder.indexOf(left as (typeof literaryFormOrder)[number]);
  const rightIndex = literaryFormOrder.indexOf(right as (typeof literaryFormOrder)[number]);
  const leftRank = leftIndex < 0 ? literaryFormOrder.length : leftIndex;
  const rightRank = rightIndex < 0 ? literaryFormOrder.length : rightIndex;
  return leftRank - rightRank || literaryFormLabel(left).localeCompare(literaryFormLabel(right), "zh-CN");
}
