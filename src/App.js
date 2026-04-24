import { useState, useEffect } from "react";
import logoPathnote from './logo-pathnote.png';

// ── Light theme design tokens ─────────────────────────────────
const C = {
  bg:      "#F8F9FC",
  surface: "#FFFFFF",
  card:    "#FFFFFF",
  border:  "#E4E8F0",
  accent:  "#4361EE",
  accentL: "#EEF1FD",
  gold:    "#F4A228",
  goldL:   "#FEF6E8",
  green:   "#2DC98A",
  greenL:  "#E8FAF3",
  red:     "#F45B5B",
  redL:    "#FEF0F0",
  text:    "#1A1D2E",
  sub:     "#4A4F6A",
  muted:   "#9EA3BC",
  shadow:  "0 2px 12px rgba(0,0,0,0.06)",
};

const FONT_BODY = "'Noto Sans JP', 'Hiragino Sans', sans-serif";
const FONT_MONO = "'DM Mono', monospace";

// ── Skill categories ──────────────────────────────────────────
const SKILL_CATS = [
  { label: "コミュニケーション", color: "#4361EE", icon: "💬", skills: ["プレゼンテーション","交渉・説得","ヒアリング","文章作成","語学（英語）","ファシリテーション","電話・メール対応"] },
  { label: "思考・分析",        color: "#7B2FBE", icon: "🧠", skills: ["論理的思考","データ分析","課題発見","企画立案","リサーチ","数値管理","問題解決"] },
  { label: "マネジメント",      color: "#F4A228", icon: "👥", skills: ["チームマネジメント","プロジェクト管理","目標設定","育成・コーチング","採用","予算管理","リスク管理"] },
  { label: "クリエイティブ",    color: "#E91E8C", icon: "🎨", skills: ["デザイン思考","グラフィック","映像・動画","コピーライティング","SNS運用","ブランディング","写真・撮影"] },
  { label: "営業・マーケ",      color: "#FF6B35", icon: "📈", skills: ["営業","マーケティング","集客・広告","顧客管理(CRM)","市場調査","SNSマーケ","コンテンツ制作"] },
  { label: "専門・技術",        color: "#2DC98A", icon: "🔧", skills: ["IT・プログラミング","財務・会計","法務・コンプライアンス","医療・介護","教育・研修","建築・設計","製造・品質管理"] },
  { label: "ビジネス基礎",      color: "#6B8CFF", icon: "💼", skills: ["Excel・Word","資料作成","スケジュール管理","議事録作成","事務処理","顧客対応","報連相"] },
];

const TRAIT_CATS = [
  { label: "働き方の志向", icon: "⚡", traits: [
    { id: "creative",  label: "ものづくりが好き", icon: "🎨" },
    { id: "people",    label: "人と話すのが好き", icon: "💬" },
    { id: "analyze",   label: "データや数字が好き", icon: "📊" },
    { id: "lead",      label: "人をまとめるのが好き", icon: "👑" },
    { id: "support",   label: "人をサポートしたい", icon: "🤝" },
    { id: "solo",      label: "一人で集中したい", icon: "🎯" },
  ]},
  { label: "大切にしていること", icon: "💡", traits: [
    { id: "growth",    label: "成長・学び", icon: "🌱" },
    { id: "stability", label: "安定・安心", icon: "🏠" },
    { id: "income",    label: "収入アップ", icon: "💰" },
    { id: "impact",    label: "社会への貢献", icon: "🌍" },
    { id: "balance",   label: "ワークライフバランス", icon: "⚖️" },
    { id: "challenge", label: "挑戦・変化", icon: "🚀" },
  ]},
  { label: "苦手なこと（正直に選ぶと精度UP）", icon: "🙅", traits: [
    { id: "no_routine",   label: "ルーティン作業は苦手", icon: "😅" },
    { id: "no_people",    label: "人と話すのは苦手", icon: "😶" },
    { id: "no_numbers",   label: "数字・計算は苦手", icon: "🤯" },
    { id: "no_pressure",  label: "プレッシャーは苦手", icon: "😰" },
    { id: "no_manage",    label: "人をまとめるのは苦手", icon: "😓" },
    { id: "no_ambiguity", label: "曖昧な状況は苦手", icon: "🤔" },
  ]},
];

const YEAR_OPTS = ["半年未満","半年〜1年","1〜3年","3〜5年","5年以上"];
const YEAR_TO_NUM = { "半年未満":10,"半年〜1年":25,"1〜3年":50,"3〜5年":75,"5年以上":95 };

const INCOME_OPTS = ["300万円未満","300〜400万円","400〜500万円","500〜700万円","700〜1000万円","1000万円以上","答えたくない"];
const POSITION_OPTS = ["学生・就活中","アルバイト・パート","一般社員・スタッフ","主任・リーダー","係長・課長補佐","課長・マネージャー","部長・シニアマネージャー","役員・経営者","フリーランス・個人事業主","その他"];

// ── Groq API ──────────────────────────────────────────────────
async function callAI(prompt) {
  const apiKey = process.env.REACT_APP_GROQ_API_KEY;
  if (!apiKey) throw new Error("APIキーが設定されていません");
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "llama-3.1-8b-instant",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
    }),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(`API ${res.status}: ${e?.error?.message || res.statusText}`);
  }
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content || "";
  const start = text.indexOf("{");
  if (start === -1) throw new Error("JSONが見つかりませんでした");
  let depth = 0, end = -1;
  for (let i = start; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}") { depth--; if (depth === 0) { end = i; break; } }
  }
  if (end === -1) throw new Error("JSONが不完全です");
  return JSON.parse(text.slice(start, end + 1));
}

// ── Storage ───────────────────────────────────────────────────
const STORAGE_KEY = "pathnote_profile_v1";
function loadProfile() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch { return null; } }
function saveProfile(p) { localStorage.setItem(STORAGE_KEY, JSON.stringify(p)); }

// ── Components ────────────────────────────────────────────────
function Bar({ value, color = C.accent, height = 6 }) {
  return (
    <div style={{ background: C.border, borderRadius: 99, height, overflow: "hidden" }}>
      <div style={{ width: `${Math.min(value, 100)}%`, height: "100%", background: color, borderRadius: 99, transition: "width 0.8s ease" }} />
    </div>
  );
}

