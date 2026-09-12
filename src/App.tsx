import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import "./styles.css";

const project = {
  "id": "hxwl-04",
  "port": 5104,
  "title": "牙科根管治疗",
  "subtitle": "按牙位组织根管步骤、工作长度与复诊计划",
  "stack": "React + Vite + TypeScript + CSS",
  "theme": [
    "#0369a1",
    "#7c3aed",
    "#ea580c"
  ],
  "domain": "牙体牙髓",
  "users": [
    "牙科医生",
    "助理",
    "前台复诊协调员"
  ],
  "metrics": [
    "待复诊",
    "已充填",
    "平均工作长度",
    "封药病例"
  ],
  "filters": [
    "开髓",
    "测长",
    "封药",
    "充填"
  ],
  "fields": [
    "牙位",
    "开髓",
    "测长",
    "根管预备",
    "冲洗",
    "封药",
    "主尖锉号"
  ],
  "records": [
    [
      "#36",
      "慢性根尖周炎",
      "封药",
      "MB 19.5mm，主尖锉#30"
    ],
    [
      "#11",
      "外伤后变色",
      "充填",
      "单根管，冷侧压完成"
    ],
    [
      "#46",
      "急性牙髓炎",
      "测长",
      "近中双根管需复诊"
    ]
  ]
};

const STORAGE_KEY = "hxwl-04-records-v1";
const ALL_FILTER = "全部";
const STAGES = project.filters as string[];

type Stage = (typeof STAGES)[number];

interface RCRecord {
  id: string;
  tooth: string;
  diagnosis: string;
  stage: Stage;
  workingLength: string;
  note: string;
  createdAt: string;
  source: "seed" | "user";
}

interface Toast {
  id: number;
  type: "success" | "error" | "info";
  text: string;
}

/** 从示例备注里提取工作长度（如 "MB 19.5mm，主尖锉#30" -> "19.5"） */
function extractWorkingLength(detail: string): string {
  const match = detail.match(/(\d+(?:\.\d+)?)\s*mm/);
  return match ? match[1] : "";
}

function buildSeedRecords(): RCRecord[] {
  const now = new Date();
  return project.records.map((record, index) => ({
    id: `seed-${index}`,
    tooth: record[0],
    diagnosis: record[1],
    stage: record[2] as Stage,
    workingLength: extractWorkingLength(record[3]),
    note: record[3],
    createdAt: new Date(now.getTime() - (index + 1) * 86400000).toISOString(),
    source: "seed"
  }));
}

function loadRecords(): RCRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return buildSeedRecords();
    const parsed = JSON.parse(raw) as RCRecord[];
    if (!Array.isArray(parsed)) return buildSeedRecords();
    const valid = parsed.filter(
      (item) =>
        item &&
        typeof item.id === "string" &&
        typeof item.tooth === "string" &&
        typeof item.diagnosis === "string" &&
        STAGES.includes(item.stage)
    );
    return valid.length ? valid : buildSeedRecords();
  } catch {
    return buildSeedRecords();
  }
}

/** 牙位归一化：去空格、转大写、补 # 前缀，如 " 36" / "36" -> "#36" */
function normalizeTooth(value: string): string {
  const compact = value.replace(/\s+/g, "").toUpperCase();
  if (!compact) return "";
  return compact.startsWith("#") ? compact : `#${compact}`;
}

const TOOTH_PATTERN = /^#?(1[1-8]|2[1-8]|3[1-8]|4[1-8])$/;
const WL_PATTERN = /^\d{1,2}(\.\d)?$/;

interface FormState {
  tooth: string;
  diagnosis: string;
  stage: Stage;
  workingLength: string;
  note: string;
}

const EMPTY_FORM: FormState = {
  tooth: "",
  diagnosis: "",
  stage: STAGES[0],
  workingLength: "",
  note: ""
};

const statusColors = ["status-ok", "status-watch", "status-danger"];

function MetricCard({ label, value, index }: { label: string; value: string; index: number }) {
  return (
    <article className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <i className={statusColors[index % statusColors.length]} />
    </article>
  );
}

