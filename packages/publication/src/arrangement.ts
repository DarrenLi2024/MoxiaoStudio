import type { ArrangementProposal, PublicationProject } from "./project";

export interface ArrangementSource {
  readonly recordId: string;
  readonly title: string;
  readonly form: string;
  readonly year: number | null;
  readonly text: string;
  readonly manualOrder: number;
  readonly locked: boolean;
  readonly moodTags: readonly string[];
  readonly editorialRole: "normal" | "opening" | "closing";
}

const moodLexicon = [
  ["清新", ["春", "花", "新雨", "清风", "初晴"]],
  ["温润", ["故园", "童年", "亲", "归", "灯", "书房"]],
  ["旷远", ["山", "江", "海", "云", "天", "长风"]],
  ["怀古", ["古", "帝王", "旧迹", "唐", "宋", "隋"]],
  ["沉郁", ["愁", "孤", "夜", "寒", "病", "泪"]],
  ["雄浑", ["千古", "万里", "大业", "长城", "豪", "壮"]]
] as const;

const moodOrder: ReadonlyMap<string, number> = new Map(moodLexicon.map(([tag], index) => [tag, index]));
const genreOrder = new Map(["qijue", "wujue", "qilv", "wulv", "ci", "xinshi", "sanwen", "suibi", "duilian"].map((form, index) => [form, index]));

export function inferMoodTags(text: string): string[] {
  const ranked = moodLexicon.map(([tag, words], index) => ({ tag, index, score: words.filter((word) => text.includes(word)).length }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.index - right.index);
  return ranked.slice(0, 3).map((item) => item.tag);
}

function withMood(source: ArrangementSource): ArrangementSource & { resolvedMoodTags: readonly string[] } {
  return { ...source, resolvedMoodTags: source.moodTags.length ? source.moodTags : inferMoodTags(`${source.title}\n${source.text}`) };
}

function reason(source: ReturnType<typeof withMood>, strategy: ArrangementProposal["strategy"]): string {
  const mood = source.resolvedMoodTags.join("、") || "未识别明确意境";
  if (strategy === "genre") return `按体裁归入 ${source.form}，同体裁内保持作者编定次序`;
  if (strategy.startsWith("chronology")) return source.year === null ? "尚未系年，置于已系年作品之后" : `按创作系年 ${source.year} 年编排`;
  if (strategy === "mood") return `依据正文意象归入“${mood}”的情绪序列`;
  return `综合体裁、${source.year === null ? "未系年状态" : `${source.year}年系年`}与“${mood}”意境编排`;
}

function score(source: ReturnType<typeof withMood>, strategy: ArrangementProposal["strategy"], project: PublicationProject): number {
  const genre = genreOrder.get(source.form) ?? 99;
  const year = source.year ?? 9999;
  const mood = moodOrder.get(source.resolvedMoodTags[0] ?? "") ?? 99;
  if (strategy === "genre") return genre * 100_000 + source.manualOrder;
  if (strategy === "chronology-asc") return year * 100_000 + source.manualOrder;
  if (strategy === "chronology-desc") return (source.year === null ? Number.MAX_SAFE_INTEGER : -year * 100_000) + source.manualOrder;
  if (strategy === "mood") return mood * 100_000 + source.manualOrder;
  return genre * 10_000 * project.arrangement.genreWeight + year * 10 * project.arrangement.chronologyWeight + mood * 1_000 * project.arrangement.moodWeight + source.manualOrder / 10_000;
}

export function createArrangementProposal(
  project: PublicationProject,
  sources: readonly ArrangementSource[],
  strategy: ArrangementProposal["strategy"],
  now = new Date().toISOString()
): ArrangementProposal {
  const active = sources.filter((source) => project.entries.some((entry) => entry.recordId === source.recordId && entry.included)).map(withMood);
  const original = [...active].sort((left, right) => left.manualOrder - right.manualOrder);
  const candidates = original.filter((source) => !source.locked).sort((left, right) => {
    const roleDelta = (left.editorialRole === "opening" ? -1 : left.editorialRole === "closing" ? 1 : 0) - (right.editorialRole === "opening" ? -1 : right.editorialRole === "closing" ? 1 : 0);
    return roleDelta || score(left, strategy, project) - score(right, strategy, project) || left.manualOrder - right.manualOrder;
  });
  let cursor = 0;
  const arranged = original.map((source) => source.locked ? source : candidates[cursor++]!);
  return {
    strategy,
    createdAt: now,
    items: arranged.map((source, order) => ({ recordId: source.recordId, order, reason: source.locked ? "已人工锁定，保持原位置" : reason(source, strategy), moodTags: source.resolvedMoodTags }))
  };
}

export function applyArrangementProposal(project: PublicationProject, proposal: ArrangementProposal): PublicationProject {
  const orders = new Map(proposal.items.map((item) => [item.recordId, item.order]));
  const previousManualOrder = Object.fromEntries(project.entries.map((entry) => [entry.recordId, entry.manualOrder]));
  return {
    ...project,
    sortMode: "author-intent",
    entries: project.entries.map((entry) => ({ ...entry, manualOrder: orders.get(entry.recordId) ?? entry.manualOrder, moodTags: proposal.items.find((item) => item.recordId === entry.recordId)?.moodTags ?? entry.moodTags })),
    arrangement: { ...project.arrangement, proposal, previousManualOrder }
  };
}

export function restoreArrangement(project: PublicationProject): PublicationProject {
  const previous = project.arrangement.previousManualOrder;
  if (!previous) return project;
  const { proposal: _proposal, previousManualOrder: _previous, ...arrangement } = project.arrangement;
  return { ...project, sortMode: "author-intent", entries: project.entries.map((entry) => ({ ...entry, manualOrder: previous[entry.recordId] ?? entry.manualOrder })), arrangement };
}
