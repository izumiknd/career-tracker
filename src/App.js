import { useState, useEffect, useRef } from "react";
import logoPathnote from './logo-pathnote.png';

// ── Design tokens (light, calm) ───────────────────────────────
const C = {
  bg:      "#F7F8FC",
  surface: "#FFFFFF",
  border:  "#E4E8F0",
  accent:  "#4361EE",
  accentL: "#EEF1FD",
  accentD: "#2D4ACC",
  teal:    "#0B9E8A",
  tealL:   "#E6F7F5",
  gold:    "#E8960C",
  goldL:   "#FEF6E4",
  green:   "#27A96C",
  greenL:  "#E8F7EF",
  red:     "#E5484D",
  redL:    "#FEF0F0",
  text:    "#1A1D2E",
  sub:     "#4A4F6A",
  muted:   "#9097B8",
  shadow:  "0 1px 8px rgba(0,0,0,0.07)",
  shadowM: "0 4px 20px rgba(0,0,0,0.10)",
};
const F = "'Noto Sans JP','Hiragino Sans',sans-serif";
const FM = "'DM Mono',monospace";

// ── Storage ───────────────────────────────────────────────────
const KEY = "pathnote_v3";
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } };
const save = (d) => localStorage.setItem(KEY, JSON.stringify(d));

// ── Groq API (streaming) ──────────────────────────────────────
async function callAIStream(messages, onChunk) {
  const apiKey = process.env.REACT_APP_GROQ_API_KEY;
  if (!apiKey) throw new Error("APIキーが設定されていません");
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
    body: JSON.stringify({ model: "llama-3.1-8b-instant", messages, temperature: 0.6, max_tokens: 600, stream: true }),
  });
  if (!res.ok) { const e = await res.json().catch(()=>({})); throw new Error(`API ${res.status}: ${e?.error?.message||res.statusText}`); }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let full = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value);
    const lines = chunk.split("\n").filter(l => l.startsWith("data: ") && l !== "data: [DONE]");
    for (const line of lines) {
      try {
        const json = JSON.parse(line.slice(6));
        const delta = json.choices?.[0]?.delta?.content || "";
        if (delta) { full += delta; onChunk(full); }
      } catch {}
    }
  }
  return full;
}

async function callAI(messages) {
  const apiKey = process.env.REACT_APP_GROQ_API_KEY;
  if (!apiKey) throw new Error("APIキーが設定されていません");
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
    body: JSON.stringify({ model: "llama-3.1-8b-instant", messages, temperature: 0.4, max_tokens: 1200 }),
  });
  if (!res.ok) { const e = await res.json().catch(()=>({})); throw new Error(`API ${res.status}: ${e?.error?.message||res.statusText}`); }
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

async function callAIJSON(messages) {
  const text = await callAI(messages);
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

// ── Small components ──────────────────────────────────────────
const Bar = ({ value, color = C.accent, height = 6 }) => (
  <div style={{ background: C.border, borderRadius: 99, height, overflow: "hidden" }}>
    <div style={{ width: `${Math.min(value,100)}%`, height: "100%", background: color, borderRadius: 99, transition: "width 0.8s ease" }} />
  </div>
);

const Badge = ({ label, color = C.accent }) => (
  <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20, background: `${color}18`, color, border: `1px solid ${color}33`, fontWeight: 600 }}>{label}</span>
);

const Card = ({ children, style = {} }) => (
  <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: 24, boxShadow: C.shadow, ...style }}>{children}</div>
);

const Btn = ({ children, onClick, variant = "primary", disabled = false, style = {} }) => {
  const styles = {
    primary: { background: C.accent, color: "#fff", border: "none" },
    secondary: { background: "transparent", color: C.sub, border: `1px solid ${C.border}` },
    teal: { background: C.teal, color: "#fff", border: "none" },
    ghost: { background: C.accentL, color: C.accent, border: `1px solid ${C.accent}33` },
  };
  return (
    <button onClick={onClick} disabled={disabled}
      style={{ padding: "11px 20px", borderRadius: 10, fontSize: 14, fontFamily: F, fontWeight: 600, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1, transition: "all 0.15s", ...styles[variant], ...style }}>
      {children}
    </button>
  );
};

// ── PHASE 1 DATA ───────────────────────────────────────────────
const INDUSTRIES = ["IT・通信","メーカー・製造","金融・保険","商社・流通","小売・サービス","医療・福祉","教育","建設・不動産","コンサルティング","広告・メディア","公務員・非営利","その他"];
const POSITIONS = ["一般社員・スタッフ","主任・リーダー","係長・課長補佐","課長・マネージャー","部長・シニアマネージャー","役員・経営者","フリーランス","学生・就活中","その他"];
const CHANGE_REASONS = ["年収アップ","キャリアアップ","職種・業界チェンジ","ワークライフバランス改善","人間関係","会社の将来性への不安","スキルアップ・成長機会","働き方の変化（リモート等）","その他"];
const SKILL_CATS = [
  { label:"コミュニケーション", color:"#4361EE", icon:"💬", skills:["プレゼンテーション","交渉・説得","ヒアリング","文章作成","語学（英語）","ファシリテーション","顧客対応"] },
  { label:"思考・分析", color:"#7B2FBE", icon:"🧠", skills:["論理的思考","データ分析","課題発見","企画立案","リサーチ","数値管理","問題解決"] },
  { label:"マネジメント", color:"#E8960C", icon:"👥", skills:["チームマネジメント","プロジェクト管理","目標設定","育成・コーチング","採用","予算管理","リスク管理"] },
  { label:"クリエイティブ", color:"#E91E8C", icon:"🎨", skills:["デザイン思考","グラフィック","映像・動画","コピーライティング","SNS運用","ブランディング","写真・撮影"] },
  { label:"営業・マーケ", color:"#FF6B35", icon:"📈", skills:["営業","マーケティング","集客・広告","顧客管理(CRM)","市場調査","SNSマーケ","コンテンツ制作"] },
  { label:"専門・技術", color:"#27A96C", icon:"🔧", skills:["IT・プログラミング","財務・会計","法務","医療・介護","教育・研修","建築・設計","製造・品質管理"] },
  { label:"ビジネス基礎", color:"#6B8CFF", icon:"💼", skills:["Excel・Word","資料作成","スケジュール管理","議事録作成","事務処理","報連相","業務改善"] },
];
const YEAR_OPTS = ["半年未満","半年〜1年","1〜3年","3〜5年","5年以上"];
const YEAR_NUM = { "半年未満":10,"半年〜1年":25,"1〜3年":50,"3〜5年":75,"5年以上":95 };