function RadarChart({ data, size = 200 }) {
  const cx = size/2, cy = size/2, r = size*0.36;
  const n = data.length;
  if (n < 3) return null;
  const angle = i => (Math.PI*2*i)/n - Math.PI/2;
  const pt = (i, ratio) => ({ x: cx+r*ratio*Math.cos(angle(i)), y: cy+r*ratio*Math.sin(angle(i)) });
  return (
    <svg width={size} height={size}>
      {[0.25,0.5,0.75,1].map(rat => (
        <polygon key={rat} points={data.map((_,i)=>{ const p=pt(i,rat); return `${p.x},${p.y}`; }).join(" ")} fill="none" stroke={C.border} strokeWidth={1}/>
      ))}
      {data.map((_,i)=>{ const p=pt(i,1); return <line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke={C.border} strokeWidth={1}/>; })}
      <polygon points={data.map((d,i)=>{ const p=pt(i,d.value/100); return `${p.x},${p.y}`; }).join(" ")} fill={`${C.accent}18`} stroke={C.accent} strokeWidth={2}/>
      {data.map((d,i)=>{ const p=pt(i,d.value/100); return <circle key={i} cx={p.x} cy={p.y} r={3} fill={C.accent}/>; })}
      {data.map((d,i)=>{ const p=pt(i,1.26); return <text key={i} x={p.x} y={p.y} textAnchor="middle" dominantBaseline="middle" fontSize={8} fill={C.sub} fontFamily={FONT_BODY}>{d.label}</text>; })}
    </svg>
  );
}

function AILoading() {
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState(0);
  const phases = ["プロフィールを解析中...", "スキルを分析中...", "志向性を照合中...", "提案を生成中..."];
  useEffect(() => {
    const iv = setInterval(() => setProgress(prev => prev >= 95 ? 95 : prev + (prev < 40 ? 3 : prev < 70 ? 1.5 : 0.5)), 200);
    return () => clearInterval(iv);
  }, []);
  useEffect(() => { setPhase(Math.min(Math.floor(progress/25), 3)); }, [progress]);
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(248,249,252,0.95)", zIndex:1000, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:20 }}>
      <img src={logoPathnote} alt="PathNote" style={{ width:56, height:56, objectFit:"contain" }} />
      <div style={{ fontFamily:FONT_BODY, color:C.accent, fontSize:15, fontWeight:600 }}>AI分析中</div>
      <div style={{ width:280 }}>
        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8 }}>
          <span style={{ color:C.sub, fontSize:12 }}>{phases[phase]}</span>
          <span style={{ fontFamily:FONT_MONO, color:C.accent, fontSize:13, fontWeight:600 }}>{Math.round(progress)}%</span>
        </div>
        <div style={{ background:C.border, borderRadius:99, height:8, overflow:"hidden" }}>
          <div style={{ width:`${progress}%`, height:"100%", background:`linear-gradient(90deg,${C.accent},#7B8FFF)`, borderRadius:99, transition:"width 0.2s ease" }}/>
        </div>
      </div>
      <div style={{ display:"flex", gap:8 }}>
        {phases.map((_,i) => <div key={i} style={{ width:8, height:8, borderRadius:"50%", background:i<=phase?C.accent:C.border, transition:"background 0.3s" }}/>)}
      </div>
      <div style={{ color:C.muted, fontSize:12, textAlign:"center", lineHeight:1.7 }}>少々お待ちください（30秒〜1分）</div>
    </div>
  );
}

