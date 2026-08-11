import { useEffect, useMemo, useState } from "react";
import {
  Archive,
  BookOpenText,
  Check,
  ChevronDown,
  CircleHelp,
  Command,
  FileOutput,
  Filter,
  GalleryVerticalEnd,
  History,
  LibraryBig,
  ListFilter,
  PanelRightClose,
  Search,
  Settings,
  Sparkles,
  Upload,
  UsersRound
} from "lucide-react";
import { createEntityId, type EntityId } from "@moxiao/domain";
import { ontologyVersion } from "@moxiao/ontology";

interface WorkListItem {
  readonly id: EntityId;
  readonly title: string;
  readonly genre: string;
  readonly chronology: string;
  readonly status: "已复校" | "待复核" | "编校中";
  readonly lines: readonly string[];
  readonly note: string;
  readonly readingState: string;
}

// 首版只使用明确标记的演示数据；真实私人作品将在受控迁移批次接入本地数据库。
const works: readonly WorkListItem[] = [
  {
    id: createEntityId(), title: "春山小记", genre: "散文", chronology: "2024年3月", status: "编校中",
    lines: ["雨后入山，石径新润。", "松风过处，远峰如在淡墨之间。", "行至溪桥，忽闻一声鸟鸣，才知春意已深。"],
    note: "本篇为界面演示文本，用于验证段落、系年和笺读之间的结构关系。",
    readingState: "正文结构发生变化，相关赏析等待重新确认。"
  },
  {
    id: createEntityId(), title: "江城夜雨", genre: "七绝", chronology: "2022年6月", status: "已复校",
    lines: ["灯影沿江细作鳞，", "雨声催客夜将深。", "隔窗未见归舟动，", "一片潮音到枕心。"],
    note: "演示用诗稿，标点、分行与题注分别存储。",
    readingState: "笺注与赏析已完成文学复校。"
  },
  {
    id: createEntityId(), title: "归途", genre: "新诗", chronology: "2023年12月", status: "已复校",
    lines: ["暮色把站台放远", "一盏灯替我记得", "那些尚未说完的话", "仍在风里缓慢返乡"],
    note: "演示新诗的自由分行和朗读锚点。",
    readingState: "当前表达版本与朗读文本一致。"
  },
  {
    id: createEntityId(), title: "书房札记", genre: "随笔", chronology: "未系年", status: "待复核",
    lines: ["旧书最可亲处，不只在字句，也在翻阅者留下的时间。", "一处折角，一点淡墨，往往比题记更早说出它的来历。"],
    note: "系年缺少证据，因此保留为未系年。",
    readingState: "等待补充来源证据后继续复核。"
  },
  {
    id: createEntityId(), title: "临江仙·秋思", genre: "词", chronology: "2021年9月", status: "已复校",
    lines: ["雁影低回云外，", "晚风轻过汀洲。", "一江秋色入归舟。", "灯前人未语，月下水长流。"],
    note: "演示词体换片、句读与格律检查接口。",
    readingState: "笺读已完成，典源仍待终核。"
  }
];

const railItems: ReadonlyArray<{
  readonly label: string;
  readonly icon: typeof LibraryBig;
  readonly active?: boolean;
}> = [
  { label: "文库", icon: LibraryBig, active: true },
  { label: "版本", icon: History },
  { label: "出版", icon: FileOutput },
  { label: "资源", icon: GalleryVerticalEnd },
  { label: "协作", icon: UsersRound }
];