function App() {
  const [records, setRecords] = useState<RCRecord[]>(loadRecords);
  const [activeFilter, setActiveFilter] = useState<string>(ALL_FILTER);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastSeq = useRef(0);
  const toothInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    } catch {
      // 存储不可用时仅在本次会话内保留，不阻断操作
    }
  }, [records]);

  const pushToast = (type: Toast["type"], text: string) => {
    const id = ++toastSeq.current;
    setToasts((prev) => [...prev, { id, type, text }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, 2800);
  };

  const filteredRecords = useMemo(
    () =>
      activeFilter === ALL_FILTER
        ? records
        : records.filter((record) => record.stage === activeFilter),
    [records, activeFilter]
  );

  const metricValues = useMemo(() => {
    const waiting = records.filter((record) => record.stage !== "充填").length;
    const filled = records.filter((record) => record.stage === "充填").length;
    const lengths = records
      .map((record) => parseFloat(record.workingLength))
      .filter((value) => Number.isFinite(value) && value > 0);
    const average = lengths.length
      ? `${(lengths.reduce((sum, value) => sum + value, 0) / lengths.length).toFixed(1)}mm`
      : "—";
    const medicated = records.filter((record) => record.stage === "封药").length;
    return [String(waiting), String(filled), average, String(medicated)];
  }, [records]);

  const validate = (state: FormState): Partial<Record<keyof FormState, string>> => {
    const next: Partial<Record<keyof FormState, string>> = {};
    const tooth = normalizeTooth(state.tooth);
    if (!state.tooth.trim()) {
      next.tooth = "请填写牙位";
    } else if (!TOOTH_PATTERN.test(tooth)) {
      next.tooth = "牙位需为 11–48 的两位数字（FDI 编号，可带 # 前缀）";
    } else if (records.some((record) => record.tooth === tooth)) {
      next.tooth = `牙位 ${tooth} 已有记录，如需更新请在下方列表切换阶段`;
    }
    if (!state.diagnosis.trim()) {
      next.diagnosis = "请填写诊断";
    }
    if (!STAGES.includes(state.stage)) {
      next.stage = "请选择治疗阶段";
    }
    const length = state.workingLength.trim();
    if (!length) {
      next.workingLength = "请填写工作长度";
    } else if (!WL_PATTERN.test(length) || parseFloat(length) < 5 || parseFloat(length) > 40) {
      next.workingLength = "工作长度需为 5–40 mm 之间的数值（最多一位小数）";
    }
    return next;
  };

  const updateField = (key: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const nextErrors = validate(form);
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      pushToast("error", "保存失败：请修正标红字段后重试");
      return;
    }
    const tooth = normalizeTooth(form.tooth);
    const record: RCRecord = {
      id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      tooth,
      diagnosis: form.diagnosis.trim(),
      stage: form.stage,
      workingLength: String(parseFloat(form.workingLength.trim())),
      note: form.note.trim(),
      createdAt: new Date().toISOString(),
      source: "user"
    };
    setRecords((prev) => [record, ...prev]);
    setForm(EMPTY_FORM);
    setErrors({});
    pushToast("success", `保存成功：${tooth} 已录入，当前阶段「${record.stage}」`);
    if (activeFilter !== ALL_FILTER && activeFilter !== record.stage) {
      pushToast("info", `提示：当前筛选为「${activeFilter}」，新记录在「${record.stage}」列表中查看`);
    }
  };

  const handleStageSwitch = (record: RCRecord, nextStage: Stage) => {
    if (record.stage === nextStage) {
      pushToast("info", `${record.tooth} 当前已是「${nextStage}」阶段`);
      return;
    }
    setRecords((prev) =>
      prev.map((item) => (item.id === record.id ? { ...item, stage: nextStage } : item))
    );
    pushToast("success", `${record.tooth} 阶段已切换：${record.stage} → ${nextStage}`);
    if (activeFilter !== ALL_FILTER && nextStage !== activeFilter) {
      pushToast("info", `该记录已移出当前「${activeFilter}」筛选列表`);
    }
  };

  const handleFilter = (filter: string) => {
    setActiveFilter(filter);
    if (filter === ALL_FILTER) {
      pushToast("info", `已显示全部 ${records.length} 条记录`);
    } else {
      const count = records.filter((record) => record.stage === filter).length;
      pushToast("info", `已筛选「${filter}」阶段，共 ${count} 条记录`);
    }
  };

  const handleExport = () => {
    if (filteredRecords.length === 0) {
      pushToast("error", `当前「${activeFilter}」筛选下没有可导出的记录`);
      return;
    }
    const lengths = filteredRecords
      .map((record) => parseFloat(record.workingLength))
      .filter((value) => Number.isFinite(value) && value > 0);
    const average = lengths.length
      ? (lengths.reduce((sum, value) => sum + value, 0) / lengths.length).toFixed(1)
      : "—";
    const scope = activeFilter === ALL_FILTER ? "全部阶段" : `阶段：${activeFilter}`;
    const stamp = new Date().toLocaleString("zh-CN", { hour12: false });
    const escapeCell = (value: string) => {
      const text = value ?? "";
      return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    const lines = [
      ["牙科根管治疗记录摘要"],
      [`筛选范围,${scope}`],
      [`记录数量,${filteredRecords.length}`],
      [`平均工作长度(mm),${average}`],
      [`导出时间,${stamp}`],
      [],
      ["序号", "牙位", "诊断", "阶段", "工作长度(mm)", "备注", "记录时间", "来源"]
    ];
    filteredRecords.forEach((record, index) => {
      lines.push([
        String(index + 1),
        record.tooth,
        record.diagnosis,
        record.stage,
        record.workingLength || "—",
        record.note,
        new Date(record.createdAt).toLocaleString("zh-CN", { hour12: false }),
        record.source === "seed" ? "示例记录" : "新增记录"
      ]);
    });
    const csv = "﻿" + lines.map((row) => row.map(escapeCell).join(",")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const datePart = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.download = `根管记录摘要_${activeFilter === ALL_FILTER ? "全部" : activeFilter}_${datePart}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    pushToast(
      "success",
      `已导出 ${filteredRecords.length} 条记录（${scope}）`
    );
  };

  return (
    <main className="app-shell">
      <div className="toast-stack" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast-${toast.type}`}>
            {toast.text}
          </div>
        ))}
      </div>

      <section className="hero">
        <div>
          <p className="eyebrow">{project.id} · port {project.port}</p>
          <h1>{project.title}</h1>
          <p className="subtitle">{project.subtitle}</p>
        </div>
        <div className="stack-card">
          <span>技术栈</span>
          <strong>{project.stack}</strong>
        </div>
      </section>

      <section className="metrics-grid">
        {project.metrics.map((metric: string, index: number) => (
          <MetricCard key={metric} label={metric} value={metricValues[index]} index={index} />
        ))}
      </section>

      <section className="workspace">
        <aside className="panel narrow">
          <h2>角色</h2>
          <div className="chips">
            {project.users.map((user: string) => (
              <span key={user}>{user}</span>
            ))}
          </div>
          <h2>筛选</h2>
          <div className="chips muted filter-chips" role="group" aria-label="按阶段筛选记录">
            <button
              className={activeFilter === ALL_FILTER ? "chip-active" : ""}
              onClick={() => handleFilter(ALL_FILTER)}
            >
              {ALL_FILTER}
            </button>
            {project.filters.map((filter: string) => (
              <button
                key={filter}
                className={activeFilter === filter ? "chip-active" : ""}
                aria-pressed={activeFilter === filter}
                onClick={() => handleFilter(filter)}
              >
                {filter}
              </button>
            ))}
          </div>
          <p className="filter-hint">
            当前：{activeFilter === ALL_FILTER ? "全部阶段" : activeFilter} · {filteredRecords.length} 条
          </p>
        </aside>

        <section className="panel">
          <div className="section-heading">
            <div>
              <p>{project.domain}</p>
              <h2>记录字段</h2>
            </div>
            <button
              className="primary-action"
              type="button"
              onClick={() => {
                formRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
                toothInputRef.current?.focus();
                pushToast("info", "请在下方填写牙位、诊断、阶段和工作长度");
              }}
            >
              新增记录
            </button>
          </div>
          <form ref={formRef} className="field-grid" onSubmit={handleSubmit} noValidate>
            <label>
              <span>牙位 *</span>
              <input
                ref={toothInputRef}
                placeholder="如 36 或 #36（FDI 11–48）"
                value={form.tooth}
                maxLength={4}
                aria-invalid={Boolean(errors.tooth)}
                onChange={(event) => updateField("tooth", event.target.value)}
              />
              {errors.tooth && <em className="field-error">{errors.tooth}</em>}
            </label>
            <label>
              <span>诊断 *</span>
              <input
                placeholder="如 急性牙髓炎"
                value={form.diagnosis}
                maxLength={50}
                aria-invalid={Boolean(errors.diagnosis)}
                onChange={(event) => updateField("diagnosis", event.target.value)}
              />
              {errors.diagnosis && <em className="field-error">{errors.diagnosis}</em>}
            </label>
            <label>
              <span>阶段 *</span>
              <select
                value={form.stage}
                aria-invalid={Boolean(errors.stage)}
                onChange={(event) => updateField("stage", event.target.value)}
              >
                {STAGES.map((stage) => (
                  <option key={stage} value={stage}>
                    {stage}
                  </option>
                ))}
              </select>
              {errors.stage && <em className="field-error">{errors.stage}</em>}
            </label>
            <label>
              <span>工作长度 *（mm）</span>
              <input
                placeholder="如 19.5（5–40 mm）"
                value={form.workingLength}
                inputMode="decimal"
                maxLength={5}
                aria-invalid={Boolean(errors.workingLength)}
                onChange={(event) => updateField("workingLength", event.target.value)}
              />
              {errors.workingLength && <em className="field-error">{errors.workingLength}</em>}
            </label>
            <label className="field-full">
              <span>备注（可选，如根管数、主尖锉号、复诊计划）</span>
              <textarea
                rows={2}
                placeholder="如 MB 19.5mm，主尖锉#30"
                value={form.note}
                maxLength={200}
                onChange={(event) => updateField("note", event.target.value)}
              />
            </label>
            <div className="form-actions field-full">
              <button type="submit" className="primary-action">
                保存记录
              </button>
              <button
                type="button"
                onClick={() => {
                  setForm(EMPTY_FORM);
                  setErrors({});
                  pushToast("info", "录入表单已清空");
                }}
              >
                清空
              </button>
            </div>
          </form>
        </section>
      </section>

      <section className="records panel">
        <div className="section-heading">
          <div>
            <p>病例数据</p>
            <h2>近期记录</h2>
          </div>
          <button
            onClick={handleExport}
            disabled={filteredRecords.length === 0}
            title={filteredRecords.length === 0 ? "当前筛选下暂无记录" : "导出当前筛选结果"}
          >
            导出摘要（{filteredRecords.length}）
          </button>
        </div>
        <p className="list-scope">
          列表范围：{activeFilter === ALL_FILTER ? "全部阶段" : `阶段「${activeFilter}」`} · 共 {filteredRecords.length} 条
          {activeFilter !== ALL_FILTER && (
            <button className="link-button" onClick={() => handleFilter(ALL_FILTER)}>
              查看全部
            </button>
          )}
        </p>
        <div className="record-list">
          {filteredRecords.length === 0 && (
            <div className="empty-state">
              「{activeFilter}」阶段下暂无记录，可切换筛选或在上方录入新记录。
            </div>
          )}
          {filteredRecords.map((record: RCRecord, index: number) => (
            <article key={record.id} className="record-card">
              <div className="record-index">{String(index + 1).padStart(2, "0")}</div>
              <div className="record-body">
                <div className="record-head">
                  <h3>
                    {record.tooth}
                    {record.source === "seed" && <span className="tag tag-seed">示例</span>}
                  </h3>
                  <span className={`stage-badge stage-badge-${STAGES.indexOf(record.stage)}`}>
                    {record.stage}
                  </span>
                </div>
                <p>{record.diagnosis}</p>
                <p className="record-meta">
                  工作长度：{record.workingLength ? `${record.workingLength} mm` : "未记录"}
                  {record.note && <> · {record.note}</>}
                </p>
                <div className="stage-switch" role="group" aria-label={`${record.tooth} 阶段切换`}>
                  <span>阶段切换：</span>
                  {STAGES.map((stage) => (
                    <button
                      key={stage}
                      type="button"
                      className={record.stage === stage ? "stage-btn stage-btn-active" : "stage-btn"}
                      aria-pressed={record.stage === stage}
                      onClick={() => handleStageSwitch(record, stage as Stage)}
                    >
                      {stage}
                    </button>
                  ))}
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

export default App;