// ── CONSULTING SYSTEM PROMPT ──────────────────────────────────
const SYSTEM_PROMPT = `あなたは国家資格を持つ経験豊富なキャリアコンサルタントです。転職を考えているクライアントと1対1のカウンセリングセッションを行っています。

## あなたの役割
クライアントが自分でも気づいていない「強み・価値観・キャリアの軸」を引き出すこと。評価や判断は一切せず、傾聴と質問によって自己理解を深めるサポートをします。

## カウンセリングの進め方
セッションは以下の流れで自然に進めてください：

**前半（1〜3往復）：現状と過去の経験を聞く**
- 現在の仕事でやりがいを感じる瞬間、逆につらいと感じる場面
- これまでのキャリアで一番充実していた時期・プロジェクト
- 転職を考え始めたきっかけや背景

**中盤（4〜6往復）：価値観・強みを深掘りする**
- 「なぜそれが嬉しかったのか」「なぜそれがつらかったのか」という感情の背景
- クライアントが大切にしていること・譲れないこと
- 周囲から褒められること・自然と頼まれること

**後半（7〜8往復）：気づきを整理する**
- ここまでの対話で見えてきたパターンや強みをクライアントにフィードバック
- 「〜という言葉を何度かおっしゃっていましたね」などでミラーリングしてまとめる
- 転職先に求めるものを一緒に言語化する

## 会話のルール（必ず守ること）
- **1メッセージにつき質問は1つだけ**（絶対に複数の質問をしない）
- **必ず共感・承認から始めてから次の質問へ**（例：「それは大変でしたね」「素晴らしい経験ですね」）
- **クライアントが使った言葉をそのまま使う**（ミラーリング）
- **「なぜ？」より「どんな気持ちでしたか？」「具体的にはどんな場面でしたか？」を使う**
- **絶対に評価・判断・アドバイスをしない**（「〜したほうがいいですよ」はNG）
- **短く、温かく、自然な口語で話す**（長い文章は避ける）
- **クライアントの答えを深掘りしてから次のテーマへ移る**

## 文体
- 敬語だが親しみやすく（「〜ですね」「〜でしたか」「〜なんですね」）
- 1メッセージは3〜5文程度（長すぎない）
- 箇条書きは使わず、自然な会話文で`;