// ── Tag component ─────────────────────────────────────────────
function Tag({ label, onRemove, color = C.accent }) {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:6, padding:"5px 10px", borderRadius:20, background:`${color}15`, border:`1px solid ${color}33`, fontSize:12, color:color }}>
      {label}
      {onRemove && (
        <button onClick={onRemove} style={{ background:"none", border:"none", cursor:"pointer", color:color, fontSize:14, lineHeight:1, padding:0, display:"flex", alignItems:"center" }}>×</button>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
export default function App() {
  const [page, setPage] = useState("loading");
  const [step, setStep] = useState(1); // 1=profile, 2=skills, 3=traits
  const [profile, setProfile] = useState(null);

  // Profile inputs
  const [currentJob, setCurrentJob] = useState("");
  const [position, setPosition] = useState("");
  const [age, setAge] = useState("");
  const [income, setIncome] = useState("");

  const [skillMap, setSkillMap] = useState({});
  const [traits, setTraits] = useState([]);
  const [aiSuggest, setAiSuggest] = useState(null);

  // Customizable goal skills
  const [goalSkills, setGoalSkills] = useState([]); // [{ id, label, type }]
  const [showSkillPicker, setShowSkillPicker] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");

  const [selectedGoal, setSelectedGoal] = useState(null);
  const [roadmap, setRoadmap] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const [activeTab, setActiveTab] = useState("overview");

  useEffect(() => {
    const p = loadProfile();
    if (p) {
      setProfile(p);
      setSkillMap(p.skillMap || {});
      setTraits(p.traits || []);
      setCurrentJob(p.currentJob || "");
      setPosition(p.position || "");
      setAge(p.age || "");
      setIncome(p.income || "");
      setAiSuggest(p.aiSuggest || null);
      setRoadmap(p.roadmap || null);
      setSelectedGoal(p.goal || null);
      setGoalSkills(p.goalSkills || []);
      setPage("dashboard");
    } else {
      setPage("skill-input");
    }
  }, []);

  const persist = (updates, nextPage) => {
    const np = { ...(profile||{}), ...updates, updatedAt: new Date().toISOString() };
    setProfile(np);
    saveProfile(np);
    if (nextPage) setPage(nextPage);
  };

  const toggleSkill = skill => {
    setSkillMap(prev => {
      const n = {...prev};
      if (n[skill]) delete n[skill]; else n[skill] = "半年未満";
      return n;
    });
  };
  const setYears = (skill, y) => setSkillMap(prev => ({...prev, [skill]: y}));
  const toggleTrait = id => setTraits(prev => prev.includes(id) ? prev.filter(t=>t!==id) : [...prev, id]);

  // Goal skill management
  const addGoalSkill = (skill) => {
    if (!goalSkills.find(s => s.label === skill)) {
      setGoalSkills(prev => [...prev, { id: Date.now(), label: skill, type: "custom" }]);
    }
  };
  const removeGoalSkill = (id) => setGoalSkills(prev => prev.filter(s => s.id !== id));

  const allSkills = SKILL_CATS.flatMap(cat => cat.skills);
  const filteredSkills = allSkills.filter(s =>
    s.includes(pickerSearch) && !goalSkills.find(g => g.label === s)
  );

  const goAnalyze = async () => {
    setAiLoading(true); setAiError("");
    try {
      const skillList = Object.entries(skillMap).map(([k,v])=>`${k}(${v})`).join(", ") || "なし";
      const traitLabels = TRAIT_CATS.flatMap(c=>c.traits).filter(t=>traits.includes(t.id)).map(t=>t.label).join(", ") || "なし";
      const prompt = `You are a career advisor. Analyze the following person and suggest career goals. Respond ONLY with valid JSON.

Current job: ${currentJob || "未入力"}
Position: ${position || "未入力"}
Age: ${age || "未入力"}
Income: ${income || "未入力"}
Skills: ${skillList}
Personality: ${traitLabels}

Return ONLY this JSON (no explanation):
{"summary":"2〜3文の現状分析（日本語）","radarData":[{"label":"コミュ","value":40},{"label":"思考分析","value":30},{"label":"マネジメント","value":20},{"label":"クリエイティブ","value":35},{"label":"営業マーケ","value":25},{"label":"専門技術","value":30},{"label":"ビジネス","value":50}],"suggestions":[{"type":"job","title":"職種名","reason":"理由（日本語1文）","fit":85,"recommendedSkills":["スキル1","スキル2","スキル3"]},{"type":"job","title":"職種名2","reason":"理由","fit":72,"recommendedSkills":["スキル1","スキル2"]},{"type":"skill","title":"スキル名","reason":"理由","fit":90,"recommendedSkills":["スキル1","スキル2"]},{"type":"skill","title":"スキル名2","reason":"理由","fit":78,"recommendedSkills":["スキル1","スキル2"]}]}

Rules: all values 0-100 integers, exactly 4 suggestions, exactly 7 radarData items, recommendedSkills 2-4 items each, JSON only.`;

      const result = await callAI(prompt);
      if (!Array.isArray(result.radarData)) result.radarData = [];
      if (!Array.isArray(result.suggestions)) result.suggestions = [];
      setAiSuggest(result);
      persist({ skillMap, traits, currentJob, position, age, income, aiSuggest: result }, "ai-suggest");
    } catch(e) { setAiError(`エラー: ${e.message}`); }
    finally { setAiLoading(false); }
  };

  const selectGoalWithSkills = (suggestion) => {
    setSelectedGoal(suggestion);
    const recommended = (suggestion.recommendedSkills || []).map((s, i) => ({ id: Date.now() + i, label: s, type: "ai" }));
    setGoalSkills(recommended);
    persist({ goal: suggestion, goalSkills: recommended });
    setPage("goal-customize");
  };

  const goRoadmap = async () => {
    setAiLoading(true); setAiError("");
    try {
      const skillList = Object.entries(skillMap).map(([k,v])=>`${k}(${v})`).join(", ") || "なし";
      const targetSkills = goalSkills.map(s => s.label).join(", ");
      const prompt = `You are a career advisor. Create a learning roadmap. Respond ONLY with valid JSON.

Current job: ${currentJob || "未入力"}, Position: ${position || "未入力"}, Age: ${age || "未入力"}
Current skills: ${skillList}
Goal: ${selectedGoal?.title}
Target skills to acquire: ${targetSkills}

Return ONLY this JSON:
{"goal":"${selectedGoal?.title}","overview":"概要（日本語1〜2文）","steps":[{"phase":1,"title":"フェーズ名","months":"1〜2ヶ月","skills":["スキル1"],"actions":["アクション1","アクション2"],"milestone":"達成指標","done":false,"doneAt":null}]}

Rules: 3-4 steps, all text in Japanese except JSON keys, JSON only.`;

      const result = await callAI(prompt);
      if (!Array.isArray(result.steps)) result.steps = [];
      result.steps = result.steps.map(s => ({...s, done:false, doneAt:null}));
      setRoadmap(result);
      persist({ skillMap, traits, currentJob, position, age, income, goal: selectedGoal, goalSkills, roadmap: result }, "roadmap");
    } catch(e) { setAiError(`エラー: ${e.message}`); }
    finally { setAiLoading(false); }
  };

  const toggleStep = idx => {
    const updated = {...roadmap, steps: roadmap.steps.map((s,i) =>
      i===idx ? {...s, done:!s.done, doneAt:!s.done?new Date().toISOString():null} : s
    )};
    setRoadmap(updated);
    persist({ roadmap: updated });
  };

  const radarFromSkillMap = sm => SKILL_CATS.map(cat => {
    const vals = cat.skills.filter(s=>sm[s]).map(s=>YEAR_TO_NUM[sm[s]]||0);
    return { label: cat.label.slice(0,5), value: vals.length ? Math.round(vals.reduce((a,b)=>a+b,0)/vals.length) : 0 };
  });

  const doneCount = roadmap ? roadmap.steps.filter(s=>s.done).length : 0;
  const totalSteps = roadmap ? roadmap.steps.length : 0;
  const progress = totalSteps ? Math.round((doneCount/totalSteps)*100) : 0;

  // ── Input style ───────────────────────────────────────────
  const inputStyle = {
    width:"100%", padding:"10px 14px",
    background:C.bg, border:`1px solid ${C.border}`,
    borderRadius:10, color:C.text,
    fontSize:14, fontFamily:FONT_BODY,
    outline:"none", transition:"border 0.2s",
  };
  const selectStyle = { ...inputStyle, cursor:"pointer" };

  // ── Shell ──────────────────────────────────────────────────
  const shell = children => (
    <div style={{ minHeight:"100vh", background:C.bg, color:C.text, fontFamily:FONT_BODY }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap');
        @keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
        @keyframes spin{to{transform:rotate(360deg)}}
        *{box-sizing:border-box;margin:0;padding:0}
        input:focus,select:focus{border-color:${C.accent}!important;box-shadow:0 0 0 3px ${C.accentL}}
        button:hover{opacity:0.85;transition:opacity 0.15s}
        ::-webkit-scrollbar{width:4px}
        ::-webkit-scrollbar-thumb{background:${C.border};border-radius:2px}
      `}</style>
      {aiLoading && <AILoading />}
      <nav style={{ background:C.surface, borderBottom:`1px solid ${C.border}`, padding:"14px 24px", display:"flex", alignItems:"center", justifyContent:"space-between", position:"sticky", top:0, zIndex:100, boxShadow:C.shadow }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <img src={logoPathnote} alt="PathNote" style={{ width:32, height:32, objectFit:"contain" }} />
          <span style={{ fontWeight:700, fontSize:17, color:C.text, letterSpacing:"-0.02em" }}>PathNote</span>
        </div>
        {profile && (
          <button onClick={()=>setPage("dashboard")} style={{ background:"transparent", border:`1px solid ${C.border}`, borderRadius:8, padding:"6px 14px", color:C.sub, cursor:"pointer", fontSize:13, fontFamily:FONT_BODY }}>
            マイページ
          </button>
        )}
      </nav>
      <div style={{ maxWidth:760, margin:"0 auto", padding:"32px 20px" }}>{children}</div>
    </div>
  );

  const stepLabel = (n, label) => (
    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
      <div style={{ width:22, height:22, borderRadius:"50%", background:C.accent, color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:700, flexShrink:0 }}>{n}</div>
      <span style={{ fontSize:11, fontWeight:600, color:C.accent, letterSpacing:"0.08em" }}>{label}</span>
    </div>
  );

  // ── Loading ────────────────────────────────────────────────
  if (page === "loading") return shell(
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"60vh", gap:12, color:C.muted }}>
      <div style={{ width:18, height:18, border:`2px solid ${C.border}`, borderTopColor:C.accent, borderRadius:"50%", animation:"spin .8s linear infinite" }}/>読み込み中...
    </div>
  );

  // ── Skill Input ────────────────────────────────────────────
  if (page === "skill-input") return shell(
    <div style={{ animation:"fadeUp 0.4s ease" }}>
      {/* Step tabs */}
      <div style={{ display:"flex", gap:4, background:C.surface, border:`1px solid ${C.border}`, borderRadius:12, padding:4, marginBottom:28 }}>
        {[["1","プロフィール"],["2","スキル登録"],["3","志向性"]].map(([n, label], i) => (
          <div key={n} style={{ flex:1, padding:"8px 0", borderRadius:8, background:step===i+1?C.accentL:"transparent", color:step===i+1?C.accent:C.muted, textAlign:"center", fontSize:13, fontWeight:step===i+1?600:400, transition:"all 0.2s" }}>
            {n}. {label}
          </div>
        ))}
      </div>

      {/* Step 1: Profile */}
      {step === 1 && (
        <>
          {stepLabel(1, "PROFILE")}
          <h1 style={{ fontSize:22, fontWeight:700, marginBottom:6 }}>現在のプロフィールを入力</h1>
          <p style={{ color:C.sub, fontSize:14, marginBottom:24 }}>入力するほどAIの提案精度が上がります（任意）</p>

          <div style={{ display:"flex", flexDirection:"column", gap:16, marginBottom:28 }}>
            <div>
              <label style={{ display:"block", fontSize:12, fontWeight:600, color:C.sub, marginBottom:6 }}>現在の職種・仕事内容</label>
              <input value={currentJob} onChange={e=>setCurrentJob(e.target.value)} placeholder="例：営業、エンジニア、主婦、学生など" style={inputStyle} />
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
              <div>
                <label style={{ display:"block", fontSize:12, fontWeight:600, color:C.sub, marginBottom:6 }}>ポジション</label>
                <select value={position} onChange={e=>setPosition(e.target.value)} style={selectStyle}>
                  <option value="">選択してください</option>
                  {POSITION_OPTS.map(p=><option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display:"block", fontSize:12, fontWeight:600, color:C.sub, marginBottom:6 }}>年齢</label>
                <input value={age} onChange={e=>setAge(e.target.value)} placeholder="例：28" type="number" min="15" max="80" style={inputStyle} />
              </div>
            </div>
            <div>
              <label style={{ display:"block", fontSize:12, fontWeight:600, color:C.sub, marginBottom:6 }}>現在の年収</label>
              <select value={income} onChange={e=>setIncome(e.target.value)} style={selectStyle}>
                <option value="">選択してください</option>
                {INCOME_OPTS.map(i=><option key={i} value={i}>{i}</option>)}
              </select>
            </div>
          </div>

          <button onClick={()=>setStep(2)} style={{ width:"100%", padding:14, background:C.accent, border:"none", borderRadius:12, color:"#fff", fontWeight:700, fontSize:15, fontFamily:FONT_BODY, cursor:"pointer" }}>
            次へ：スキル登録 →
          </button>
        </>
      )}

      {/* Step 2: Skills */}
      {step === 2 && (
        <>
          {stepLabel(2, "SKILLS")}
          <h1 style={{ fontSize:22, fontWeight:700, marginBottom:6 }}>あなたのスキルを登録</h1>
          <p style={{ color:C.sub, fontSize:14, marginBottom:6 }}>経験・得意なことを選んでください</p>
          <div style={{ color:C.accent, fontFamily:FONT_MONO, fontSize:12, marginBottom:20, fontWeight:600 }}>{Object.keys(skillMap).length} 個選択中</div>

          {SKILL_CATS.map(cat=>(
            <div key={cat.label} style={{ marginBottom:22 }}>
              <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:10 }}>
                <span>{cat.icon}</span>
                <span style={{ fontSize:13, fontWeight:600, color:cat.color }}>{cat.label}</span>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(155px,1fr))", gap:8 }}>
                {cat.skills.map(skill=>{
                  const sel = !!skillMap[skill];
                  return (
                    <div key={skill} style={{ border:`1.5px solid ${sel?cat.color:C.border}`, background:sel?`${cat.color}0D`:C.surface, borderRadius:10, padding:"10px 12px", transition:"all 0.2s", boxShadow:sel?`0 2px 8px ${cat.color}22`:"none" }}>
                      <div onClick={()=>toggleSkill(skill)} style={{ display:"flex", alignItems:"center", gap:8, cursor:"pointer", marginBottom:sel?8:0 }}>
                        <div style={{ width:16, height:16, borderRadius:4, border:`2px solid ${sel?cat.color:C.border}`, background:sel?cat.color:"transparent", display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, color:"#fff", flexShrink:0 }}>{sel?"✓":""}</div>
                        <span style={{ fontSize:13, color:sel?C.text:C.sub }}>{skill}</span>
                      </div>
                      {sel && (
                        <select value={skillMap[skill]} onChange={e=>setYears(skill,e.target.value)}
                          style={{ width:"100%", padding:"4px 6px", background:C.bg, border:`1px solid ${cat.color}44`, borderRadius:6, color:C.text, fontSize:11, fontFamily:FONT_BODY, cursor:"pointer" }}>
                          {YEAR_OPTS.map(y=><option key={y} value={y}>{y}</option>)}
                        </select>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          <div style={{ display:"flex", gap:12 }}>
            <button onClick={()=>setStep(1)} style={{ flex:1, padding:13, background:"transparent", border:`1px solid ${C.border}`, borderRadius:12, color:C.sub, cursor:"pointer", fontSize:14, fontFamily:FONT_BODY }}>← 戻る</button>
            <button onClick={()=>setStep(3)} style={{ flex:2, padding:13, background:C.accent, border:"none", borderRadius:12, color:"#fff", fontWeight:700, fontSize:14, fontFamily:FONT_BODY, cursor:"pointer" }}>次へ：志向性 →</button>
          </div>
        </>
      )}

      {/* Step 3: Traits */}
      {step === 3 && (
        <>
          {stepLabel(3, "PERSONALITY")}
          <h1 style={{ fontSize:22, fontWeight:700, marginBottom:6 }}>あなたの志向性</h1>
          <p style={{ color:C.sub, fontSize:14, marginBottom:6 }}>当てはまるものをすべて選んでください</p>
          <div style={{ color:C.gold, fontFamily:FONT_MONO, fontSize:12, marginBottom:20, fontWeight:600 }}>{traits.length} 個選択中</div>

          {TRAIT_CATS.map(cat=>(
            <div key={cat.label} style={{ marginBottom:24 }}>
              <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:10 }}>
                <span>{cat.icon}</span>
                <span style={{ fontSize:13, fontWeight:600, color:C.sub }}>{cat.label}</span>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(168px,1fr))", gap:8 }}>
                {cat.traits.map(t=>{
                  const sel = traits.includes(t.id);
                  return (
                    <div key={t.id} onClick={()=>toggleTrait(t.id)}
                      style={{ border:`1.5px solid ${sel?C.gold:C.border}`, background:sel?C.goldL:C.surface, borderRadius:10, padding:"11px 14px", cursor:"pointer", display:"flex", alignItems:"center", gap:10, transition:"all 0.2s" }}>
                      <span style={{ fontSize:16 }}>{t.icon}</span>
                      <span style={{ fontSize:13, color:sel?C.text:C.sub }}>{t.label}</span>
                      {sel && <div style={{ marginLeft:"auto", width:16, height:16, borderRadius:"50%", background:C.gold, display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, color:"#fff", flexShrink:0 }}>✓</div>}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {aiError && <div style={{ color:C.red, background:C.redL, border:`1px solid ${C.red}44`, borderRadius:8, padding:"10px 14px", fontSize:12, marginBottom:16 }}>{aiError}</div>}

          <div style={{ display:"flex", gap:12 }}>
            <button onClick={()=>setStep(2)} style={{ flex:1, padding:13, background:"transparent", border:`1px solid ${C.border}`, borderRadius:12, color:C.sub, cursor:"pointer", fontSize:14, fontFamily:FONT_BODY }}>← 戻る</button>
            <button onClick={goAnalyze} disabled={aiLoading} style={{ flex:2, padding:13, background:`linear-gradient(135deg,${C.accent},#7B8FFF)`, border:"none", borderRadius:12, color:"#fff", fontWeight:700, fontSize:14, fontFamily:FONT_BODY, cursor:"pointer" }}>
              ✨ AIで分析・目標提案へ
            </button>
          </div>
        </>
      )}
    </div>
  );

  // ── AI Suggest ─────────────────────────────────────────────
  if (page === "ai-suggest") {
    const suggest = aiSuggest || profile?.aiSuggest;
    const radar = Array.isArray(suggest?.radarData) ? suggest.radarData : radarFromSkillMap(skillMap);
    return shell(
      <div style={{ animation:"fadeUp 0.4s ease" }}>
        <div style={{ fontSize:11, fontWeight:700, color:C.accent, letterSpacing:"0.1em", marginBottom:6 }}>ANALYSIS</div>
        <h1 style={{ fontSize:22, fontWeight:700, marginBottom:6 }}>あなたのスキル分析</h1>
        <p style={{ color:C.sub, fontSize:14, marginBottom:24 }}>AIがプロフィールとスキルを分析しました</p>

        {/* Profile summary */}
        <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:14, padding:18, marginBottom:20, display:"flex", flexWrap:"wrap", gap:10 }}>
          {[
            { label:"職種", value:currentJob||profile?.currentJob||"—" },
            { label:"ポジション", value:position||profile?.position||"—" },
            { label:"年齢", value:age ? `${age}歳` : profile?.age ? `${profile.age}歳` : "—" },
            { label:"年収", value:income||profile?.income||"—" },
          ].map(item=>(
            <div key={item.label} style={{ background:C.bg, borderRadius:8, padding:"8px 14px", minWidth:100 }}>
              <div style={{ fontSize:10, color:C.muted, marginBottom:2 }}>{item.label}</div>
              <div style={{ fontSize:13, fontWeight:600, color:C.text }}>{item.value}</div>
            </div>
          ))}
        </div>

        {/* Radar + summary */}
        <div style={{ display:"flex", gap:20, flexWrap:"wrap", background:C.surface, border:`1px solid ${C.border}`, borderRadius:16, padding:24, marginBottom:20, boxShadow:C.shadow }}>
          <div style={{ display:"flex", justifyContent:"center", alignItems:"center" }}>
            <RadarChart data={radar} size={190}/>
          </div>
          <div style={{ flex:1, minWidth:180 }}>
            <div style={{ fontSize:11, fontWeight:700, color:C.gold, marginBottom:8 }}>AI分析コメント</div>
            <p style={{ color:C.sub, fontSize:14, lineHeight:1.8, marginBottom:14 }}>{suggest?.summary}</p>
            <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
              {radar.map(d=>(
                <div key={d.label}>
                  <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, color:C.muted, marginBottom:2 }}><span>{d.label}</span><span style={{ fontFamily:FONT_MONO }}>{d.value}</span></div>
                  <Bar value={d.value} color={C.accent} height={4}/>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={{ fontSize:11, fontWeight:700, color:C.sub, letterSpacing:"0.08em", marginBottom:12 }}>目標を選んでカスタマイズ</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:24 }}>
          {(suggest?.suggestions||[]).map((s,i)=>(
            <button key={i} onClick={()=>selectGoalWithSkills(s)}
              style={{ textAlign:"left", padding:18, background:C.surface, border:`1.5px solid ${C.border}`, borderRadius:14, cursor:"pointer", fontFamily:FONT_BODY, transition:"all 0.2s", boxShadow:C.shadow }}>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8 }}>
                <span style={{ fontSize:11, padding:"2px 8px", borderRadius:20, background:s.type==="job"?C.accentL:C.greenL, color:s.type==="job"?C.accent:C.green, fontWeight:600 }}>{s.type==="job"?"🎯 職種":"📚 スキル"}</span>
                <span style={{ fontFamily:FONT_MONO, fontSize:12, color:C.gold, fontWeight:600 }}>{s.fit}%</span>
              </div>
              <div style={{ fontWeight:700, fontSize:15, color:C.text, marginBottom:6 }}>{s.title}</div>
              <div style={{ fontSize:12, color:C.sub, lineHeight:1.6, marginBottom:10 }}>{s.reason}</div>
              <Bar value={s.fit} color={s.type==="job"?C.accent:C.green} height={4}/>
            </button>
          ))}
        </div>

        {aiError && <div style={{ color:C.red, background:C.redL, border:`1px solid ${C.red}44`, borderRadius:8, padding:"10px 14px", fontSize:12, marginBottom:16 }}>{aiError}</div>}

        <button onClick={()=>{ setStep(1); setPage("skill-input"); }}
          style={{ background:"transparent", border:`1px solid ${C.border}`, borderRadius:10, padding:"10px 20px", color:C.sub, cursor:"pointer", fontSize:13, fontFamily:FONT_BODY }}>
          ← プロフィール・スキルを修正する
        </button>
      </div>
    );
  }

  // ── Goal Customize ─────────────────────────────────────────
  if (page === "goal-customize") return shell(
    <div style={{ animation:"fadeUp 0.4s ease" }}>
      <div style={{ fontSize:11, fontWeight:700, color:C.accent, letterSpacing:"0.1em", marginBottom:6 }}>GOAL SETUP</div>
      <h1 style={{ fontSize:22, fontWeight:700, marginBottom:4 }}>目標スキルをカスタマイズ</h1>
      <p style={{ color:C.sub, fontSize:14, marginBottom:4 }}>目標：<span style={{ color:C.gold, fontWeight:600 }}>{selectedGoal?.title}</span></p>
      <p style={{ color:C.sub, fontSize:13, marginBottom:24 }}>AIが提案したスキルを編集できます。不要なものは削除、追加したいものは選んでください。</p>

      {/* Current goal skills */}
      <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:14, padding:20, marginBottom:20, boxShadow:C.shadow }}>
        <div style={{ fontSize:12, fontWeight:700, color:C.sub, marginBottom:12 }}>選択中の目標スキル</div>
        {goalSkills.length === 0 ? (
          <div style={{ color:C.muted, fontSize:13 }}>スキルが選択されていません</div>
        ) : (
          <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
            {goalSkills.map(s=>(
              <Tag key={s.id} label={s.label} color={s.type==="ai"?C.accent:C.green} onRemove={()=>removeGoalSkill(s.id)}/>
            ))}
          </div>
        )}
      </div>

      {/* Add skills */}
      <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:14, padding:20, marginBottom:24, boxShadow:C.shadow }}>
        <div style={{ fontSize:12, fontWeight:700, color:C.sub, marginBottom:12 }}>スキルを追加する</div>
        <input
          value={pickerSearch}
          onChange={e=>setPickerSearch(e.target.value)}
          placeholder="スキル名で検索..."
          style={{ ...inputStyle, marginBottom:12 }}
        />
        <div style={{ display:"flex", flexWrap:"wrap", gap:8, maxHeight:200, overflowY:"auto" }}>
          {filteredSkills.slice(0, 30).map(skill=>(
            <button key={skill} onClick={()=>addGoalSkill(skill)}
              style={{ padding:"5px 12px", borderRadius:20, border:`1px solid ${C.border}`, background:C.bg, color:C.sub, cursor:"pointer", fontSize:12, fontFamily:FONT_BODY, transition:"all 0.15s" }}>
              + {skill}
            </button>
          ))}
        </div>
      </div>

      {aiError && <div style={{ color:C.red, background:C.redL, border:`1px solid ${C.red}44`, borderRadius:8, padding:"10px 14px", fontSize:12, marginBottom:16 }}>{aiError}</div>}

      <div style={{ display:"flex", gap:12 }}>
        <button onClick={goRoadmap} disabled={aiLoading || goalSkills.length===0}
          style={{ flex:2, padding:14, background:goalSkills.length>0?`linear-gradient(135deg,${C.accent},#7B8FFF)`:C.border, border:"none", borderRadius:12, color:"#fff", fontWeight:700, fontSize:14, fontFamily:FONT_BODY, cursor:goalSkills.length>0?"pointer":"not-allowed" }}>
          🗺️ ロードマップを生成する
        </button>
        <button onClick={()=>setPage("ai-suggest")}
          style={{ flex:1, padding:14, background:"transparent", border:`1px solid ${C.border}`, borderRadius:12, color:C.sub, cursor:"pointer", fontSize:13, fontFamily:FONT_BODY }}>
          ← 目標を変える
        </button>
      </div>
    </div>
  );

  // ── Roadmap ────────────────────────────────────────────────
  if (page === "roadmap") return shell(
    <div style={{ animation:"fadeUp 0.4s ease" }}>
      <div style={{ fontSize:11, fontWeight:700, color:C.accent, letterSpacing:"0.1em", marginBottom:6 }}>ROADMAP</div>
      <h1 style={{ fontSize:22, fontWeight:700, marginBottom:4 }}>学習ロードマップ</h1>
      <p style={{ color:C.sub, fontSize:14, marginBottom:4 }}>目標：<span style={{ color:C.gold, fontWeight:600 }}>{roadmap?.goal}</span></p>
      <p style={{ color:C.sub, fontSize:13, marginBottom:24 }}>{roadmap?.overview}</p>

      {/* Target skills */}
      {goalSkills.length > 0 && (
        <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:12, padding:16, marginBottom:20 }}>
          <div style={{ fontSize:11, fontWeight:700, color:C.sub, marginBottom:10 }}>目標スキル</div>
          <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
            {goalSkills.map(s=><Tag key={s.id} label={s.label} color={s.type==="ai"?C.accent:C.green}/>)}
          </div>
        </div>
      )}

      {/* Progress */}
      <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:14, padding:18, marginBottom:20, boxShadow:C.shadow }}>
        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8 }}>
          <span style={{ fontSize:13, color:C.sub }}>達成度</span>
          <span style={{ fontFamily:FONT_MONO, color:C.green, fontSize:13, fontWeight:600 }}>{doneCount}/{totalSteps} 完了</span>
        </div>
        <Bar value={progress} color={C.green} height={8}/>
      </div>

      <div style={{ display:"flex", flexDirection:"column", gap:14, marginBottom:28 }}>
        {(roadmap?.steps||[]).map((step,i)=>(
          <div key={i} style={{ background:C.surface, border:`1.5px solid ${step.done?C.green:C.border}`, borderLeft:`4px solid ${step.done?C.green:C.accent}`, borderRadius:14, padding:20, transition:"all 0.3s", boxShadow:C.shadow }}>
            <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:12, marginBottom:10 }}>
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <div style={{ width:28, height:28, borderRadius:"50%", background:step.done?C.green:C.accentL, color:step.done?"#fff":C.accent, display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:700, flexShrink:0 }}>{step.done?"✓":step.phase}</div>
                <div>
                  <div style={{ fontWeight:700, fontSize:15 }}>{step.title}</div>
                  <div style={{ color:C.muted, fontSize:12, marginTop:2 }}>{step.months} · {step.milestone}</div>
                </div>
              </div>
              <button onClick={()=>toggleStep(i)}
                style={{ flexShrink:0, padding:"6px 14px", borderRadius:8, border:`1.5px solid ${step.done?C.green:C.border}`, background:step.done?C.greenL:C.bg, color:step.done?C.green:C.sub, cursor:"pointer", fontSize:12, fontFamily:FONT_BODY, whiteSpace:"nowrap", fontWeight:600 }}>
                {step.done?"✓ 完了済み":"完了にする"}
              </button>
            </div>
            <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:10 }}>
              {(step.skills||[]).map((sk,j)=><Tag key={j} label={sk} color={C.accent}/>)}
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
              {(step.actions||[]).map((a,j)=>(
                <div key={j} style={{ fontSize:13, color:C.sub, paddingLeft:12, borderLeft:`2px solid ${C.border}` }}>▸ {a}</div>
              ))}
            </div>
            {step.doneAt && <div style={{ fontSize:11, color:C.green, marginTop:8, fontWeight:600 }}>✓ 完了: {new Date(step.doneAt).toLocaleDateString("ja-JP")}</div>}
          </div>
        ))}
      </div>

      <div style={{ display:"flex", gap:12 }}>
        <button onClick={()=>persist({}, "dashboard")}
          style={{ flex:1, padding:14, background:C.accent, border:"none", borderRadius:12, color:"#fff", fontWeight:700, fontSize:14, cursor:"pointer", fontFamily:FONT_BODY }}>
          💾 保存してダッシュボードへ
        </button>
        <button onClick={()=>setPage("goal-customize")}
          style={{ padding:"14px 18px", background:"transparent", border:`1px solid ${C.border}`, borderRadius:12, color:C.sub, cursor:"pointer", fontSize:13, fontFamily:FONT_BODY }}>
          ← スキルを変更
        </button>
      </div>
    </div>
  );

  // ── Dashboard ──────────────────────────────────────────────
  if (page === "dashboard") {
    const p = profile||{};
    const sm = p.skillMap||{};
    const drm = p.roadmap||roadmap;
    const goal = p.goal||selectedGoal;
    const radar = Array.isArray(p.aiSuggest?.radarData) ? p.aiSuggest.radarData : radarFromSkillMap(sm);
    const skillCount = Object.keys(sm).length;
    const ddone = drm ? drm.steps.filter(s=>s.done).length : 0;
    const dtotal = drm ? drm.steps.length : 0;
    const dprog = dtotal ? Math.round((ddone/dtotal)*100) : 0;
    const lastUpdate = p.updatedAt ? new Date(p.updatedAt).toLocaleDateString("ja-JP") : "—";
    const nextCheck = p.updatedAt ? new Date(new Date(p.updatedAt).getTime()+30*24*60*60*1000).toLocaleDateString("ja-JP") : "—";

    return shell(
      <div style={{ animation:"fadeUp 0.4s ease" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:28 }}>
          <div>
            <div style={{ fontSize:11, fontWeight:700, color:C.accent, letterSpacing:"0.1em", marginBottom:6 }}>DASHBOARD</div>
            <h1 style={{ fontSize:22, fontWeight:700 }}>マイキャリア</h1>
            <div style={{ color:C.muted, fontSize:12, marginTop:4 }}>最終更新: {lastUpdate}</div>
          </div>
          <button onClick={()=>{ setStep(1); setPage("skill-input"); }}
            style={{ padding:"10px 18px", background:C.accentL, border:`1px solid ${C.accent}44`, borderRadius:10, color:C.accent, cursor:"pointer", fontSize:13, fontFamily:FONT_BODY, fontWeight:600 }}>
            + 情報を更新
          </button>
        </div>

        {/* Profile bar */}
        {(p.currentJob || p.position) && (
          <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:12, padding:"12px 18px", marginBottom:20, display:"flex", flexWrap:"wrap", gap:12, alignItems:"center", boxShadow:C.shadow }}>
            {p.currentJob && <span style={{ fontSize:14, fontWeight:600 }}>{p.currentJob}</span>}
            {p.position && <span style={{ fontSize:12, color:C.sub, background:C.bg, padding:"3px 10px", borderRadius:20 }}>{p.position}</span>}
            {p.age && <span style={{ fontSize:12, color:C.sub }}>{p.age}歳</span>}
            {p.income && <span style={{ fontSize:12, color:C.sub }}>{p.income}</span>}
          </div>
        )}

        {/* Summary cards */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12, marginBottom:24 }}>
          {[
            { label:"登録スキル", value:skillCount, unit:"個", color:C.accent, bg:C.accentL },
            { label:"ロードマップ進捗", value:dprog, unit:"%", color:C.green, bg:C.greenL },
            { label:"次回チェック", value:nextCheck, unit:"", color:C.gold, bg:C.goldL, small:true },
          ].map(card=>(
            <div key={card.label} style={{ background:card.bg, border:`1px solid ${card.color}33`, borderRadius:14, padding:18 }}>
              <div style={{ color:card.color, fontSize:11, fontWeight:700, marginBottom:8 }}>{card.label}</div>
              <div style={{ fontFamily:card.small?FONT_BODY:FONT_MONO, fontSize:card.small?12:26, fontWeight:700, color:card.color }}>
                {card.value}<span style={{ fontSize:12, fontFamily:FONT_BODY, color:card.color, opacity:0.7 }}>{card.unit}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{ display:"flex", gap:4, background:C.surface, border:`1px solid ${C.border}`, borderRadius:12, padding:4, marginBottom:24 }}>
          {[["overview","📊 概要"],["roadmap","🗺️ ロードマップ"],["skills","🧩 スキル"]].map(([t,label])=>(
            <button key={t} onClick={()=>setActiveTab(t)}
              style={{ flex:1, padding:"8px 0", borderRadius:8, border:"none", background:activeTab===t?C.accentL:"transparent", color:activeTab===t?C.accent:C.muted, cursor:"pointer", fontSize:13, fontFamily:FONT_BODY, fontWeight:activeTab===t?600:400, transition:"all 0.2s" }}>
              {label}
            </button>
          ))}
        </div>

        {activeTab === "overview" && (
          <div>
            <div style={{ display:"flex", gap:20, flexWrap:"wrap", background:C.surface, border:`1px solid ${C.border}`, borderRadius:16, padding:24, marginBottom:20, boxShadow:C.shadow }}>
              <div style={{ display:"flex", justifyContent:"center" }}><RadarChart data={radar} size={190}/></div>
              <div style={{ flex:1, minWidth:180 }}>
                <div style={{ fontSize:11, fontWeight:700, color:C.gold, marginBottom:10 }}>スキルバランス</div>
                {radar.map(d=>(
                  <div key={d.label} style={{ marginBottom:8 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, color:C.muted, marginBottom:3 }}><span>{d.label}</span><span style={{ fontFamily:FONT_MONO }}>{d.value}</span></div>
                    <Bar value={d.value} color={C.accent} height={4}/>
                  </div>
                ))}
              </div>
            </div>

            {goal && (
              <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:14, padding:20, marginBottom:20, boxShadow:C.shadow }}>
                <div style={{ fontSize:11, fontWeight:700, color:C.gold, marginBottom:8 }}>現在の目標</div>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
                  <div>
                    <div style={{ fontSize:16, fontWeight:700 }}>{goal.title}</div>
                    <div style={{ color:C.muted, fontSize:12, marginTop:4 }}>{goal.type==="job"?"🎯 目標職種":"📚 取得スキル"}</div>
                  </div>
                  {drm && <div style={{ textAlign:"right" }}>
                    <div style={{ fontFamily:FONT_MONO, fontSize:22, fontWeight:700, color:C.green }}>{dprog}%</div>
                    <div style={{ color:C.muted, fontSize:11 }}>{ddone}/{dtotal}完了</div>
                  </div>}
                </div>
                {(p.goalSkills||goalSkills||[]).length > 0 && (
                  <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:10 }}>
                    {(p.goalSkills||goalSkills||[]).map(s=><Tag key={s.id} label={s.label} color={s.type==="ai"?C.accent:C.green}/>)}
                  </div>
                )}
                {drm && <Bar value={dprog} color={C.green} height={6}/>}
              </div>
            )}

            <div style={{ display:"flex", gap:10 }}>
              {drm && <button onClick={()=>setActiveTab("roadmap")} style={{ flex:1, padding:12, background:C.greenL, border:`1px solid ${C.green}44`, borderRadius:10, color:C.green, cursor:"pointer", fontSize:13, fontFamily:FONT_BODY, fontWeight:600 }}>🗺️ ロードマップを確認</button>}
              <button onClick={()=>setPage("ai-suggest")} style={{ flex:1, padding:12, background:C.goldL, border:`1px solid ${C.gold}44`, borderRadius:10, color:C.gold, cursor:"pointer", fontSize:13, fontFamily:FONT_BODY, fontWeight:600 }}>✨ 目標を変更する</button>
            </div>
          </div>
        )}

        {activeTab === "roadmap" && (
          <div>
            {drm ? (
              <>
                <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:12, padding:16, marginBottom:16, boxShadow:C.shadow }}>
                  <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
                    <span style={{ fontSize:13, color:C.sub }}>全体進捗</span>
                    <span style={{ fontFamily:FONT_MONO, color:C.green, fontSize:13, fontWeight:600 }}>{ddone}/{dtotal} 完了</span>
                  </div>
                  <Bar value={dprog} color={C.green} height={8}/>
                </div>
                {drm.steps.map((step,i)=>(
                  <div key={i} style={{ background:C.surface, border:`1.5px solid ${step.done?C.green:C.border}`, borderLeft:`4px solid ${step.done?C.green:C.accent}`, borderRadius:12, padding:18, marginBottom:10, transition:"all 0.3s", boxShadow:C.shadow }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                        <div style={{ width:24, height:24, borderRadius:"50%", background:step.done?C.green:C.accentL, color:step.done?"#fff":C.accent, display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:700, flexShrink:0 }}>{step.done?"✓":step.phase}</div>
                        <div>
                          <div style={{ fontWeight:600, fontSize:14 }}>{step.title}</div>
                          <div style={{ color:C.muted, fontSize:11 }}>{step.months}</div>
                        </div>
                      </div>
                      <button onClick={()=>toggleStep(i)}
                        style={{ padding:"5px 12px", borderRadius:7, border:`1.5px solid ${step.done?C.green:C.border}`, background:step.done?C.greenL:C.bg, color:step.done?C.green:C.sub, cursor:"pointer", fontSize:11, fontFamily:FONT_BODY, fontWeight:600 }}>
                        {step.done?"✓ 完了":"完了にする"}
                      </button>
                    </div>
                    <div style={{ color:C.muted, fontSize:12 }}>🏁 {step.milestone}</div>
                    {step.doneAt && <div style={{ fontSize:11, color:C.green, marginTop:6, fontWeight:600 }}>完了日: {new Date(step.doneAt).toLocaleDateString("ja-JP")}</div>}
                  </div>
                ))}
              </>
            ) : (
              <div style={{ textAlign:"center", padding:40, color:C.muted }}>
                <div style={{ fontSize:32, marginBottom:12 }}>🗺️</div>
                ロードマップがまだありません
                <div style={{ marginTop:16 }}>
                  <button onClick={()=>setPage("ai-suggest")} style={{ padding:"10px 20px", background:C.accent, border:"none", borderRadius:10, color:"#fff", cursor:"pointer", fontSize:13, fontFamily:FONT_BODY }}>目標を設定する</button>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "skills" && (
          <div>
            {skillCount === 0 ? (
              <div style={{ textAlign:"center", padding:40, color:C.muted }}>スキルが登録されていません</div>
            ) : (
              SKILL_CATS.map(cat=>{
                const mySkills = cat.skills.filter(s=>sm[s]);
                if (!mySkills.length) return null;
                return (
                  <div key={cat.label} style={{ marginBottom:20 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:10 }}>
                      <span>{cat.icon}</span>
                      <span style={{ fontSize:13, fontWeight:600, color:cat.color }}>{cat.label}</span>
                    </div>
                    {mySkills.map(skill=>(
                      <div key={skill} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", background:C.surface, border:`1px solid ${C.border}`, borderRadius:10, padding:"10px 14px", marginBottom:6, boxShadow:C.shadow }}>
                        <span style={{ fontSize:14 }}>{skill}</span>
                        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                          <div style={{ width:80 }}><Bar value={YEAR_TO_NUM[sm[skill]]||0} color={cat.color} height={4}/></div>
                          <span style={{ fontFamily:FONT_MONO, fontSize:11, color:C.muted, minWidth:60, textAlign:"right" }}>{sm[skill]}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })
            )}
            <button onClick={()=>{ setStep(1); setPage("skill-input"); }} style={{ width:"100%", marginTop:8, padding:14, background:C.accent, border:"none", borderRadius:12, color:"#fff", fontWeight:700, fontSize:14, cursor:"pointer", fontFamily:FONT_BODY }}>✏️ スキルを編集する</button>
          </div>
        )}
      </div>
    );
  }

  return null;
}