export function App() {
  const [selectedId, setSelectedId] = useState(works[0]?.id);
  const [query, setQuery] = useState("");
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [runtimeLabel, setRuntimeLabel] = useState("本地模式");
  const selected = works.find((work) => work.id === selectedId) ?? works[0];
  const filteredWorks = useMemo(
    () => works.filter((work) => `${work.title}${work.genre}${work.chronology}`.includes(query.trim())),
    [query]
  );

  useEffect(() => {
    void window.moxiao?.runtime().then((runtime) => {
      setRuntimeLabel(`${runtime.platform} · 本地优先`);
    });
  }, []);

  return (
    <main className={`app-shell ${inspectorOpen ? "" : "inspector-collapsed"}`}>
      <aside className="rail" aria-label="工作区导航">
        <div className="brand-mark" aria-label="墨校台">墨</div>
        <nav className="rail-nav">
          {railItems.map(({ label, icon: Icon, active }) => (
            <button className={`rail-button ${active ? "is-active" : ""}`} aria-label={label} key={label}>
              <Icon size={20} strokeWidth={1.7} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="rail-footer">
          <button className="icon-button" aria-label="帮助"><CircleHelp size={19} /></button>
          <button className="icon-button" aria-label="设置"><Settings size={19} /></button>
        </div>
      </aside>

      <section className="library-panel" aria-label="作品目录">
        <header className="project-header">
          <div>
            <span className="context-label">当前项目</span>
            <button className="project-switcher">
              示例文学项目 <ChevronDown size={14} />
            </button>
          </div>
          <button className="icon-button bordered" aria-label="导入作品"><Upload size={17} /></button>
        </header>

        <div className="library-heading">
          <div>
            <h1>一卷通校</h1>
            <p>12 篇演示作品 · 8 篇已复校</p>
          </div>
          <button className="icon-button" aria-label="目录筛选"><ListFilter size={18} /></button>
        </div>

        <label className="search-field">
          <Search size={16} aria-hidden="true" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索题名、正文或系年" />
          <kbd>⌘K</kbd>
        </label>

        <div className="filter-row">
          <button className="filter-button is-selected">全部体裁 <span>12</span></button>
          <button className="filter-button"><Filter size={14} /> 待处理</button>
        </div>

        <div className="work-list" role="listbox" aria-label="作品列表">
          {filteredWorks.map((work) => (
            <button
              key={work.id}
              className={`work-row ${work.id === selectedId ? "is-selected" : ""}`}
              onClick={() => setSelectedId(work.id)}
              role="option"
              aria-selected={work.id === selectedId}
            >
              <span className="work-row-main">
                <strong>{work.title}</strong>
                <span>{work.genre} · {work.chronology}</span>
              </span>
              <span className={`status-dot status-${work.status}`} aria-label={work.status} />
            </button>
          ))}
        </div>

        <button className="new-work-button"><span>＋</span> 新增作品</button>
      </section>

      <section className="workspace">
        <header className="topbar">
          <div className="breadcrumb">
            <span>示例文学项目</span><span>/</span><strong>{selected?.title}</strong>
          </div>
          <div className="topbar-actions">
            <span className="save-state"><Check size={14} /> 所有更改已保存</span>
            <button className="quiet-button"><Archive size={16} /> 生成版本</button>
            <button className="primary-button"><FileOutput size={16} /> 出版</button>
            <button className="icon-button bordered inspector-toggle" onClick={() => setInspectorOpen((value) => !value)} aria-label="切换语义检查器">
              <PanelRightClose size={17} />
            </button>
          </div>
        </header>

        <div className="editor-scroll">
          <article className="manuscript-page">
            <div className="document-kicker">{selected?.genre} · 演示文稿</div>
            <h2>{selected?.title}</h2>
            <p className="document-meta">示例作者 · {selected?.chronology}</p>
            <div className="section-rule"><span>正文</span></div>
            <div className="verse-editor" contentEditable suppressContentEditableWarning aria-label="作品正文">
              {selected?.lines.map((line) => <p key={line}>{line}</p>)}
            </div>
            <aside className="composition-note">
              <span>创作题注</span>
              <p>{selected?.note}</p>
            </aside>
            <div className="section-rule"><span>笺读</span></div>
            <div className="reading-placeholder">
              <BookOpenText size={20} />
              <div>
                <strong>{selected?.status === "已复校" ? "笺读已经完成复校" : "笺读正在等待确认"}</strong>
                <p>{selected?.readingState}</p>
              </div>
              <button>进入笺读</button>
            </div>
          </article>
        </div>
      </section>

      <aside className={`inspector ${inspectorOpen ? "is-open" : ""}`} aria-label="语义检查器">
        <header className="inspector-header">
          <div>
            <span className="context-label">语义检查器</span>
            <h2>作品属性</h2>
          </div>
          <Sparkles size={18} />
        </header>

        <section className="inspector-section">
          <h3>基础信息</h3>
          <label>体裁<button>{selected?.genre} <ChevronDown size={14} /></button></label>
          <label>创作时间<button>{selected?.chronology} <ChevronDown size={14} /></button></label>
          <label>审校状态<button>{selected?.status} <ChevronDown size={14} /></button></label>
        </section>

        <section className="inspector-section">
          <div className="section-title-row"><h3>证据与置信度</h3><button>添加</button></div>
          <div className="evidence-card">
            <span className="evidence-mark">据</span>
            <div><strong>正文内部线索</strong><p>尚不足以确定创作年份</p></div>
            <span className="confidence">42%</span>
          </div>
        </section>

        <section className="inspector-section">
          <h3>关系</h3>
          <div className="relation-row"><span>文本版本</span><strong>v12 · 当前</strong></div>
          <div className="relation-row"><span>出版影响</span><strong className="warning-text">2 个目标</strong></div>
          <div className="relation-row"><span>媒体资源</span><strong>1 项</strong></div>
        </section>

        <footer className="ontology-footnote">
          <Command size={15} /> {ontologyVersion}
        </footer>
      </aside>

      <footer className="statusbar">
        <span><span className="online-dot" /> {runtimeLabel}</span>
        <span>UTF-8</span>
        <span>简体中文</span>
        <span>节点 48 · 批注 7</span>
        <button><Command size={13} /> 命令</button>
      </footer>
    </main>
  );
}