// ══════════════════════════════════════════════════════════════
export default function App() {
  // page: home | phase1 | phase2 | report | dashboard
  const [page, setPage] = useState("loading");
  const [data, setData] = useState(null);

  // Phase1 state
  const [p1step, setP1step] = useState(1); // 1=基本情報 2=職歴 3=スキル
  const [basic, setBasic] = useState({ name:"", age:"", industry:"", position:"", changeReason:[], changeReasonOther:"" });
  const [careers, setCareers] = useState([{ id:1, company:"", period:"", role:"", achievements:"" }]);
  const [skillMap, setSkillMap] = useState({});

  // Phase2 state
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [aiTyping, setAiTyping] = useState(false);
  const [sessionDone, setSessionDone] = useState(false);
  const [report, setReport] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);

  const chatEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    const d = load();
    if (d) { setData(d); setPage("dashboard"); } else { setPage("home"); }
  }, []);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const persist = (updates) => {
    const nd = { ...(data||{}), ...updates, savedAt: new Date().toISOString() };
    setData(nd); save(nd);
  };

  // ── Phase1 helpers ─────────────────────────────────────────
  const toggleReason = (r) => {
    setBasic(prev => ({
      ...prev,
      changeReason: prev.changeReason.includes(r) ? prev.changeReason.filter(x=>x!==r) : [...prev.changeReason, r]
    }));
  };
  const addCareer = () => setCareers(prev => [...prev, { id: Date.now(), company:"", period:"", role:"", achievements:"" }]);
  const removeCareer = (id) => setCareers(prev => prev.filter(c=>c.id!==id));
  const updateCareer = (id, field, val) => setCareers(prev => prev.map(c=>c.id===id?{...c,[field]:val}:c));
  const toggleSkill = (skill) => setSkillMap(prev => { const n={...prev}; if(n[skill]) delete n[skill]; else n[skill]="半年未満"; return n; });
  const setYears = (skill, y) => setSkillMap(prev => ({...prev,[skill]:y}));

  const buildProfileSummary = () => `
【クライアント情報】
- 名前: ${basic.name || "未入力"}
- 年齢: ${basic.age ? basic.age + "歳" : "未入力"}
- 現在の業界: ${basic.industry || "未入力"}
- 現在のポジション: ${basic.position || "未入力"}
- 転職を考えている理由: ${basic.changeReason.join("、") || "未入力"}
- 職歴:
${careers.filter(c=>c.company||c.role).map((c,i)=>`  ${i+1}. ${c.company}（${c.period}）／ ${c.role}
     実績・業務: ${c.achievements||"未記入"}`).join("\n") || "  未入力"}
- 保有スキル: ${Object.keys(skillMap).join("、") || "未入力"}

このクライアントの情報を踏まえ、最初の一言は温かく自然な挨拶から始めてください。クライアントの職歴や転職理由に触れながら、まず「今の仕事でどんな場面が一番充実していますか？」という方向で会話を始めてください。`;

  const completePhase1 = () => {
    persist({ basic, careers, skillMap, phase1Done: true });
    setPage("phase2");
    startConsulting();
  };

  // ── Phase2: AI consulting ──────────────────────────────────
  const startConsulting = async () => {
    setAiTyping(true);
    // ストリーミング用の仮メッセージを追加
    setMessages([{ role: "assistant", content: "" }]);
    try {
      const initMessages = [
        { role: "system", content: SYSTEM_PROMPT + buildProfileSummary() },
        { role: "user", content: "よろしくお願いします。" },
      ];
      await callAIStream(initMessages, (partial) => {
        setMessages([{ role: "assistant", content: partial }]);
      });
    } catch(e) {
      setMessages([{ role: "assistant", content: "申し訳ありません。接続エラーが発生しました。再度お試しください。" }]);
    }
    setAiTyping(false);
  };

  const sendMessage = async () => {
    if (!input.trim() || aiTyping) return;
    const userMsg = { role: "user", content: input.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setAiTyping(true);

    // ストリーミング用の仮メッセージを追加
    const streamingMessages = [...newMessages, { role: "assistant", content: "" }];
    setMessages(streamingMessages);

    try {
      const userTurns = newMessages.filter(m=>m.role==="user").length;
      const isNearEnd = userTurns >= 7 && !sessionDone;

      const endingHint = isNearEnd
        ? "\n\n【セッション終盤のヒント】そろそろ対話のまとめに入ってください。これまでの会話で見えてきたクライアントの強み・価値観・キャリアの軸をフィードバックし、「ここまでの対話をもとにレポートを作成することができます」と自然に伝えてください。"
        : "";

      const apiMessages = [
        { role: "system", content: SYSTEM_PROMPT + buildProfileSummary() + endingHint },
        ...newMessages,
      ];

      let finalReply = "";
      await callAIStream(apiMessages, (partial) => {
        finalReply = partial;
        setMessages([...newMessages, { role: "assistant", content: partial }]);
      });

      if (isNearEnd) setSessionDone(true);
      persist({ messages: [...newMessages, { role: "assistant", content: finalReply }] });
    } catch(e) {
      setMessages([...newMessages, { role: "assistant", content: "申し訳ありません。エラーが発生しました。もう一度送信してください。" }]);
    }
    setAiTyping(false);
  };

  const generateReport = async () => {
    setReportLoading(true);
    try {
      const conversation = messages.map(m=>`${m.role==="user"?"ユーザー":"AI"}: ${m.content}`).join("\n");
      const profileSummary = `職歴: ${careers.map(c=>`${c.company} ${c.role}`).join("、")}、スキル: ${Object.keys(skillMap).join("、")}`;

      const prompt = `以下はキャリアコンサルティングの対話記録です。この内容をもとに、ユーザーの自己理解レポートを作成してください。JSONのみで返答してください。

プロフィール: ${profileSummary}

対話記録:
${conversation}

以下のJSON形式のみで返答（説明文不要）:
{"strengths":["強み1","強み2","強み3"],"softSkills":["ソフトスキル1","ソフトスキル2","ソフトスキル3"],"values":["価値観1","価値観2","価値観3"],"careerAxis":"キャリアの軸（2〜3文）","selfPR":"自己PR文のベース（150文字程度）","nextSteps":["次のアクション1","次のアクション2","次のアクション3"],"aiComment":"全体的な所感・応援メッセージ（2〜3文）"}`;

      const result = await callAIJSON([{ role: "user", content: prompt }]);
      setReport(result);
      persist({ report: result, phase2Done: true, messages });
      setPage("report");
    } catch(e) {
      alert(`レポート生成エラー: ${e.message}`);
    }
    setReportLoading(false);
  };

  // ── Shared input style ─────────────────────────────────────
  const IS = { width:"100%", padding:"10px 14px", background:C.bg, border:`1px solid ${C.border}`, borderRadius:10, color:C.text, fontSize:14, fontFamily:F, outline:"none" };

  // ── Shell ──────────────────────────────────────────────────
  const shell = (children, showNav = true) => (
    <div style={{ minHeight:"100vh", background:C.bg, color:C.text, fontFamily:F }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap');
        @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes blink{0%,100%{opacity:1}50%{opacity:0}}
        *{box-sizing:border-box;margin:0;padding:0}
        input:focus,select:focus,textarea:focus{outline:none;border-color:${C.accent}!important;box-shadow:0 0 0 3px ${C.accentL}!important}
        button:not(:disabled):hover{opacity:0.85}
        textarea{resize:vertical}
        ::-webkit-scrollbar{width:4px}
        ::-webkit-scrollbar-thumb{background:${C.border};border-radius:2px}
      `}</style>
      {showNav && (
        <nav style={{ background:C.surface, borderBottom:`1px solid ${C.border}`, padding:"0 24px", display:"flex", alignItems:"center", justifyContent:"space-between", height:58, position:"sticky", top:0, zIndex:100, boxShadow:C.shadow }}>
          <div style={{ display:"flex", alignItems:"center", gap:10, cursor:"pointer" }} onClick={()=>setPage(data?"dashboard":"home")}>
            <img src={logoPathnote} alt="PathNote" style={{ width:30, height:30, objectFit:"contain" }} />
            <span style={{ fontWeight:700, fontSize:16, color:C.text, letterSpacing:"-0.02em" }}>PathNote</span>
          </div>
          <div style={{ display:"flex", gap:8 }}>
            {data && <Btn variant="ghost" onClick={()=>setPage("dashboard")} style={{ padding:"7px 16px", fontSize:13 }}>マイページ</Btn>}
          </div>
        </nav>
      )}
      {children}
    </div>
  );

  // ════════════════════════════════════════════════════════════
  // LOADING
  if (page === "loading") return shell(<div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"80vh", gap:12, color:C.muted }}><div style={{ width:20, height:20, border:`2px solid ${C.border}`, borderTopColor:C.accent, borderRadius:"50%", animation:"spin .8s linear infinite" }}/>読み込み中...</div>);

  // ════════════════════════════════════════════════════════════
  // HOME
  if (page === "home") return shell(
    <div>
      {/* Hero */}
      <div style={{ background:`linear-gradient(135deg, #F0F4FF 0%, #E8F7F5 100%)`, padding:"72px 24px 60px", textAlign:"center" }}>
        <div style={{ maxWidth:640, margin:"0 auto" }}>
          <Badge label="転職希望者向けキャリア自己理解サービス" color={C.teal} />
          <h1 style={{ fontSize:36, fontWeight:800, lineHeight:1.3, marginTop:20, marginBottom:16, color:C.text, letterSpacing:"-0.03em" }}>
            自分を知ることが、<br/>転職の第一歩。
          </h1>
          <p style={{ fontSize:16, color:C.sub, lineHeight:1.9, marginBottom:36 }}>
            スキルの棚卸しとAIキャリアコンサルティングを通じて、<br/>
            あなたの強み・価値観・キャリアの軸を言語化します。
          </p>
          <Btn onClick={()=>setPage("phase1")} style={{ padding:"16px 40px", fontSize:16, borderRadius:12 }}>
            無料で始める →
          </Btn>
        </div>
      </div>

      {/* Steps */}
      <div style={{ maxWidth:760, margin:"0 auto", padding:"60px 24px" }}>
        <h2 style={{ fontSize:22, fontWeight:700, textAlign:"center", marginBottom:40 }}>PathNoteでできること</h2>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))", gap:20 }}>
          {[
            { icon:"📋", title:"スキルの棚卸し", desc:"職歴・スキル・実績を整理。客観的な自分の強みを把握します。", color:C.accent },
            { icon:"💬", title:"AIコンサルティング", desc:"AIが対話を通じてソフトスキルや価値観を引き出します。", color:C.teal },
            { icon:"📄", title:"自己理解レポート", desc:"対話の内容から強み・価値観・自己PR文のベースを生成。", color:C.gold },
            { icon:"🚀", title:"転職書類への活用", desc:"（近日公開）履歴書・職務経歴書の自動生成機能。", color:C.muted },
          ].map(s=>(
            <Card key={s.title} style={{ padding:20 }}>
              <div style={{ fontSize:28, marginBottom:12 }}>{s.icon}</div>
              <div style={{ fontWeight:700, fontSize:15, marginBottom:8, color:s.color }}>{s.title}</div>
              <div style={{ fontSize:13, color:C.sub, lineHeight:1.7 }}>{s.desc}</div>
            </Card>
          ))}
        </div>

        <div style={{ textAlign:"center", marginTop:48 }}>
          <Btn onClick={()=>setPage("phase1")} style={{ padding:"14px 36px", fontSize:15, borderRadius:12 }}>
            スキルの棚卸しを始める
          </Btn>
        </div>
      </div>
    </div>
  );

  // ════════════════════════════════════════════════════════════
  // PHASE 1: スキル棚卸し
  if (page === "phase1") return shell(
    <div style={{ maxWidth:720, margin:"0 auto", padding:"32px 20px", animation:"fadeUp 0.4s ease" }}>
      {/* Progress */}
      <div style={{ marginBottom:32 }}>
        <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, color:C.muted, marginBottom:8 }}>
          <span>PHASE 1：スキルの棚卸し</span>
          <span>{p1step}/4</span>
        </div>
        <div style={{ background:C.border, borderRadius:99, height:4 }}>
          <div style={{ width:`${(p1step/4)*100}%`, height:"100%", background:C.accent, borderRadius:99, transition:"width 0.4s ease" }}/>
        </div>
        <div style={{ display:"flex", gap:0, marginTop:10 }}>
          {[["1","基本情報"],["2","職務経歴"],["3","スキル"],["4","確認"]].map(([n,label],i)=>(
            <div key={n} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:4 }}>
              <div style={{ width:24, height:24, borderRadius:"50%", background:p1step>i?C.accent:p1step===i+1?C.accent:C.border, color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:700 }}>{p1step>i?"✓":n}</div>
              <span style={{ fontSize:11, color:p1step===i+1?C.accent:C.muted }}>{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Step 1: 基本情報 */}
      {p1step === 1 && (
        <div>
          <h2 style={{ fontSize:22, fontWeight:700, marginBottom:6 }}>基本情報</h2>
          <p style={{ color:C.sub, fontSize:14, marginBottom:24 }}>あなたの現在の状況を教えてください</p>

          <div style={{ display:"flex", flexDirection:"column", gap:18 }}>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
              <div>
                <label style={{ display:"block", fontSize:12, fontWeight:600, color:C.sub, marginBottom:6 }}>お名前（ニックネームでも）</label>
                <input value={basic.name} onChange={e=>setBasic(p=>({...p,name:e.target.value}))} placeholder="例：田中 太郎" style={IS}/>
              </div>
              <div>
                <label style={{ display:"block", fontSize:12, fontWeight:600, color:C.sub, marginBottom:6 }}>年齢</label>
                <input value={basic.age} onChange={e=>setBasic(p=>({...p,age:e.target.value}))} placeholder="例：32" type="number" style={IS}/>
              </div>
            </div>
            <div>
              <label style={{ display:"block", fontSize:12, fontWeight:600, color:C.sub, marginBottom:6 }}>現在の業界</label>
              <select value={basic.industry} onChange={e=>setBasic(p=>({...p,industry:e.target.value}))} style={{...IS,cursor:"pointer"}}>
                <option value="">選択してください</option>
                {INDUSTRIES.map(i=><option key={i} value={i}>{i}</option>)}
              </select>
            </div>
            <div>
              <label style={{ display:"block", fontSize:12, fontWeight:600, color:C.sub, marginBottom:6 }}>現在のポジション</label>
              <select value={basic.position} onChange={e=>setBasic(p=>({...p,position:e.target.value}))} style={{...IS,cursor:"pointer"}}>
                <option value="">選択してください</option>
                {POSITIONS.map(p=><option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label style={{ display:"block", fontSize:12, fontWeight:600, color:C.sub, marginBottom:8 }}>転職を考えている理由（複数選択可）</label>
              <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
                {CHANGE_REASONS.map(r=>{
                  const sel = basic.changeReason.includes(r);
                  return (
                    <div key={r} onClick={()=>toggleReason(r)}
                      style={{ padding:"7px 14px", borderRadius:20, border:`1.5px solid ${sel?C.accent:C.border}`, background:sel?C.accentL:C.surface, color:sel?C.accent:C.sub, fontSize:13, cursor:"pointer", fontWeight:sel?600:400, transition:"all 0.15s" }}>
                      {r}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div style={{ marginTop:32 }}>
            <Btn onClick={()=>setP1step(2)} style={{ width:"100%" }}>次へ：職務経歴 →</Btn>
          </div>
        </div>
      )}

      {/* Step 2: 職務経歴 */}
      {p1step === 2 && (
        <div>
          <h2 style={{ fontSize:22, fontWeight:700, marginBottom:6 }}>職務経歴</h2>
          <p style={{ color:C.sub, fontSize:14, marginBottom:12 }}>これまでの職歴を入力してください（直近から）</p>
          <div style={{ background:C.accentL, border:`1px solid ${C.accent}33`, borderRadius:10, padding:"10px 16px", marginBottom:20, fontSize:13, color:C.accent, display:"flex", alignItems:"center", gap:8 }}>
            <span>💡</span>
            <span>実績・担当業務を詳しく入力するほど、AIのスキル解析と提案の精度が上がります</span>
          </div>

          <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
            {careers.map((c,i)=>(
              <Card key={c.id} style={{ padding:20 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
                  <span style={{ fontSize:13, fontWeight:700, color:C.accent }}>職歴 {i+1}</span>
                  {careers.length > 1 && (
                    <button onClick={()=>removeCareer(c.id)} style={{ background:"none", border:"none", color:C.muted, cursor:"pointer", fontSize:18 }}>×</button>
                  )}
                </div>
                <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                    <div>
                      <label style={{ display:"block", fontSize:11, fontWeight:600, color:C.muted, marginBottom:5 }}>会社名</label>
                      <input value={c.company} onChange={e=>updateCareer(c.id,"company",e.target.value)} placeholder="例：株式会社〇〇" style={IS}/>
                    </div>
                    <div>
                      <label style={{ display:"block", fontSize:11, fontWeight:600, color:C.muted, marginBottom:5 }}>在籍期間</label>
                      <input value={c.period} onChange={e=>updateCareer(c.id,"period",e.target.value)} placeholder="例：2019年4月〜2023年3月" style={IS}/>
                    </div>
                  </div>
                  <div>
                    <label style={{ display:"block", fontSize:11, fontWeight:600, color:C.muted, marginBottom:5 }}>職種・役割</label>
                    <input value={c.role} onChange={e=>updateCareer(c.id,"role",e.target.value)} placeholder="例：営業マネージャー、フロントエンドエンジニアなど" style={IS}/>
                  </div>
                  <div>
                    <label style={{ display:"block", fontSize:11, fontWeight:600, color:C.muted, marginBottom:5 }}>主な実績・担当業務</label>
                    <textarea value={c.achievements} onChange={e=>updateCareer(c.id,"achievements",e.target.value)}
                      placeholder="例：10名のチームをマネジメントし、売上前年比120%を達成。新規顧客開拓で年間50件の商談を担当。"
                      style={{...IS, minHeight:80, lineHeight:1.7}}/>
                  </div>
                </div>
              </Card>
            ))}
          </div>

          <button onClick={addCareer} style={{ width:"100%", padding:"12px", background:"transparent", border:`1.5px dashed ${C.border}`, borderRadius:12, color:C.muted, cursor:"pointer", fontSize:14, fontFamily:F, marginTop:12 }}>
            + 職歴を追加する
          </button>

          <div style={{ display:"flex", gap:12, marginTop:28 }}>
            <Btn variant="secondary" onClick={()=>setP1step(1)} style={{ flex:1 }}>← 戻る</Btn>
            <Btn onClick={()=>setP1step(3)} style={{ flex:2 }}>次へ：スキル →</Btn>
          </div>
        </div>
      )}

      {/* Step 3: スキル */}
      {p1step === 3 && (
        <div>
          <h2 style={{ fontSize:22, fontWeight:700, marginBottom:6 }}>スキルの棚卸し</h2>
          <p style={{ color:C.sub, fontSize:14, marginBottom:6 }}>経験・得意なことをすべて選んでください</p>
          <div style={{ color:C.accent, fontFamily:FM, fontSize:12, marginBottom:24, fontWeight:600 }}>{Object.keys(skillMap).length} 個選択中</div>

          {SKILL_CATS.map(cat=>(
            <div key={cat.label} style={{ marginBottom:24 }}>
              <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:10 }}>
                <span style={{ fontSize:15 }}>{cat.icon}</span>
                <span style={{ fontSize:13, fontWeight:700, color:cat.color }}>{cat.label}</span>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(152px,1fr))", gap:8 }}>
                {cat.skills.map(skill=>{
                  const sel = !!skillMap[skill];
                  return (
                    <div key={skill} style={{ border:`1.5px solid ${sel?cat.color:C.border}`, background:sel?`${cat.color}0D`:C.surface, borderRadius:10, padding:"10px 12px", transition:"all 0.15s", boxShadow:sel?`0 2px 8px ${cat.color}20`:"none" }}>
                      <div onClick={()=>toggleSkill(skill)} style={{ display:"flex", alignItems:"center", gap:8, cursor:"pointer", marginBottom:sel?8:0 }}>
                        <div style={{ width:16, height:16, borderRadius:4, border:`2px solid ${sel?cat.color:C.border}`, background:sel?cat.color:"transparent", display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, color:"#fff", flexShrink:0 }}>{sel?"✓":""}</div>
                        <span style={{ fontSize:13, color:sel?C.text:C.sub }}>{skill}</span>
                      </div>
                      {sel && (
                        <select value={skillMap[skill]} onChange={e=>setYears(skill,e.target.value)} style={{...IS,padding:"4px 8px",fontSize:11,cursor:"pointer"}}>
                          {YEAR_OPTS.map(y=><option key={y} value={y}>{y}</option>)}
                        </select>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          <div style={{ display:"flex", gap:12, marginTop:8 }}>
            <Btn variant="secondary" onClick={()=>setP1step(2)} style={{ flex:1 }}>← 戻る</Btn>
            <Btn onClick={()=>setP1step(4)} style={{ flex:2 }}>
              登録内容を確認する →
            </Btn>
          </div>
        </div>
      )}
      {/* Step 4: 確認 */}
      {p1step === 4 && (
        <div>
          <h2 style={{ fontSize:22, fontWeight:700, marginBottom:6 }}>登録内容の確認</h2>
          <p style={{ color:C.sub, fontSize:14, marginBottom:24 }}>内容を確認して、問題なければAIコンサルティングへ進みましょう</p>

          {/* 基本情報確認 */}
          <Card style={{ marginBottom:16, padding:20 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
              <div style={{ fontSize:13, fontWeight:700, color:C.accent }}>基本情報</div>
              <button onClick={()=>setP1step(1)} style={{ background:"none", border:"none", color:C.muted, cursor:"pointer", fontSize:12, textDecoration:"underline" }}>編集</button>
            </div>
            <div style={{ display:"flex", flexWrap:"wrap", gap:10 }}>
              {[
                { label:"名前", value:basic.name||"未入力" },
                { label:"年齢", value:basic.age?`${basic.age}歳`:"未入力" },
                { label:"業界", value:basic.industry||"未入力" },
                { label:"ポジション", value:basic.position||"未入力" },
              ].map(item=>(
                <div key={item.label} style={{ background:C.bg, borderRadius:8, padding:"8px 14px", minWidth:100 }}>
                  <div style={{ fontSize:10, color:C.muted, marginBottom:2 }}>{item.label}</div>
                  <div style={{ fontSize:13, fontWeight:600, color:C.text }}>{item.value}</div>
                </div>
              ))}
            </div>
            {basic.changeReason.length > 0 && (
              <div style={{ marginTop:12 }}>
                <div style={{ fontSize:11, color:C.muted, marginBottom:6 }}>転職理由</div>
                <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                  {basic.changeReason.map(r=>(
                    <span key={r} style={{ fontSize:12, padding:"3px 10px", borderRadius:20, background:C.accentL, color:C.accent, fontWeight:600 }}>{r}</span>
                  ))}
                </div>
              </div>
            )}
          </Card>

          {/* 職務経歴確認 */}
          <Card style={{ marginBottom:16, padding:20 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
              <div style={{ fontSize:13, fontWeight:700, color:C.accent }}>職務経歴</div>
              <button onClick={()=>setP1step(2)} style={{ background:"none", border:"none", color:C.muted, cursor:"pointer", fontSize:12, textDecoration:"underline" }}>編集</button>
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
              {careers.filter(c=>c.company||c.role).map((c,i)=>(
                <div key={c.id} style={{ borderLeft:`3px solid ${C.accent}`, paddingLeft:12 }}>
                  <div style={{ fontWeight:600, fontSize:14, color:C.text }}>{c.company||"会社名未入力"}</div>
                  <div style={{ fontSize:12, color:C.muted, marginTop:2 }}>{c.period} ／ {c.role}</div>
                  {c.achievements && <div style={{ fontSize:12, color:C.sub, marginTop:4, lineHeight:1.6 }}>{c.achievements}</div>}
                </div>
              ))}
              {careers.every(c=>!c.company&&!c.role) && <div style={{ fontSize:13, color:C.muted }}>未入力</div>}
            </div>
          </Card>

          {/* スキル確認 */}
          <Card style={{ marginBottom:24, padding:20 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
              <div style={{ fontSize:13, fontWeight:700, color:C.accent }}>登録スキル（{Object.keys(skillMap).length}個）</div>
              <button onClick={()=>setP1step(3)} style={{ background:"none", border:"none", color:C.muted, cursor:"pointer", fontSize:12, textDecoration:"underline" }}>編集</button>
            </div>
            {Object.keys(skillMap).length === 0 ? (
              <div style={{ fontSize:13, color:C.muted }}>未選択</div>
            ) : (
              SKILL_CATS.map(cat=>{
                const mySkills = cat.skills.filter(s=>skillMap[s]);
                if (!mySkills.length) return null;
                return (
                  <div key={cat.label} style={{ marginBottom:14 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:8 }}>
                      <span>{cat.icon}</span>
                      <span style={{ fontSize:12, fontWeight:700, color:cat.color }}>{cat.label}</span>
                    </div>
                    <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                      {mySkills.map(skill=>(
                        <div key={skill}>
                          <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, color:C.sub, marginBottom:3 }}>
                            <span>{skill}</span>
                            <span style={{ fontFamily:FM, fontSize:11, color:C.muted }}>{skillMap[skill]}</span>
                          </div>
                          <div style={{ background:C.border, borderRadius:99, height:5, overflow:"hidden" }}>
                            <div style={{ width:`${YEAR_NUM[skillMap[skill]]||0}%`, height:"100%", background:cat.color, borderRadius:99 }}/>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </Card>

          <div style={{ background:C.tealL, border:`1px solid ${C.teal}33`, borderRadius:12, padding:"16px 20px", marginBottom:20, fontSize:14, color:C.teal, lineHeight:1.7 }}>
            <div style={{ fontWeight:700, marginBottom:4 }}>👩‍💼 次はAIキャリアコンサルティングへ</div>
            <div style={{ fontSize:13 }}>AIコンサルタントがあなたに質問しながら、言葉にしにくいソフトスキルや価値観を一緒に引き出します。対話は5〜8往復程度です。</div>
          </div>

          <div style={{ display:"flex", gap:12 }}>
            <Btn variant="secondary" onClick={()=>setP1step(3)} style={{ flex:1 }}>← 戻る</Btn>
            <Btn variant="teal" onClick={completePhase1} style={{ flex:2 }}>
              💬 AIコンサルティングへ進む →
            </Btn>
          </div>
        </div>
      )}
    </div>
  );
  if (page === "phase2") return shell(
    <div style={{ display:"flex", flexDirection:"column", height:"calc(100vh - 58px)" }}>
      {/* Header */}
      <div style={{ background:C.surface, borderBottom:`1px solid ${C.border}`, padding:"14px 24px", display:"flex", alignItems:"center", justifyContent:"space-between", flexShrink:0 }}>
        <div>
          <div style={{ fontSize:13, fontWeight:700, color:C.teal }}>PHASE 2：AIキャリアコンサルティング</div>
          <div style={{ fontSize:12, color:C.muted, marginTop:2 }}>あなたの強み・価値観を引き出す対話セッション</div>
        </div>
        {sessionDone && (
          <Btn variant="teal" onClick={generateReport} disabled={reportLoading} style={{ padding:"8px 18px", fontSize:13 }}>
            {reportLoading ? "生成中..." : "📄 レポートを作成"}
          </Btn>
        )}
      </div>

      {/* Chat area */}
      <div style={{ flex:1, overflowY:"auto", padding:"24px 20px", maxWidth:720, width:"100%", margin:"0 auto", display:"flex", flexDirection:"column", gap:16 }}>
        {messages.length === 0 && (
          <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100%", color:C.muted, fontSize:14 }}>
            <div style={{ width:20, height:20, border:`2px solid ${C.border}`, borderTopColor:C.teal, borderRadius:"50%", animation:"spin .8s linear infinite", marginRight:10 }}/>
            AIが準備中です...
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} style={{ display:"flex", flexDirection:msg.role==="user"?"row-reverse":"row", gap:10, alignItems:"flex-end" }}>
            {msg.role === "assistant" && (
              <div style={{ width:36, height:36, borderRadius:"50%", background:`linear-gradient(135deg,${C.teal},#0B7A6A)`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, flexShrink:0, boxShadow:`0 2px 8px ${C.teal}44` }}>👩‍💼</div>
            )}
            <div style={{
              maxWidth:"72%", padding:"13px 16px", borderRadius:msg.role==="user"?"16px 16px 4px 16px":"16px 16px 16px 4px",
              background:msg.role==="user"?C.accent:C.surface,
              color:msg.role==="user"?"#fff":C.text,
              fontSize:14, lineHeight:1.8, boxShadow:C.shadow,
              border:msg.role==="user"?"none":`1px solid ${C.border}`,
              whiteSpace:"pre-wrap",
            }}>
              {msg.content}
            </div>
          </div>
        ))}

        {aiTyping && messages[messages.length-1]?.content === "" && (
          <div style={{ display:"flex", gap:10, alignItems:"flex-end" }}>
            <div style={{ width:36, height:36, borderRadius:"50%", background:`linear-gradient(135deg,${C.teal},#0B7A6A)`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, flexShrink:0, boxShadow:`0 2px 8px ${C.teal}44` }}>👩‍💼</div>
            <div style={{ padding:"13px 18px", borderRadius:"16px 16px 16px 4px", background:C.surface, border:`1px solid ${C.border}`, boxShadow:C.shadow, display:"flex", gap:4, alignItems:"center" }}>
              {[0,1,2].map(i=><div key={i} style={{ width:7, height:7, borderRadius:"50%", background:C.muted, animation:`blink 1.2s ${i*0.3}s infinite` }}/>)}
            </div>
          </div>
        )}

        <div ref={chatEndRef}/>
      </div>

      {/* Input area */}
      <div style={{ background:C.surface, borderTop:`1px solid ${C.border}`, padding:"16px 20px", flexShrink:0 }}>
        <div style={{ maxWidth:720, margin:"0 auto", display:"flex", gap:10, alignItems:"flex-end" }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={e=>setInput(e.target.value)}
            onKeyDown={e=>{ if(e.key==="Enter" && (e.ctrlKey||e.metaKey)) { e.preventDefault(); sendMessage(); } }}
            placeholder="メッセージを入力...（Ctrl+Enterで送信）"
            disabled={aiTyping}
            style={{ ...IS, flex:1, minHeight:48, maxHeight:120, lineHeight:1.6, resize:"none", borderRadius:12, padding:"12px 16px" }}
          />
          <button onClick={sendMessage} disabled={aiTyping||!input.trim()}
            style={{ width:48, height:48, borderRadius:12, background:input.trim()&&!aiTyping?C.teal:C.border, border:"none", color:"#fff", fontSize:20, cursor:input.trim()&&!aiTyping?"pointer":"not-allowed", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center", transition:"all 0.15s" }}>
            ↑
          </button>
        </div>
        {sessionDone && (
          <div style={{ maxWidth:720, margin:"12px auto 0", padding:"10px 16px", background:C.tealL, border:`1px solid ${C.teal}44`, borderRadius:10, fontSize:13, color:C.teal, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <span>対話セッションが十分な内容になりました</span>
            <Btn variant="teal" onClick={generateReport} disabled={reportLoading} style={{ padding:"6px 14px", fontSize:12 }}>
              {reportLoading?"生成中...":"📄 レポートを作成する"}
            </Btn>
          </div>
        )}
      </div>
    </div>
  );

  // ════════════════════════════════════════════════════════════
  // REPORT
  if (page === "report") {
    const r = report || data?.report;
    if (!r) return shell(<div style={{ padding:40, textAlign:"center", color:C.muted }}>レポートがありません</div>);
    return shell(
      <div style={{ maxWidth:720, margin:"0 auto", padding:"32px 20px", animation:"fadeUp 0.4s ease" }}>
        <div style={{ textAlign:"center", marginBottom:36 }}>
          <Badge label="自己理解レポート" color={C.teal}/>
          <h1 style={{ fontSize:26, fontWeight:800, marginTop:12, marginBottom:8 }}>{basic.name||data?.basic?.name||"あなた"}さんの強み・価値観レポート</h1>
          <p style={{ color:C.sub, fontSize:14 }}>{new Date().toLocaleDateString("ja-JP")} 作成</p>
        </div>

        {/* AI comment */}
        <Card style={{ background:C.tealL, border:`1px solid ${C.teal}33`, marginBottom:20 }}>
          <div style={{ fontSize:12, fontWeight:700, color:C.teal, marginBottom:10 }}>💬 AIコンサルタントより</div>
          <p style={{ color:C.sub, fontSize:14, lineHeight:1.8 }}>{r.aiComment}</p>
        </Card>

        {/* Career axis */}
        <Card style={{ marginBottom:20 }}>
          <div style={{ fontSize:12, fontWeight:700, color:C.accent, marginBottom:10 }}>🧭 あなたのキャリアの軸</div>
          <p style={{ color:C.text, fontSize:15, lineHeight:1.8, fontWeight:500 }}>{r.careerAxis}</p>
        </Card>

        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:16, marginBottom:20 }}>
          {[
            { label:"💪 強み", items: r.strengths, color:C.accent },
            { label:"🌟 ソフトスキル", items: r.softSkills, color:C.teal },
            { label:"❤️ 価値観", items: r.values, color:C.gold },
          ].map(section=>(
            <Card key={section.label} style={{ padding:18 }}>
              <div style={{ fontSize:12, fontWeight:700, color:section.color, marginBottom:12 }}>{section.label}</div>
              <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                {(section.items||[]).map((item,i)=>(
                  <div key={i} style={{ fontSize:13, color:C.sub, display:"flex", alignItems:"flex-start", gap:6 }}>
                    <span style={{ color:section.color, flexShrink:0 }}>▸</span>{item}
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>

        {/* Self PR */}
        <Card style={{ marginBottom:20, background:C.goldL, border:`1px solid ${C.gold}33` }}>
          <div style={{ fontSize:12, fontWeight:700, color:C.gold, marginBottom:10 }}>📝 自己PR文のベース</div>
          <p style={{ color:C.text, fontSize:14, lineHeight:1.9 }}>{r.selfPR}</p>
          <div style={{ fontSize:11, color:C.muted, marginTop:8 }}>※このテキストをベースに、自己PR文を仕上げてください</div>
        </Card>

        {/* Next steps */}
        <Card style={{ marginBottom:32 }}>
          <div style={{ fontSize:12, fontWeight:700, color:C.green, marginBottom:12 }}>🚀 次のアクション</div>
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            {(r.nextSteps||[]).map((step,i)=>(
              <div key={i} style={{ display:"flex", alignItems:"flex-start", gap:12, padding:"10px 14px", background:C.greenL, borderRadius:10 }}>
                <div style={{ width:22, height:22, borderRadius:"50%", background:C.green, color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:700, flexShrink:0 }}>{i+1}</div>
                <span style={{ fontSize:14, color:C.sub, lineHeight:1.6 }}>{step}</span>
              </div>
            ))}
          </div>
        </Card>

        <div style={{ display:"flex", gap:12 }}>
          <Btn onClick={()=>{ persist({ report:r }); setPage("dashboard"); }} style={{ flex:1 }}>💾 保存してマイページへ</Btn>
          <Btn variant="secondary" onClick={()=>setPage("phase2")} style={{ flex:1 }}>← 対話に戻る</Btn>
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════
  // DASHBOARD
  if (page === "dashboard") {
    const d2 = data || {};
    const b = d2.basic || {};
    const r = d2.report;
    const sm = d2.skillMap || {};
    const skillCount = Object.keys(sm).length;
    const savedAt = d2.savedAt ? new Date(d2.savedAt).toLocaleDateString("ja-JP") : "—";

    return shell(
      <div style={{ maxWidth:760, margin:"0 auto", padding:"32px 20px", animation:"fadeUp 0.4s ease" }}>
        {/* Header */}
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:28 }}>
          <div>
            <div style={{ fontSize:11, fontWeight:700, color:C.accent, letterSpacing:"0.1em", marginBottom:6 }}>MY PAGE</div>
            <h1 style={{ fontSize:22, fontWeight:800 }}>{b.name ? `${b.name}さんのキャリアノート` : "マイキャリアノート"}</h1>
            <div style={{ color:C.muted, fontSize:12, marginTop:4 }}>最終更新: {savedAt}</div>
          </div>
          <Btn onClick={()=>{ setP1step(1); setPage("phase1"); }} variant="ghost" style={{ fontSize:13, padding:"8px 16px" }}>
            + 情報を更新
          </Btn>
        </div>

        {/* Status cards */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12, marginBottom:24 }}>
          {[
            { label:"登録スキル", value:skillCount, unit:"個", color:C.accent, bg:C.accentL, done:skillCount>0 },
            { label:"AI対話", value:d2.phase2Done?"完了":"未実施", unit:"", color:d2.phase2Done?C.teal:C.muted, bg:d2.phase2Done?C.tealL:C.bg, done:d2.phase2Done },
            { label:"自己理解レポート", value:r?"作成済み":"未作成", unit:"", color:r?C.gold:C.muted, bg:r?C.goldL:C.bg, done:!!r },
          ].map(card=>(
            <div key={card.label} style={{ background:card.bg, border:`1px solid ${card.done?card.color+"44":C.border}`, borderRadius:14, padding:18 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                <div style={{ color:card.color, fontSize:11, fontWeight:700 }}>{card.label}</div>
                <span style={{ fontSize:14 }}>{card.done?"✅":"⬜"}</span>
              </div>
              <div style={{ fontSize:typeof card.value==="number"?24:14, fontWeight:700, color:card.color }}>
                {card.value}<span style={{ fontSize:12, color:card.color, opacity:0.7 }}>{card.unit}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Report summary */}
        {r ? (
          <div>
            <Card style={{ marginBottom:20 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
                <div style={{ fontSize:14, fontWeight:700 }}>自己理解レポート</div>
                <Btn variant="ghost" onClick={()=>setPage("report")} style={{ padding:"6px 14px", fontSize:12 }}>全文を見る</Btn>
              </div>
              <div style={{ background:C.tealL, border:`1px solid ${C.teal}33`, borderRadius:10, padding:"12px 16px", marginBottom:14 }}>
                <div style={{ fontSize:11, fontWeight:700, color:C.teal, marginBottom:6 }}>🧭 キャリアの軸</div>
                <p style={{ fontSize:13, color:C.sub, lineHeight:1.7 }}>{r.careerAxis}</p>
              </div>
              <div style={{ display:"flex", flexWrap:"wrap", gap:8, marginBottom:14 }}>
                {(r.strengths||[]).map((s,i)=><Badge key={i} label={`💪 ${s}`} color={C.accent}/>)}
                {(r.values||[]).map((v,i)=><Badge key={i} label={`❤️ ${v}`} color={C.gold}/>)}
              </div>
              <div style={{ background:C.goldL, border:`1px solid ${C.gold}33`, borderRadius:10, padding:"12px 16px" }}>
                <div style={{ fontSize:11, fontWeight:700, color:C.gold, marginBottom:6 }}>📝 自己PR文のベース</div>
                <p style={{ fontSize:13, color:C.sub, lineHeight:1.7 }}>{r.selfPR}</p>
              </div>
            </Card>

            <div style={{ display:"flex", gap:12 }}>
              <Btn variant="teal" onClick={()=>{ setMessages([]); setSessionDone(false); setPage("phase2"); startConsulting(); }} style={{ flex:1 }}>
                💬 AI対話を続ける
              </Btn>
              <Btn variant="secondary" onClick={()=>setPage("report")} style={{ flex:1 }}>
                📄 レポートを確認
              </Btn>
            </div>
          </div>
        ) : (
          <Card style={{ textAlign:"center", padding:40 }}>
            <div style={{ fontSize:40, marginBottom:16 }}>💬</div>
            <div style={{ fontSize:16, fontWeight:700, marginBottom:8 }}>AIコンサルティングを始めましょう</div>
            <p style={{ color:C.sub, fontSize:14, marginBottom:24, lineHeight:1.7 }}>
              対話を通じて、あなたのソフトスキル・価値観・<br/>キャリアの軸を言語化します。
            </p>
            {d2.phase1Done ? (
              <Btn variant="teal" onClick={()=>{ setMessages([]); setSessionDone(false); setPage("phase2"); startConsulting(); }} style={{ padding:"12px 28px" }}>
                💬 AI対話を開始する
              </Btn>
            ) : (
              <Btn onClick={()=>{ setP1step(1); setPage("phase1"); }} style={{ padding:"12px 28px" }}>
                📋 スキルの棚卸しから始める
              </Btn>
            )}
          </Card>
        )}

        {/* Skill list */}
        {skillCount > 0 && (
          <Card style={{ marginTop:20 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
              <div style={{ fontSize:14, fontWeight:700 }}>登録スキル</div>
              <Btn variant="secondary" onClick={()=>{ setP1step(3); setPage("phase1"); }} style={{ padding:"5px 12px", fontSize:12 }}>編集</Btn>
            </div>
            {SKILL_CATS.map(cat=>{
              const mySkills = cat.skills.filter(s=>sm[s]);
              if (!mySkills.length) return null;
              return (
                <div key={cat.label} style={{ marginBottom:16 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:8 }}>
                    <span style={{ fontSize:13 }}>{cat.icon}</span>
                    <span style={{ fontSize:12, fontWeight:700, color:cat.color }}>{cat.label}</span>
                  </div>
                  <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                    {mySkills.map(skill=>(
                      <div key={skill}>
                        <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, color:C.sub, marginBottom:3 }}>
                          <span>{skill}</span>
                          <span style={{ fontFamily:FM, fontSize:11, color:C.muted }}>{sm[skill]}</span>
                        </div>
                        <Bar value={YEAR_NUM[sm[skill]]||0} color={cat.color} height={5}/>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </Card>
        )}
      </div>
    );
  }

  return null;
}
