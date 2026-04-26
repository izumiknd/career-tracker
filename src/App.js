import { useState, useEffect } from "react";
import { Zap, Brain, PenLine, ArrowRight, ArrowLeft, ChevronRight, Save, MessageCircle, FileText, BookOpen, Send } from "lucide-react";

// ── Design tokens ─────────────────────────────────────────────
const C = {
  bg:       "#F8F6F2",
  surface:  "#FDFCFA",
  border:   "#E8E3DC",
  accent:   "#2D6A4F",   // 深いグリーン
  accentL:  "#EAF4EF",
  accentM:  "#52B788",
  text:     "#1C1C1C",
  sub:      "#555550",
  muted:    "#9B9790",
  warm:     "#C9742B",   // アクセントウォーム
  warmL:    "#FDF3EA",
  shadow:   "0 1px 6px rgba(0,0,0,0.06)",
  shadowM:  "0 4px 24px rgba(0,0,0,0.10)",
};
const F  = "'Noto Sans JP','Hiragino Sans',sans-serif";
const FM = "'DM Mono',monospace";

const THEMES_P2_LABELS = {
  moyo:"仕事のもやもや", tsuyomi:"自分の強みを知りたい",
  taisetu:"大切にしていること", career:"これからのキャリア",
  tensyoku:"転職について", free:"自由に話したい",
};

// ── Storage ───────────────────────────────────────────────────
const KEY = "pathnote_mvp_v1";
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } };
const save = (d) => localStorage.setItem(KEY, JSON.stringify(d));

// ── Groq API ──────────────────────────────────────────────────
async function callAIJSON(messages) {
  const apiKey = process.env.REACT_APP_GROQ_API_KEY;
  if (!apiKey) throw new Error("APIキーが未設定です");
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
    body: JSON.stringify({ model: "llama-3.1-8b-instant", messages, temperature: 0.5, max_tokens: 800 }),
  });
  if (!res.ok) { const e = await res.json().catch(()=>({})); throw new Error(e?.error?.message || res.statusText); }
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content || "";
  const start = text.indexOf("{");
  let depth = 0, end = -1;
  for (let i = start; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}") { depth--; if (depth === 0) { end = i; break; } }
  }
  if (start === -1 || end === -1) throw new Error("JSONが取得できませんでした");
  return JSON.parse(text.slice(start, end + 1));
}

async function callAIStream_p2(messages, onChunk) {
  const apiKey = process.env.REACT_APP_GROQ_API_KEY;
  if (!apiKey) throw new Error("APIキーが未設定です");
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
    body: JSON.stringify({ model: "llama-3.3-70b-versatile", messages, temperature: 0.6, max_tokens: 300, stream: true }),
  });
  if (!res.ok) { const e = await res.json().catch(()=>({})); throw new Error(e?.error?.message || res.statusText); }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let full = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const lines = decoder.decode(value).split("\n").filter(l => l.startsWith("data: ") && !l.includes("[DONE]"));
    for (const line of lines) {
      try {
        const delta = JSON.parse(line.slice(6)).choices?.[0]?.delta?.content || "";
        if (delta) { full += delta; onChunk(full); }
      } catch {}
    }
  }
  return full;
}

// ── 3つの質問 ─────────────────────────────────────────────────
const QUESTIONS = [
  {
    id: "q1",
    label: "Q1",
    question: "最近の仕事で、時間を忘れて取り組めたことはありますか？",
    sub: "「ちょっとだけ」でも大丈夫です",
    choices: [
      "誰かの相談に乗ったり、サポートしたとき",
      "アイデアを出したり、企画を考えたとき",
      "データや情報を調べて整理したとき",
      "何かを丁寧に、きれいに仕上げたとき",
      "チームをまとめたり、場を作ったとき",
      "新しいことを学んだり、試したとき",
    ],
  },
  {
    id: "q2",
    label: "Q2",
    question: "周りから「ありがとう」「助かった」と言われるのは、どんなときが多いですか？",
    sub: "「自分では当たり前」と思っていることでもOK",
    choices: [
      "話をちゃんと聞いてくれると言われる",
      "資料や説明がわかりやすいと言われる",
      "細かいところに気づいてくれると言われる",
      "落ち着いて場を仕切ってくれると言われる",
      "アイデアが面白いと言われる",
      "最後までやり抜いてくれると言われる",
    ],
  },
  {
    id: "q3",
    label: "Q3",
    question: "仕事を通じて、大切にしていることに近いのはどれですか？",
    sub: "直感で選んでください",
    choices: [
      "人の役に立てている実感",
      "自分が成長できている感覚",
      "チームや仲間と協力すること",
      "クオリティへのこだわり",
      "自分の裁量で動けること",
      "新しいことへのチャレンジ",
    ],
  },
];

// ── Main App ──────────────────────────────────────────────────
export default function App() {
  const [page, setPage]       = useState("home");       // home | quiz | loading | result | p2_intro | p2_chat | p2_loading | p2_result
  const [step, setStep]       = useState(0);
  const [answers, setAnswers] = useState([]);
  const [freeText, setFreeText] = useState("");
  const [showFree, setShowFree] = useState(false);
  const [result, setResult]   = useState(null);
  const [loading, setLoading] = useState(false);
  const [savedResult, setSavedResult] = useState(null);

  // Phase2 state
  const [p2messages, setP2messages]   = useState([]); // {role, content}
  const [p2input, setP2input]         = useState("");
  const [p2typing, setP2typing]       = useState(false);
  const [p2done, setP2done]           = useState(false);
  const [p2result, setP2result]       = useState(null);
  const [p2turn, setP2turn]           = useState(0);

  useEffect(() => {
    const d = load();
    if (d?.result) setSavedResult(d);
  }, []);

  const currentQ = QUESTIONS[step];
  const progress = ((step) / QUESTIONS.length) * 100;

  const handleChoice = async (choice) => {
    const newAnswers = [...answers, { q: currentQ.question, a: choice }];
    setAnswers(newAnswers);
    setFreeText("");
    setShowFree(false);

    if (step < QUESTIONS.length - 1) {
      setStep(s => s + 1);
    } else {
      await runAnalysis(newAnswers);
    }
  };

  const handleFreeSubmit = async () => {
    if (!freeText.trim()) return;
    const newAnswers = [...answers, { q: currentQ.question, a: freeText.trim(), free: true }];
    setAnswers(newAnswers);
    setFreeText("");
    setShowFree(false);

    if (step < QUESTIONS.length - 1) {
      setStep(s => s + 1);
    } else {
      await runAnalysis(newAnswers);
    }
  };

  const handleDontKnow = () => {
    const newAnswers = [...answers, { q: currentQ.question, a: "わからない／思いつかない" }];
    setAnswers(newAnswers);
    setFreeText("");
    setShowFree(false);

    if (step < QUESTIONS.length - 1) {
      setStep(s => s + 1);
    } else {
      runAnalysis(newAnswers);
    }
  };

  const runAnalysis = async (finalAnswers) => {
    setPage("loading");
    setLoading(true);
    try {
      const answersText = finalAnswers.map(a => `Q: ${a.q}\nA: ${a.a}`).join("\n\n");
      const prompt = `以下は自己理解のための質問への回答です。JSONのみで返答してください（説明文・コードブロック不要）。

回答:
${answersText}

以下のJSON形式のみで返答:
{"strengths":["強み1","強み2","強み3"],"values":["価値観1","価値観2","価値観3"],"wants":["やりたいこと1","やりたいこと2"],"message":"メッセージ","keyword":"キーワード"}

【厳守ルール】
1. MECE（重複なし・漏れなし）を徹底すること
   - 同じ概念を言い方を変えて繰り返さない（例：「効率性の追求」と「効率化へのこだわり」はNG）
   - 各カテゴリ内の項目は互いに異なる角度の内容にすること
   - strengths・values・wantsの間でも内容が重複しないこと

2. strengths（強み）：3個
   - 「何ができるか」「どう行動するか」という具体的な能力・行動特性
   - 例：「相手の話を整理して本質を引き出す力」「完成度にこだわり最後まで仕上げる粘り強さ」
   - NG：抽象的すぎる表現（「コミュニケーション能力」「真面目さ」）

3. values（価値観）：3個
   - 「何を大切にしているか」という判断基準・優先順位
   - 例：「人が安心して相談できる関係」「手を抜かず誠実に向き合うこと」
   - NG：行動の結果（強みと重複）、目標（やりたいことと重複）

4. wants（やりたいこと）：2個
   - 「どこに向かいたいか」という方向性・志向
   - 例：「チームが自然とまとまる環境をつくる」「専門性を深めて頼られる存在になる」
   - NG：抽象的すぎる表現（「成長したい」「貢献したい」）

5. message：「あなたは〜」で始まる2文。回答内容を踏まえた具体的な言葉で
6. keyword：5〜10文字。この人の本質を表す一言（例：「静かな推進力」「人を活かす目」）
7. すべて日本語。各項目は15〜30文字程度`;

      const res = await callAIJSON([{ role: "user", content: prompt }]);
      setResult(res);
      const saveData = { result: res, answers: finalAnswers, createdAt: new Date().toISOString() };
      save(saveData);
      setSavedResult(saveData);
      setPage("result");
    } catch (e) {
      alert("エラーが発生しました。もう一度試してください。\n" + e.message);
      setPage("quiz");
    }
    setLoading(false);
  };

  // ── Phase2 ロジック ────────────────────────────────────────
  const startPhase2 = async () => {
    setP2messages([]);
    setP2turn(0);
    setP2done(false);
    setP2result(null);
    setPage("p2_chat");
    setP2typing(true);

    const r = result || savedResult?.result;
    const context = r ? `フェーズ①の結果：強み「${(r.strengths||[]).join("・")}」、価値観「${(r.values||[]).join("・")}」、向かいたい方向「${(r.wants||[]).join("・")}」` : "";

    const sys = `あなたはキャリアの自己理解を助けるコーチです。
クライアントはすでに簡単な自己分析（フェーズ①）を終えています。
${context}

あなたの役割は、1問ずつ対話を通じてこの人の理解をさらに深めることです。

ルール：
- 1回に質問は1つだけ
- 話し言葉で自然に、2〜3文まで
- 相手の言葉をそのまま使って受け取る（ミラーリング）
- アドバイスは絶対にしない。傾聴に徹する
- 「なぜ」は使わない。「どんな場面で」「そのとき何を感じましたか」を使う
- 必ず疑問文で終わる
- 4〜6往復で自然にまとめに入る

最初の一言：フェーズ①の結果に触れながら、「もう少し聞かせてください」という雰囲気で1問だけ質問してください。`;

    try {
      const firstMsg = await callAIStream_p2(
        [{ role:"system", content:sys }, { role:"user", content:"お願いします。" }],
        (partial) => setP2messages([{ role:"assistant", content:partial }])
      );
      setP2messages([{ role:"assistant", content:firstMsg }]);
    } catch {
      setP2messages([{ role:"assistant", content:"申し訳ありません。もう一度試してください。" }]);
    }
    setP2typing(false);
  };

  const sendP2Message = async () => {
    if (!p2input.trim() || p2typing) return;
    const userMsg = { role:"user", content:p2input.trim() };
    const newMsgs = [...p2messages, userMsg];
    const newTurn = p2turn + 1;
    setP2messages([...newMsgs, { role:"assistant", content:"" }]);
    setP2input("");
    setP2typing(true);
    setP2turn(newTurn);

    const r = result || savedResult?.result;
    const context = r ? `フェーズ①の結果：強み「${(r.strengths||[]).join("・")}」、価値観「${(r.values||[]).join("・")}」` : "";
    const endHint = newTurn >= 5
      ? "\n\n【重要】そろそろ対話をまとめてください。これまでの会話で見えてきたことを1〜2文でフィードバックし、「ここまでの対話をもとに整理できます」と自然に伝えてください。"
      : "";

    const sys = `あなたはキャリアの自己理解を助けるコーチです。${context}
ルール：1回に質問1つ・話し言葉・2〜3文・ミラーリング・アドバイスなし・必ず疑問文で終わる${endHint}`;

    try {
      let finalContent = "";
      await callAIStream_p2(
        [{ role:"system", content:sys }, ...newMsgs],
        (partial) => {
          finalContent = partial;
          setP2messages([...newMsgs, { role:"assistant", content:partial }]);
        }
      );
      if (newTurn >= 5) setP2done(true);
    } catch {
      setP2messages([...newMsgs, { role:"assistant", content:"エラーが発生しました。もう一度送信してください。" }]);
    }
    setP2typing(false);
  };

  const generateP2Result = async () => {
    setPage("p2_loading");
    try {
      const conv = p2messages.map(m=>`${m.role==="user"?"あなた":"コーチ"}: ${m.content}`).join("\n");
      const r1 = result || savedResult?.result;
      const base = r1 ? `フェーズ①結果：強み「${(r1.strengths||[]).join("・")}」、価値観「${(r1.values||[]).join("・")}」、向かいたい方向「${(r1.wants||[]).join("・")}」` : "";

      const prompt = `以下はキャリア自己理解の深掘り対話です。JSONのみで返答してください（説明文・コードブロック不要）。

${base}

対話記録:
${conv}

以下のJSON形式のみで返答:
{"strengths":["強み1","強み2","強み3"],"values":["価値観1","価値観2","価値観3"],"wants":["やりたいこと1","やりたいこと2"],"axis":"キャリアの軸（2〜3文）","selfpr":"自己PR文（150文字程度）","careerDirection":["向いている職種・キャリアパス1（職種名＋理由1文）","向いている職種・キャリアパス2","向いている職種・キャリアパス3"],"message":"応援メッセージ（2文）","keyword":"この人の本質を表す独自の言葉（5〜10文字）"}

【各フィールドの厳守ルール】

keyword：
- ありきたりな言葉は絶対に使わない（「信頼の人」「縁の下の力持ち」「真摯な姿勢」などNG）
- その人だけの特徴を鋭く捉えた、詩的・比喩的な表現にする
- 例：「静かな推進力」「人の声を地図にする人」「余白を読む目」「根っこをつなぐ人」「摩擦を熱に変える力」

careerDirection（向いているキャリアの方向性）：
- 「明日できること」ではなく、3〜5年後に向かえる具体的な職種・役割・キャリアパスを提案する
- 対話から見えたこの人の特性・強みに基づいて、なぜその方向が合っているかを1文で添える
- 例：「カスタマーサクセスマネージャー（顧客の声を深く聞き、課題を構造化する力が活きる）」
- 3つの方向性は互いに異なる角度から提案する（業界・職種・働き方など）

selfpr：
- 対話で語られた具体的なエピソード・言葉・場面を必ず盛り込む
- 「私は〜」で始まる、実際の転職書類に使えるレベルの自己PR文
- 抽象的な表現（「コミュニケーション能力が高い」など）は使わない
- 150文字程度

axis：この人の本質的な方向性を2〜3文で。具体的に。

【MECE厳守】各カテゴリ内・カテゴリ間で内容が重複しない。抽象的な表現NG。すべて日本語。`;

      const res = await callAIJSON([{ role:"user", content:prompt }]);
      setP2result(res);
      const saveData = {
        result: savedResult?.result || result,
        p2result: res,
        p2messages,
        answers: savedResult?.answers || answers,
        createdAt: savedResult?.createdAt || new Date().toISOString(),
        p2createdAt: new Date().toISOString(),
      };
      save(saveData);
      setSavedResult(saveData);
      setPage("p2_result");
    } catch(e) {
      alert("エラーが発生しました: " + e.message);
      setPage("p2_chat");
    }
  };

  const restart = () => {
    setStep(0); setAnswers([]); setFreeText(""); setShowFree(false);
    setResult(null); setPage("quiz");
  };

  // ── GLOBAL STYLES ─────────────────────────────────────────
  const GlobalStyles = () => (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;600;700;800&family=DM+Mono:wght@400;500&display=swap');
      @keyframes fadeUp   { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
      @keyframes fadeIn   { from{opacity:0} to{opacity:1} }
      @keyframes spin     { to{transform:rotate(360deg)} }
      @keyframes pulse    { 0%,100%{transform:scale(1)} 50%{transform:scale(1.04)} }
      @keyframes shimmer  { 0%{background-position:-200% 0} 100%{background-position:200% 0} }
      * { box-sizing:border-box; margin:0; padding:0; }
      body { background:${C.bg}; font-family:${F}; }
      button { font-family:${F}; }
      textarea, input { font-family:${F}; }
      ::-webkit-scrollbar { width:4px; }
      ::-webkit-scrollbar-thumb { background:${C.border}; border-radius:2px; }
      .choice-btn:hover { border-color:${C.accent} !important; background:${C.accentL} !important; transform:translateY(-1px); box-shadow:0 4px 12px rgba(45,106,79,0.12) !important; }
      .dont-know:hover  { color:${C.sub} !important; }
      .free-btn:hover   { border-color:${C.accentM} !important; color:${C.accent} !important; }
    `}</style>
  );

  // ── NAV ───────────────────────────────────────────────────
  const Nav = ({ showResult }) => (
    <nav style={{ background:C.surface, borderBottom:`1px solid ${C.border}`, padding:"0 20px", display:"flex", alignItems:"center", justifyContent:"space-between", height:52, position:"sticky", top:0, zIndex:100, boxShadow:C.shadow }}>
      <div onClick={()=>setPage("home")} style={{ cursor:"pointer", display:"flex", alignItems:"center", gap:8 }}>
        <div style={{ width:26, height:26, background:C.accent, borderRadius:6, display:"flex", alignItems:"center", justifyContent:"center" }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M2 11L5 4L7 9L9 6L12 11" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <span style={{ fontWeight:800, fontSize:15, color:C.text, letterSpacing:"-0.02em" }}>PathNote</span>
      </div>
      <div style={{ display:"flex", gap:8 }}>
        {(load()||{}).sessions?.length > 0 && (
          <button onClick={()=>setPage("mypage")}
            style={{ background:"none", border:`1px solid ${C.border}`, borderRadius:8, padding:"5px 12px", color:C.sub, cursor:"pointer", fontSize:12 }}>
            マイページ
          </button>
        )}
        {showResult && savedResult?.result && (
          <button onClick={()=>{ setResult(savedResult.result); setPage("result"); }}
            style={{ background:"none", border:`1px solid ${C.border}`, borderRadius:8, padding:"5px 12px", color:C.sub, cursor:"pointer", fontSize:12 }}>
            結果を見る
          </button>
        )}
      </div>
    </nav>
  );

  // ══════════════════════════════════════════════════════════
  // HOME
  // ══════════════════════════════════════════════════════════
  if (page === "home") return (
    <div style={{ minHeight:"100vh", background:C.bg, fontFamily:F }}>
      <GlobalStyles/>
      <Nav showResult={true}/>

      {/* Hero */}
      <div style={{ maxWidth:560, margin:"0 auto", padding:"56px 24px 40px", textAlign:"center" }}>
        <div style={{ display:"inline-block", padding:"4px 14px", borderRadius:20, background:C.accentL, border:`1px solid ${C.accentM}44`, color:C.accent, fontSize:12, fontWeight:700, marginBottom:24, letterSpacing:"0.04em" }}>
          3問 · 2分 · すぐ結果
        </div>

        <h1 style={{ fontSize:"clamp(26px,6vw,40px)", fontWeight:800, lineHeight:1.25, color:C.text, marginBottom:20, letterSpacing:"-0.03em" }}>
          自分の強みを、<br/>言葉にしよう。
        </h1>

        <p style={{ fontSize:15, color:C.sub, lineHeight:1.9, marginBottom:36 }}>
          たった3問に答えるだけで、AIがあなたの<br/>
          強み・価値観・やりたいことを言語化します。
        </p>

        <button onClick={()=>{ setStep(0); setAnswers([]); setPage("quiz"); }}
          style={{ width:"100%", maxWidth:320, padding:"16px 32px", background:C.accent, color:"#fff", border:"none", borderRadius:14, fontSize:16, fontWeight:700, cursor:"pointer", boxShadow:`0 4px 20px rgba(45,106,79,0.3)`, transition:"all 0.2s", letterSpacing:"-0.01em" }}>
          はじめる <ChevronRight size={17} style={{ display:"inline", verticalAlign:"middle" }}/>
        </button>

        {savedResult && (
          <button onClick={()=>{ setResult(savedResult.result); setPage("result"); }}
            style={{ display:"block", margin:"16px auto 0", background:"none", border:"none", color:C.muted, cursor:"pointer", fontSize:13, textDecoration:"underline" }}>
            前回の結果を見る（{new Date(savedResult.createdAt).toLocaleDateString("ja-JP")}）
          </button>
        )}
      </div>

      {/* 特徴 */}
      <div style={{ maxWidth:560, margin:"0 auto", padding:"0 24px 48px" }}>
        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
          {[
            { Icon:Zap,           text:"3問に答えるだけ。職歴の入力不要" },
            { Icon:Brain,         text:"AIがあなたの言葉から強みを読み取る" },
            { Icon:PenLine,       text:"「言語化できた感」が得られる" },
          ].map((item, i) => (
            <div key={i} style={{ display:"flex", alignItems:"center", gap:14, padding:"14px 18px", background:C.surface, border:`1px solid ${C.border}`, borderRadius:12, boxShadow:C.shadow }}>
              <item.Icon size={20} color={C.accentM} strokeWidth={1.8} style={{ flexShrink:0 }}/>
              <span style={{ fontSize:14, color:C.sub, lineHeight:1.6 }}>{item.text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  // ══════════════════════════════════════════════════════════
  // QUIZ
  // ══════════════════════════════════════════════════════════
  if (page === "quiz") return (
    <div style={{ minHeight:"100vh", background:C.bg, fontFamily:F }}>
      <GlobalStyles/>
      <Nav/>

      <div style={{ maxWidth:560, margin:"0 auto", padding:"28px 20px 48px" }}>
        {/* プログレス */}
        <div style={{ marginBottom:32 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
            <span style={{ fontSize:12, fontWeight:700, color:C.accent, fontFamily:FM }}>
              {step + 1} / {QUESTIONS.length}
            </span>
            <span style={{ fontSize:11, color:C.muted }}>
              {["あと2問", "あと1問", "最後の質問"][step]}
            </span>
          </div>
          <div style={{ background:C.border, borderRadius:99, height:4, overflow:"hidden" }}>
            <div style={{ width:`${((step) / QUESTIONS.length) * 100 + 5}%`, height:"100%", background:`linear-gradient(90deg,${C.accent},${C.accentM})`, borderRadius:99, transition:"width 0.5s ease" }}/>
          </div>
        </div>

        {/* 質問カード */}
        <div key={step} style={{ animation:"fadeUp 0.35s ease" }}>
          <div style={{ marginBottom:6, fontSize:11, fontWeight:700, color:C.accentM, letterSpacing:"0.08em" }}>
            {currentQ.label}
          </div>
          <h2 style={{ fontSize:"clamp(17px,4.5vw,21px)", fontWeight:700, color:C.text, lineHeight:1.55, marginBottom:6 }}>
            {currentQ.question}
          </h2>
          <p style={{ fontSize:13, color:C.muted, marginBottom:24 }}>{currentQ.sub}</p>

          {/* 選択肢 */}
          {!showFree && (
            <div style={{ display:"flex", flexDirection:"column", gap:10, marginBottom:16 }}>
              {currentQ.choices.map((choice, i) => (
                <button key={i} className="choice-btn" onClick={() => handleChoice(choice)}
                  style={{ textAlign:"left", padding:"14px 18px", background:C.surface, border:`1.5px solid ${C.border}`, borderRadius:12, cursor:"pointer", fontSize:14, color:C.text, lineHeight:1.5, transition:"all 0.18s", boxShadow:C.shadow }}>
                  {choice}
                </button>
              ))}
            </div>
          )}

          {/* 自由記述 */}
          {showFree ? (
            <div style={{ animation:"fadeIn 0.2s ease" }}>
              <textarea value={freeText} onChange={e=>setFreeText(e.target.value)}
                placeholder="思っていることを自由に書いてください..."
                autoFocus
                style={{ width:"100%", padding:"14px 16px", background:C.surface, border:`1.5px solid ${C.accent}`, borderRadius:12, fontSize:14, lineHeight:1.7, resize:"none", minHeight:110, color:C.text, outline:"none", boxShadow:`0 0 0 3px ${C.accentL}` }}/>
              <div style={{ display:"flex", gap:10, marginTop:12 }}>
                <button onClick={handleFreeSubmit} disabled={!freeText.trim()}
                  style={{ flex:2, padding:"13px", background:freeText.trim()?C.accent:"#ccc", color:"#fff", border:"none", borderRadius:10, fontSize:14, fontWeight:700, cursor:freeText.trim()?"pointer":"not-allowed", transition:"background 0.2s" }}>
                  次へ <ChevronRight size={15} style={{ display:"inline", verticalAlign:"middle" }}/>
                </button>
                <button onClick={()=>setShowFree(false)}
                  style={{ flex:1, padding:"13px", background:"transparent", border:`1px solid ${C.border}`, borderRadius:10, fontSize:14, color:C.sub, cursor:"pointer" }}>
                  戻る
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
              <button className="free-btn" onClick={()=>setShowFree(true)}
                style={{ padding:"10px 18px", borderRadius:10, border:`1.5px solid ${C.border}`, background:"transparent", color:C.sub, cursor:"pointer", fontSize:13, fontWeight:600, transition:"all 0.15s" }}>
                ✏️ 自分の言葉で書く
              </button>
              <button className="dont-know" onClick={handleDontKnow}
                style={{ padding:"10px 18px", borderRadius:10, border:"none", background:"transparent", color:C.muted, cursor:"pointer", fontSize:13, transition:"color 0.15s" }}>
                わからない
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  // ══════════════════════════════════════════════════════════
  // LOADING
  // ══════════════════════════════════════════════════════════
  if (page === "loading") return (
    <div style={{ minHeight:"100vh", background:C.bg, fontFamily:F, display:"flex", flexDirection:"column" }}>
      <GlobalStyles/>
      <Nav/>
      <div style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"40px 24px", textAlign:"center" }}>
        <div style={{ width:52, height:52, border:`3px solid ${C.border}`, borderTopColor:C.accent, borderRadius:"50%", animation:"spin 0.9s linear infinite", marginBottom:28 }}/>
        <h2 style={{ fontSize:20, fontWeight:700, color:C.text, marginBottom:10 }}>分析中です...</h2>
        <p style={{ color:C.sub, fontSize:14, lineHeight:1.8 }}>
          3つの回答から、あなたの<br/>強み・価値観・やりたいことを読み取っています。
        </p>
      </div>
    </div>
  );

  // ══════════════════════════════════════════════════════════
  // RESULT
  // ══════════════════════════════════════════════════════════
  if (page === "result") {
    const r = result;
    if (!r) return null;

    return (
      <div style={{ minHeight:"100vh", background:C.bg, fontFamily:F }}>
        <GlobalStyles/>
        <Nav/>

        <div style={{ maxWidth:560, margin:"0 auto", padding:"32px 20px 56px", animation:"fadeUp 0.4s ease" }}>

          {/* キーワード */}
          <div style={{ textAlign:"center", marginBottom:32 }}>
            <div style={{ fontSize:11, fontWeight:700, color:C.muted, letterSpacing:"0.1em", marginBottom:12 }}>あなたを一言で表すと</div>
            <div style={{ display:"inline-block", padding:"10px 28px", background:C.accent, color:"#fff", borderRadius:40, fontSize:20, fontWeight:800, letterSpacing:"-0.01em", boxShadow:`0 4px 20px rgba(45,106,79,0.25)` }}>
              {r.keyword}
            </div>
          </div>

          {/* メッセージ */}
          <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:16, padding:"22px 24px", marginBottom:20, boxShadow:C.shadow }}>
            <div style={{ fontSize:11, fontWeight:700, color:C.accentM, marginBottom:10, letterSpacing:"0.06em" }}>AIからのメッセージ</div>
            <p style={{ fontSize:15, color:C.text, lineHeight:1.9, fontWeight:500 }}>{r.message}</p>
          </div>

          {/* 強み */}
          <SectionCard title="強み" color={C.accent} items={r.strengths}
            icon={<svg width="15" height="15" viewBox="0 0 15 15" fill="none"><path d="M7.5 1L9.5 5.5L14.5 6L11 9.5L12 14.5L7.5 12L3 14.5L4 9.5L0.5 6L5.5 5.5L7.5 1Z" fill={C.accent}/></svg>}
          />

          {/* 価値観 */}
          <SectionCard title="大切にしていること" color={C.warm} items={r.values}
            icon={<svg width="15" height="15" viewBox="0 0 15 15" fill="none"><path d="M7.5 13S2 9 2 5.5C2 3.5 3.5 2 5.5 2C6.5 2 7.5 2.8 7.5 2.8S8.5 2 9.5 2C11.5 2 13 3.5 13 5.5C13 9 7.5 13 7.5 13Z" fill={C.warm}/></svg>}
          />

          {/* やりたいこと */}
          <SectionCard title="向かいたい方向" color="#7B5EA7" items={r.wants}
            icon={<svg width="15" height="15" viewBox="0 0 15 15" fill="none"><path d="M2 7.5H13M9 3.5L13 7.5L9 11.5" stroke="#7B5EA7" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
          />

          {/* アクション */}
          <div style={{ background:`linear-gradient(135deg,${C.accentL},#F0F8F4)`, border:`1px solid ${C.accentM}44`, borderRadius:16, padding:"22px 24px", marginBottom:28 }}>
            <div style={{ fontSize:11, fontWeight:700, color:C.accent, marginBottom:12, letterSpacing:"0.06em" }}>次のステップ</div>
            <p style={{ fontSize:14, color:C.sub, lineHeight:1.8, marginBottom:16 }}>
              この結果を起点に、もう少し深く自己理解を進めてみませんか？
              次のステップでは、AIとの対話を通じて、さらに詳しく言語化できます。
            </p>
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              <button onClick={restart}
                style={{ width:"100%", padding:"13px", background:C.accent, color:"#fff", border:"none", borderRadius:12, fontSize:14, fontWeight:700, cursor:"pointer", boxShadow:`0 3px 12px rgba(45,106,79,0.25)` }}>
                もう一度やってみる
              </button>
              <button onClick={startPhase2}
                style={{ width:"100%", padding:"13px", background:"transparent", border:`1.5px solid ${C.accent}`, borderRadius:12, fontSize:14, fontWeight:600, color:C.accent, cursor:"pointer" }}>
                AIと対話してもっと深掘りする <ChevronRight size={15} style={{ display:"inline", verticalAlign:"middle" }}/>
              </button>
            </div>
          </div>

          {/* 回答のふりかえり */}
          <details style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:14, padding:"16px 20px" }}>
            <summary style={{ fontSize:13, fontWeight:600, color:C.sub, cursor:"pointer", listStyle:"none", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <span>あなたの回答を見る</span>
              <span style={{ color:C.muted, fontSize:12 }}>▼</span>
            </summary>
            <div style={{ marginTop:16, display:"flex", flexDirection:"column", gap:14 }}>
              {answers.map((ans, i) => (
                <div key={i}>
                  <div style={{ fontSize:12, color:C.muted, marginBottom:4 }}>{ans.q}</div>
                  <div style={{ fontSize:14, color:C.sub, background:C.bg, padding:"10px 14px", borderRadius:10, border:`1px solid ${C.border}` }}>
                    {ans.a}
                  </div>
                </div>
              ))}
            </div>
          </details>

        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════
  // PHASE 2 CHAT
  // ══════════════════════════════════════════════════════════
  if (page === "p2_chat") {
    const chatEndRef = { current: null };
    return (
      <div style={{ minHeight:"100vh", background:C.bg, fontFamily:F, display:"flex", flexDirection:"column" }}>
        <GlobalStyles/>
        {/* ヘッダー */}
        <nav style={{ background:C.surface, borderBottom:`1px solid ${C.border}`, padding:"0 20px", display:"flex", alignItems:"center", justifyContent:"space-between", height:52, position:"sticky", top:0, zIndex:100, boxShadow:C.shadow, flexShrink:0 }}>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <button onClick={()=>setPage("result")} style={{ background:"none", border:"none", cursor:"pointer", color:C.muted, padding:4, display:"flex", alignItems:"center" }}>
              <ArrowLeft size={20}/>
            </button>
            <div>
              <div style={{ fontSize:13, fontWeight:700, color:C.accent }}>STEP 2 · 深掘り対話</div>
              <div style={{ fontSize:11, color:C.muted }}>{p2turn}/6 往復</div>
            </div>
          </div>
          {p2done && (
            <button onClick={generateP2Result}
              style={{ padding:"6px 14px", background:C.accent, color:"#fff", border:"none", borderRadius:8, fontSize:13, fontWeight:700, cursor:"pointer" }}>
              まとめる <ChevronRight size={14} style={{ display:"inline", verticalAlign:"middle" }}/>
            </button>
          )}
        </nav>

        {/* プログレス */}
        <div style={{ background:C.border, height:3 }}>
          <div style={{ width:`${Math.min(100, (p2turn/6)*100)}%`, height:"100%", background:`linear-gradient(90deg,${C.accent},${C.accentM})`, transition:"width 0.5s ease" }}/>
        </div>

        {/* チャットエリア */}
        <div style={{ flex:1, overflowY:"auto", WebkitOverflowScrolling:"touch", padding:"20px 16px 12px" }}>
          <div style={{ maxWidth:520, margin:"0 auto", display:"flex", flexDirection:"column", gap:14 }}>

            {/* フェーズ①結果の要約 */}
            {(result || savedResult?.result) && (() => {
              const r = result || savedResult?.result;
              return (
                <div style={{ padding:"14px 16px", background:C.accentL, borderRadius:12, border:`1px solid ${C.accentM}33`, marginBottom:4 }}>
                  <div style={{ fontSize:11, fontWeight:700, color:C.accent, marginBottom:8, letterSpacing:"0.06em" }}>フェーズ①の結果</div>
                  <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                    {[...(r.strengths||[]).slice(0,2), ...(r.values||[]).slice(0,1)].map((item,i)=>(
                      <span key={i} style={{ fontSize:12, padding:"3px 10px", borderRadius:20, background:C.surface, border:`1px solid ${C.border}`, color:C.sub }}>{item}</span>
                    ))}
                  </div>
                </div>
              );
            })()}

            {p2messages.map((msg, i) => (
              <div key={i} style={{ display:"flex", flexDirection:msg.role==="user"?"row-reverse":"row", gap:8, alignItems:"flex-end" }}>
                {msg.role === "assistant" && (
                  <div style={{ width:30, height:30, borderRadius:"50%", background:C.accent, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="5" r="3" fill="white"/><path d="M2 14C2 11.2 4.7 9 8 9S14 11.2 14 14" stroke="white" strokeWidth="1.5" strokeLinecap="round"/></svg>
                  </div>
                )}
                <div style={{
                  maxWidth:"80%", padding:"12px 14px",
                  borderRadius: msg.role==="user" ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
                  background: msg.role==="user" ? C.accent : C.surface,
                  color: msg.role==="user" ? "#fff" : C.text,
                  fontSize:14, lineHeight:1.8, boxShadow:C.shadow,
                  border: msg.role==="user" ? "none" : `1px solid ${C.border}`,
                  whiteSpace:"pre-wrap",
                }}>
                  {msg.content}
                  {msg.role==="assistant" && p2typing && i===p2messages.length-1 && msg.content && (
                    <span style={{ display:"inline-block", width:2, height:13, background:C.accent, marginLeft:2, animation:"blink 0.8s infinite", verticalAlign:"middle" }}/>
                  )}
                </div>
              </div>
            ))}

            {p2typing && p2messages[p2messages.length-1]?.content==="" && (
              <div style={{ display:"flex", gap:8, alignItems:"flex-end" }}>
                <div style={{ width:30, height:30, borderRadius:"50%", background:C.accent, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="5" r="3" fill="white"/><path d="M2 14C2 11.2 4.7 9 8 9S14 11.2 14 14" stroke="white" strokeWidth="1.5" strokeLinecap="round"/></svg>
                </div>
                <div style={{ padding:"12px 16px", borderRadius:"14px 14px 14px 4px", background:C.surface, border:`1px solid ${C.border}`, display:"flex", gap:4, alignItems:"center" }}>
                  {[0,1,2].map(i=><div key={i} style={{ width:6, height:6, borderRadius:"50%", background:C.muted, animation:`blink 1.2s ${i*0.3}s infinite` }}/>)}
                </div>
              </div>
            )}

            {p2done && (
              <div style={{ background:`linear-gradient(135deg,${C.accentL},#F0F8F4)`, border:`1px solid ${C.accentM}44`, borderRadius:14, padding:"18px 20px", textAlign:"center" }}>
                <div style={{ fontSize:14, fontWeight:600, color:C.accent, marginBottom:10 }}>対話が十分になりました</div>
                <button onClick={generateP2Result}
                  style={{ width:"100%", padding:"13px", background:C.accent, color:"#fff", border:"none", borderRadius:12, fontSize:14, fontWeight:700, cursor:"pointer", boxShadow:`0 3px 12px rgba(45,106,79,0.25)` }}>
                  結果をまとめる <ChevronRight size={15} style={{ display:"inline", verticalAlign:"middle" }}/>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* 入力エリア */}
        {!p2done && (
          <div style={{ background:C.surface, borderTop:`1px solid ${C.border}`, padding:"12px 16px", flexShrink:0 }}>
            <div style={{ maxWidth:520, margin:"0 auto", display:"flex", gap:8, alignItems:"flex-end" }}>
              <textarea value={p2input} onChange={e=>setP2input(e.target.value)}
                onKeyDown={e=>{ if(e.key==="Enter"&&(e.ctrlKey||e.metaKey)){ e.preventDefault(); sendP2Message(); } }}
                placeholder="思っていることを自由に...（Ctrl+Enterで送信）"
                disabled={p2typing}
                style={{ flex:1, padding:"10px 14px", background:C.bg, border:`1px solid ${C.border}`, borderRadius:12, fontSize:14, lineHeight:1.6, resize:"none", minHeight:44, maxHeight:100, color:C.text, outline:"none", fontFamily:F }}/>
              <button onClick={sendP2Message} disabled={p2typing||!p2input.trim()}
                style={{ width:44, height:44, borderRadius:12, background:p2input.trim()&&!p2typing?C.accent:C.border, border:"none", color:"#fff", cursor:p2input.trim()&&!p2typing?"pointer":"not-allowed", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center", transition:"background 0.15s" }}>
                <Send size={18}/>
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════
  // PHASE 2 LOADING
  // ══════════════════════════════════════════════════════════
  if (page === "p2_loading") return (
    <div style={{ minHeight:"100vh", background:C.bg, fontFamily:F, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", textAlign:"center", padding:"40px 24px" }}>
      <GlobalStyles/>
      <div style={{ width:52, height:52, border:`3px solid ${C.border}`, borderTopColor:C.accent, borderRadius:"50%", animation:"spin 0.9s linear infinite", marginBottom:28 }}/>
      <h2 style={{ fontSize:20, fontWeight:700, color:C.text, marginBottom:10 }}>あなたの言葉を整理しています</h2>
      <p style={{ color:C.sub, fontSize:14, lineHeight:1.8 }}>対話の内容から、<br/>キャリアの軸・自己PRを言語化しています。</p>
    </div>
  );

  // ══════════════════════════════════════════════════════════
  // PHASE 2 RESULT
  // ══════════════════════════════════════════════════════════
  if (page === "p2_result") {
    const r2 = p2result;
    if (!r2) return null;
    return (
      <div style={{ minHeight:"100vh", background:C.bg, fontFamily:F }}>
        <GlobalStyles/>
        <nav style={{ background:C.surface, borderBottom:`1px solid ${C.border}`, padding:"0 20px", display:"flex", alignItems:"center", height:52, position:"sticky", top:0, zIndex:100, boxShadow:C.shadow }}>
          <div onClick={()=>setPage("home")} style={{ cursor:"pointer", display:"flex", alignItems:"center", gap:8 }}>
            <div style={{ width:26, height:26, background:C.accent, borderRadius:6, display:"flex", alignItems:"center", justifyContent:"center" }}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 11L5 4L7 9L9 6L12 11" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </div>
            <span style={{ fontWeight:800, fontSize:15, color:C.text }}>PathNote</span>
          </div>
        </nav>

        <div style={{ maxWidth:560, margin:"0 auto", padding:"32px 20px 56px", animation:"fadeUp 0.4s ease" }}>

          {/* キーワード */}
          <div style={{ textAlign:"center", marginBottom:28 }}>
            <div style={{ fontSize:10, fontWeight:700, color:C.muted, letterSpacing:"0.1em", marginBottom:10 }}>STEP 2 完了 · あなたを表すと</div>
            <div style={{ display:"inline-block", padding:"10px 28px", background:C.accent, color:"#fff", borderRadius:40, fontSize:20, fontWeight:800, boxShadow:`0 4px 20px rgba(45,106,79,0.25)` }}>
              {r2.keyword}
            </div>
          </div>

          {/* AIメッセージ */}
          <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:16, padding:"22px 24px", marginBottom:16, boxShadow:C.shadow }}>
            <div style={{ fontSize:11, fontWeight:700, color:C.accentM, marginBottom:10, letterSpacing:"0.06em" }}>AIからのメッセージ</div>
            <p style={{ fontSize:15, color:C.text, lineHeight:1.9, fontWeight:500 }}>{r2.message}</p>
          </div>

          {/* キャリアの軸 */}
          <div style={{ background:`linear-gradient(135deg,${C.accentL},#F0F8F4)`, border:`1px solid ${C.accentM}44`, borderRadius:16, padding:"20px 22px", marginBottom:14 }}>
            <div style={{ fontSize:11, fontWeight:700, color:C.accent, marginBottom:10, letterSpacing:"0.06em" }}>キャリアの軸</div>
            <p style={{ fontSize:15, color:C.text, lineHeight:1.9, fontWeight:600 }}>{r2.axis}</p>
          </div>

          <SectionCard title="強み" color={C.accent} items={r2.strengths}
            icon={<svg width="15" height="15" viewBox="0 0 15 15" fill="none"><path d="M7.5 1L9.5 5.5L14.5 6L11 9.5L12 14.5L7.5 12L3 14.5L4 9.5L0.5 6L5.5 5.5L7.5 1Z" fill={C.accent}/></svg>}
          />
          <SectionCard title="大切にしていること" color={C.warm} items={r2.values}
            icon={<svg width="15" height="15" viewBox="0 0 15 15" fill="none"><path d="M7.5 13S2 9 2 5.5C2 3.5 3.5 2 5.5 2C6.5 2 7.5 2.8 7.5 2.8S8.5 2 9.5 2C11.5 2 13 3.5 13 5.5C13 9 7.5 13 7.5 13Z" fill={C.warm}/></svg>}
          />
          <SectionCard title="向かいたい方向" color="#7B5EA7" items={r2.wants}
            icon={<svg width="15" height="15" viewBox="0 0 15 15" fill="none"><path d="M2 7.5H13M9 3.5L13 7.5L9 11.5" stroke="#7B5EA7" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
          />

          {/* 自己PR */}
          <div style={{ background:"#FDF3EA", border:`1px solid ${C.warm}44`, borderRadius:16, padding:"20px 22px", marginBottom:14 }}>
            <div style={{ fontSize:11, fontWeight:700, color:C.warm, marginBottom:10, letterSpacing:"0.06em" }}>自己PRのベース</div>
            <p style={{ fontSize:14, color:C.text, lineHeight:1.9 }}>{r2.selfpr}</p>
            <div style={{ fontSize:11, color:C.muted, marginTop:8 }}>※このテキストをベースに仕上げてください</div>
          </div>

          {/* キャリアの方向性 */}
          <div style={{ background:C.surface, border:`1.5px solid ${C.accentM}`, borderRadius:16, padding:"20px 22px", marginBottom:14 }}>
            <div style={{ fontSize:11, fontWeight:700, color:C.accentM, marginBottom:14, letterSpacing:"0.06em" }}>あなたに合っているキャリアの方向性</div>
            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
              {(r2.careerDirection||[r2.action]).filter(Boolean).map((item, i)=>{
                const [job, ...rest] = item.split("（");
                const reason = rest.join("（").replace(/）$/, "");
                return (
                  <div key={i} style={{ padding:"12px 14px", background:C.accentL, borderRadius:10, border:`1px solid ${C.accentM}33` }}>
                    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom: reason?6:0 }}>
                      <div style={{ width:20, height:20, borderRadius:"50%", background:C.accent, color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:800, flexShrink:0 }}>{i+1}</div>
                      <span style={{ fontSize:14, fontWeight:700, color:C.text }}>{job.trim()}</span>
                    </div>
                    {reason && <p style={{ fontSize:12, color:C.sub, lineHeight:1.7, marginLeft:28 }}>{reason}</p>}
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            <button onClick={()=>{
              // マイページに保存
              const existing = load() || {};
              const sessions = existing.sessions || [];
              const newSession = {
                id: Date.now().toString(),
                createdAt: new Date().toISOString(),
                type: "phase2",
                p1result: result || savedResult?.result,
                p2result: r2,
                p2messages,
                p1answers: savedResult?.answers || answers,
              };
              const updated = { ...existing, sessions: [newSession, ...sessions], latestP2: r2, savedAt: new Date().toISOString() };
              save(updated);
              setSavedResult(updated);
              setPage("mypage");
            }}
              style={{ width:"100%", padding:"14px", background:C.accent, color:"#fff", border:"none", borderRadius:12, fontSize:15, fontWeight:700, cursor:"pointer", boxShadow:`0 3px 12px rgba(45,106,79,0.25)`, display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
              <Save size={16}/> 保存してマイページへ
            </button>
            <button onClick={()=>setPage("p2_chat")}
              style={{ width:"100%", padding:"13px", background:"transparent", border:`1.5px solid ${C.border}`, borderRadius:12, fontSize:14, color:C.sub, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}>
              <ArrowLeft size={15}/> 対話に戻る
            </button>
            <button onClick={restart}
              style={{ width:"100%", padding:"13px", background:"transparent", border:"none", borderRadius:12, fontSize:13, color:C.muted, cursor:"pointer" }}>
              最初からやり直す
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════
  // MYPAGE
  // ══════════════════════════════════════════════════════════
  if (page === "mypage") return <MyPage
    data={load()||{}}
    onBack={()=>setPage("home")}
    onRestart={restart}
    onNewSession={(themeId)=>{
      if (themeId) {
        // テーマ選択済み → フェーズ②へ直接
        setP2messages([]); setP2turn(0); setP2done(false); setP2result(null);
        setPage("p2_chat");
        // startPhase2相当の処理をthemeIdで実行
        (async () => {
          setP2typing(true);
          const r = load()?.latestP2 || load()?.result;
          const context = r ? `これまでの結果：強み「${(r.strengths||[]).join("・")}」、価値観「${(r.values||[]).join("・")}」` : "";
          const themeLabel = THEMES_P2_LABELS[themeId] || "自由";
          const sys = `あなたはキャリアの自己理解を助けるコーチです。
テーマ：「${themeLabel}」について話を聞きます。
${context}
ルール：1回に質問1つ・話し言葉・2〜3文・ミラーリング・アドバイスなし・必ず疑問文で終わる
最初の一言：テーマに沿って、温かく自然な入り口の質問を1つだけしてください。`;
          try {
            const firstMsg = await callAIStream_p2(
              [{ role:"system", content:sys }, { role:"user", content:"お願いします。" }],
              (partial) => setP2messages([{ role:"assistant", content:partial }])
            );
            setP2messages([{ role:"assistant", content:firstMsg }]);
          } catch { setP2messages([{ role:"assistant", content:"申し訳ありません。もう一度お試しください。" }]); }
          setP2typing(false);
        })();
      } else {
        setStep(0); setAnswers([]); setPage("quiz");
      }
    }}
    onViewSession={(s)=>{ setP2messages(s.p2messages||[]); setP2result(s.p2result); setPage("session_detail"); }}
  />;

  if (page === "session_detail") return <SessionDetail
    messages={p2messages}
    result={p2result}
    onBack={()=>setPage("mypage")}
    GlobalStyles={GlobalStyles}
  />;

  return null;
}

// ══════════════════════════════════════════════════════════
// MYPAGE COMPONENT
// ══════════════════════════════════════════════════════════

// テーマ定義（フェーズ②用）
const THEMES_P2 = [
  { id:"moyo",     color:"#7B2FBE", label:"仕事のもやもや",           desc:"今感じている違和感・不満を整理したい" },
  { id:"tsuyomi",  color:"#2D6A4F", label:"自分の強みを知りたい",     desc:"自分でも気づいていない得意なことを探したい" },
  { id:"taisetu",  color:"#C9742B", label:"大切にしていること",        desc:"仕事を通じて何を大事にしているか言語化したい" },
  { id:"career",   color:"#1565C0", label:"これからのキャリア",       desc:"将来どんな方向に進みたいか考えたい" },
  { id:"tensyoku", color:"#4361EE", label:"転職について",             desc:"転職の軸・方向性・不安を整理したい" },
  { id:"free",     color:"#555550", label:"自由に話したい",           desc:"テーマを決めずに今感じていることを話したい" },
];

const SKILL_CATS_MP = [
  { label:"コミュニケーション", color:"#4361EE", skills:["プレゼンテーション","交渉・説得","ヒアリング","文章作成","語学（英語）","ファシリテーション","クレーム対応","電話・メール対応"] },
  { label:"思考・分析",         color:"#7B2FBE", skills:["論理的思考","データ分析","課題発見","企画立案","リサーチ","数値管理","問題解決"] },
  { label:"マネジメント",       color:"#C9742B", skills:["チームマネジメント","プロジェクト管理","目標設定","育成・コーチング","採用","予算管理","リスク管理"] },
  { label:"クリエイティブ",     color:"#E91E8C", skills:["デザイン思考","グラフィック","映像・動画","コピーライティング","SNS運用","ブランディング","写真・撮影"] },
  { label:"営業・マーケ",       color:"#FF6B35", skills:["営業","マーケティング","集客・広告","顧客管理(CRM)","市場調査","SNSマーケ","コンテンツ制作"] },
  { label:"専門・技術",         color:"#27A96C", skills:["IT・プログラミング","財務・会計","法務","医療・介護","教育・研修","建築・設計","製造・品質管理"] },
  { label:"ビジネス基礎",       color:"#6B8CFF", skills:["Excel","Word","PowerPoint","資料作成","スケジュール管理","議事録作成","事務処理","業務改善"] },
];
const YEAR_OPTS = ["半年未満","半年〜1年","1〜3年","3〜5年","5年以上"];

function MyPage({ data, onBack, onRestart, onNewSession, onViewSession }) {
  const [tab, setTab] = useState("note");
  const [showCareerForm, setShowCareerForm] = useState(false);
  const [showThemeSelect, setShowThemeSelect] = useState(false);
  const [careers, setCareers] = useState(data.careers || []);
  const [skillMap, setSkillMap] = useState(data.skillMap || {}); // {skillName: years}
  const [newCareer, setNewCareer] = useState({ company:"", period:"", role:"", notes:"" });

  const sessions = data.sessions || [];
  const latest = data.latestP2 || sessions[0]?.p2result || null;

  const addCareer = () => {
    if (!newCareer.company && !newCareer.role) return;
    const updated = [...careers, { ...newCareer, id: Date.now().toString() }];
    setCareers(updated);
    setNewCareer({ company:"", period:"", role:"", notes:"" });
    const existing = load() || {};
    save({ ...existing, careers: updated });
  };

  const removeCareer = (id) => {
    const updated = careers.filter(c=>c.id!==id);
    setCareers(updated);
    const existing = load() || {};
    save({ ...existing, careers: updated });
  };

  const toggleSkill = (skill) => {
    const updated = { ...skillMap };
    if (updated[skill]) delete updated[skill];
    else updated[skill] = "1〜3年";
    setSkillMap(updated);
    const existing = load() || {};
    save({ ...existing, skillMap: updated });
  };

  const setYears = (skill, years) => {
    const updated = { ...skillMap, [skill]: years };
    setSkillMap(updated);
    const existing = load() || {};
    save({ ...existing, skillMap: updated });
  };

  const IS = { width:"100%", padding:"10px 14px", background:C.bg, border:`1px solid ${C.border}`, borderRadius:10, color:C.text, fontSize:14, fontFamily:F, outline:"none" };
  const TABS = [
    { id:"note", label:"キャリアノート" },
    { id:"log",  label:"対話ログ" },
    { id:"profile", label:"職歴・スキル" },
  ];

  return (
    <div style={{ minHeight:"100vh", background:C.bg, fontFamily:F }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;600;700;800&family=DM+Mono:wght@400;500&display=swap');
        @keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
        @keyframes spin{to{transform:rotate(360deg)}}
        *{box-sizing:border-box;margin:0;padding:0}
        body{background:${C.bg};font-family:${F}}
        button{font-family:${F}}
        input,textarea{font-family:${F}}
        ::-webkit-scrollbar{width:4px}
        ::-webkit-scrollbar-thumb{background:${C.border};border-radius:2px}
      `}</style>

      {/* テーマ選択モーダル */}
      {showThemeSelect && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.45)", zIndex:200, display:"flex", alignItems:"flex-end", justifyContent:"center" }}
          onClick={()=>setShowThemeSelect(false)}>
          <div style={{ background:C.surface, borderRadius:"20px 20px 0 0", padding:"24px 20px 40px", width:"100%", maxWidth:560, maxHeight:"80vh", overflowY:"auto" }}
            onClick={e=>e.stopPropagation()}>
            <div style={{ textAlign:"center", marginBottom:20 }}>
              <div style={{ width:36, height:4, borderRadius:2, background:C.border, margin:"0 auto 16px" }}/>
              <div style={{ fontSize:15, fontWeight:700, color:C.text }}>今日はどんなことを話しますか？</div>
              <div style={{ fontSize:12, color:C.muted, marginTop:4 }}>テーマを選ぶとAI対話が始まります</div>
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              {THEMES_P2.map(theme=>(
                <button key={theme.id} onClick={()=>{ setShowThemeSelect(false); onNewSession(theme.id); }}
                  style={{ textAlign:"left", padding:"14px 16px", background:C.bg, border:`1.5px solid ${C.border}`, borderRadius:12, cursor:"pointer", fontFamily:F, display:"flex", alignItems:"center", gap:12, transition:"all 0.15s" }}>
                  <div style={{ width:10, height:10, borderRadius:"50%", background:theme.color, flexShrink:0 }}/>
                  <div>
                    <div style={{ fontWeight:700, fontSize:14, color:theme.color, marginBottom:2 }}>{theme.label}</div>
                    <div style={{ fontSize:12, color:C.muted }}>{theme.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      <nav style={{ background:C.surface, borderBottom:`1px solid ${C.border}`, padding:"0 20px", display:"flex", alignItems:"center", justifyContent:"space-between", height:52, position:"sticky", top:0, zIndex:100, boxShadow:C.shadow }}>
        <div onClick={onBack} style={{ cursor:"pointer", display:"flex", alignItems:"center", gap:8 }}>
          <div style={{ width:26, height:26, background:C.accent, borderRadius:6, display:"flex", alignItems:"center", justifyContent:"center" }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 11L5 4L7 9L9 6L12 11" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </div>
          <span style={{ fontWeight:800, fontSize:15, color:C.text }}>PathNote</span>
        </div>
        <button onClick={()=>setShowThemeSelect(true)}
          style={{ padding:"6px 14px", background:C.accent, color:"#fff", border:"none", borderRadius:8, fontSize:13, fontWeight:600, cursor:"pointer" }}>
          + 新しい対話
        </button>
      </nav>

      <div style={{ maxWidth:600, margin:"0 auto", padding:"24px 20px 56px" }}>
        <div style={{ marginBottom:24 }}>
          <div style={{ fontSize:11, fontWeight:700, color:C.muted, letterSpacing:"0.1em", marginBottom:4 }}>MY PAGE</div>
          <h1 style={{ fontSize:20, fontWeight:800, color:C.text }}>マイキャリアノート</h1>
          {data.savedAt && <div style={{ fontSize:12, color:C.muted, marginTop:4 }}>最終更新：{new Date(data.savedAt).toLocaleDateString("ja-JP")}</div>}
        </div>

        {/* タブ */}
        <div style={{ display:"flex", borderBottom:`2px solid ${C.border}`, marginBottom:24, overflowX:"auto", WebkitOverflowScrolling:"touch" }}>
          {TABS.map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)}
              style={{ padding:"10px 18px", background:"transparent", border:"none", borderBottom:`2px solid ${tab===t.id?C.accent:"transparent"}`, marginBottom:"-2px", color:tab===t.id?C.accent:C.muted, cursor:"pointer", fontSize:13, fontWeight:tab===t.id?700:400, whiteSpace:"nowrap", flexShrink:0, transition:"all 0.2s" }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ══ キャリアノート ══ */}
        {tab === "note" && (
          <div style={{ animation:"fadeUp 0.3s ease" }}>
            {latest ? (
              <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
                {/* キーワード */}
                <div style={{ textAlign:"center", padding:"24px", background:C.surface, border:`1px solid ${C.border}`, borderRadius:16, boxShadow:C.shadow }}>
                  <div style={{ fontSize:11, color:C.muted, marginBottom:10, letterSpacing:"0.08em" }}>あなたを表すキーワード</div>
                  <div style={{ display:"inline-block", padding:"8px 24px", background:C.accent, color:"#fff", borderRadius:30, fontSize:18, fontWeight:800 }}>
                    {latest.keyword}
                  </div>
                </div>

                {/* キャリアの軸 */}
                {latest.axis && (
                  <div style={{ background:`linear-gradient(135deg,${C.accentL},#F0F8F4)`, border:`1px solid ${C.accentM}33`, borderRadius:14, padding:"18px 20px" }}>
                    <div style={{ fontSize:11, fontWeight:700, color:C.accent, marginBottom:8, letterSpacing:"0.06em" }}>キャリアの軸</div>
                    <p style={{ fontSize:14, color:C.text, lineHeight:1.9, fontWeight:600 }}>{latest.axis}</p>
                  </div>
                )}

                {/* 強み */}
                <NoteSectionCard title="強み" color={C.accent} items={latest.strengths}/>

                {/* 価値観 */}
                <NoteSectionCard title="大切にしていること" color={C.warm} items={latest.values}/>

                {/* 向かいたい方向 */}
                <NoteSectionCard title="向かいたい方向" color="#7B5EA7" items={latest.wants}/>

                {/* キャリアの方向性 */}
                {(latest.careerDirection||[latest.action]).filter(Boolean).length > 0 && (
                  <div style={{ background:C.surface, border:`1.5px solid ${C.accentM}44`, borderRadius:14, padding:"18px 20px" }}>
                    <div style={{ fontSize:11, fontWeight:700, color:C.accentM, marginBottom:12, letterSpacing:"0.06em" }}>あなたに合っているキャリアの方向性</div>
                    <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                      {(latest.careerDirection||[latest.action]).filter(Boolean).map((item, i)=>{
                        const [job, ...rest] = item.split("（");
                        const reason = rest.join("（").replace(/）$/, "");
                        return (
                          <div key={i} style={{ padding:"10px 12px", background:C.accentL, borderRadius:8, border:`1px solid ${C.accentM}22` }}>
                            <div style={{ display:"flex", alignItems:"center", gap:7, marginBottom: reason?4:0 }}>
                              <div style={{ width:18, height:18, borderRadius:"50%", background:C.accent, color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, fontWeight:800, flexShrink:0 }}>{i+1}</div>
                              <span style={{ fontSize:13, fontWeight:700, color:C.text }}>{job.trim()}</span>
                            </div>
                            {reason && <p style={{ fontSize:12, color:C.sub, lineHeight:1.6, marginLeft:25 }}>{reason}</p>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 自己PR */}
                {latest.selfpr && (
                  <div style={{ background:C.warmL, border:`1px solid ${C.warm}33`, borderRadius:14, padding:"18px 20px" }}>
                    <div style={{ fontSize:11, fontWeight:700, color:C.warm, marginBottom:8, letterSpacing:"0.06em" }}>自己PRのベース</div>
                    <p style={{ fontSize:14, color:C.text, lineHeight:1.9 }}>{latest.selfpr}</p>
                    <div style={{ fontSize:11, color:C.muted, marginTop:8 }}>※このテキストをベースに仕上げてください</div>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ textAlign:"center", padding:"48px 24px", background:C.surface, borderRadius:16, border:`1px solid ${C.border}` }}>
                <div style={{ display:"flex", justifyContent:"center", marginBottom:16 }}>
                <BookOpen size={48} color={C.border} strokeWidth={1}/>
              </div>
                <div style={{ fontSize:16, fontWeight:700, color:C.text, marginBottom:8 }}>まだデータがありません</div>
                <p style={{ fontSize:14, color:C.sub, lineHeight:1.8, marginBottom:24 }}>診断を完了するとここに<br/>キャリアノートが表示されます。</p>
                <button onClick={onNewSession}
                  style={{ padding:"12px 28px", background:C.accent, color:"#fff", border:"none", borderRadius:12, fontSize:14, fontWeight:700, cursor:"pointer" }}>
                  診断を始める
                </button>
              </div>
            )}
          </div>
        )}

        {/* ══ 対話ログ ══ */}
        {tab === "log" && (
          <div style={{ animation:"fadeUp 0.3s ease" }}>
            {sessions.length === 0 ? (
              <div style={{ textAlign:"center", padding:"48px 24px", background:C.surface, borderRadius:16, border:`1px solid ${C.border}` }}>
                <div style={{ display:"flex", justifyContent:"center", marginBottom:16 }}>
                <MessageCircle size={48} color={C.border} strokeWidth={1}/>
              </div>
                <div style={{ fontSize:16, fontWeight:700, color:C.text, marginBottom:8 }}>対話ログがありません</div>
                <p style={{ fontSize:14, color:C.sub, lineHeight:1.8, marginBottom:24 }}>AI対話を行うとここに履歴が残ります。</p>
                <button onClick={onNewSession}
                  style={{ padding:"12px 28px", background:C.accent, color:"#fff", border:"none", borderRadius:12, fontSize:14, fontWeight:700, cursor:"pointer" }}>
                  診断を始める
                </button>
              </div>
            ) : (
              <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                {sessions.map((s, i) => (
                  <div key={s.id} style={{ background:C.surface, border:`1px solid ${i===0?C.accentM+"66":C.border}`, borderRadius:14, padding:"18px 20px", boxShadow:C.shadow }}>
                    <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:12, flexWrap:"wrap" }}>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
                          {i===0 && <span style={{ fontSize:10, padding:"2px 8px", borderRadius:10, background:C.accent, color:"#fff", fontWeight:700 }}>最新</span>}
                          <span style={{ fontSize:12, color:C.muted, fontFamily:FM }}>
                            {new Date(s.createdAt).toLocaleDateString("ja-JP", { year:"numeric", month:"long", day:"numeric", hour:"2-digit", minute:"2-digit" })}
                          </span>
                        </div>
                        {s.p2result?.keyword && (
                          <div style={{ fontSize:15, fontWeight:700, color:C.text, marginBottom:6 }}>「{s.p2result.keyword}」</div>
                        )}
                        <div style={{ fontSize:12, color:C.sub }}>
                          AI対話 {(s.p2messages||[]).filter(m=>m.role==="user").length}往復
                        </div>
                        {/* 強みプレビュー */}
                        {(s.p2result?.strengths||[]).length > 0 && (
                          <div style={{ display:"flex", flexWrap:"wrap", gap:5, marginTop:8 }}>
                            {(s.p2result.strengths||[]).slice(0,2).map((str,j)=>(
                              <span key={j} style={{ fontSize:11, padding:"2px 8px", borderRadius:10, background:C.accentL, color:C.accent, border:`1px solid ${C.accentM}33` }}>{str}</span>
                            ))}
                          </div>
                        )}
                      </div>
                      <button onClick={()=>onViewSession(s)}
                        style={{ flexShrink:0, padding:"7px 14px", background:"transparent", border:`1px solid ${C.border}`, borderRadius:8, color:C.sub, cursor:"pointer", fontSize:12, whiteSpace:"nowrap", display:"flex", alignItems:"center", gap:4 }}>
                        詳細を見る <ChevronRight size={13}/>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ══ 職歴・スキル ══ */}
        {tab === "profile" && (
          <div style={{ animation:"fadeUp 0.3s ease", display:"flex", flexDirection:"column", gap:20 }}>

            {/* 職歴 */}
            <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:16, padding:"20px", boxShadow:C.shadow }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
                <div style={{ fontSize:15, fontWeight:700, color:C.text }}>職歴</div>
                <button onClick={()=>setShowCareerForm(f=>!f)}
                  style={{ padding:"5px 12px", background:C.accentL, border:`1px solid ${C.accentM}44`, borderRadius:8, color:C.accent, cursor:"pointer", fontSize:12, fontWeight:600 }}>
                  {showCareerForm?"閉じる":"+ 追加"}
                </button>
              </div>

              {/* 年表 */}
              {careers.length > 0 && (
                <div style={{ position:"relative", marginBottom:showCareerForm?20:0 }}>
                  <div style={{ position:"absolute", left:10, top:0, bottom:0, width:2, background:`linear-gradient(to bottom,${C.accent},${C.accentM})`, borderRadius:2 }}/>
                  <div style={{ display:"flex", flexDirection:"column", gap:0 }}>
                    {careers.map((c, i) => (
                      <div key={c.id} style={{ display:"flex", gap:0, paddingBottom: i<careers.length-1?20:0 }}>
                        <div style={{ width:24, flexShrink:0, display:"flex", justifyContent:"center", paddingTop:14 }}>
                          <div style={{ width:14, height:14, borderRadius:"50%", background:i===0?C.accent:C.surface, border:`2px solid ${i===0?C.accent:C.accentM}`, zIndex:1 }}/>
                        </div>
                        <div style={{ flex:1, background:i===0?C.accentL:C.bg, border:`1px solid ${i===0?C.accentM+"44":C.border}`, borderRadius:12, padding:"12px 14px" }}>
                          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                            <div>
                              <div style={{ fontWeight:700, fontSize:14, color:C.text }}>{c.company}</div>
                              {c.period && <div style={{ fontSize:11, color:C.muted, fontFamily:FM, marginTop:2 }}>{c.period}</div>}
                              {c.role && <div style={{ fontSize:13, color:C.sub, marginTop:4, fontWeight:500 }}>{c.role}</div>}
                              {c.notes && <div style={{ fontSize:12, color:C.muted, marginTop:6, lineHeight:1.6 }}>{c.notes}</div>}
                            </div>
                            <button onClick={()=>removeCareer(c.id)}
                              style={{ background:"none", border:"none", color:C.muted, cursor:"pointer", fontSize:16, padding:4, flexShrink:0 }}>×</button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 職歴追加フォーム */}
              {showCareerForm && (
                <div style={{ background:C.bg, borderRadius:12, padding:"16px", border:`1px solid ${C.border}`, display:"flex", flexDirection:"column", gap:10 }}>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                    <div>
                      <label style={{ fontSize:11, fontWeight:600, color:C.muted, display:"block", marginBottom:4 }}>会社名</label>
                      <input value={newCareer.company} onChange={e=>setNewCareer(p=>({...p,company:e.target.value}))} placeholder="株式会社〇〇" style={IS}/>
                    </div>
                    <div>
                      <label style={{ fontSize:11, fontWeight:600, color:C.muted, display:"block", marginBottom:4 }}>在籍期間</label>
                      <input value={newCareer.period} onChange={e=>setNewCareer(p=>({...p,period:e.target.value}))} placeholder="2020〜2023" style={IS}/>
                    </div>
                  </div>
                  <div>
                    <label style={{ fontSize:11, fontWeight:600, color:C.muted, display:"block", marginBottom:4 }}>職種・役割</label>
                    <input value={newCareer.role} onChange={e=>setNewCareer(p=>({...p,role:e.target.value}))} placeholder="営業マネージャー" style={IS}/>
                  </div>
                  <div>
                    <label style={{ fontSize:11, fontWeight:600, color:C.muted, display:"block", marginBottom:4 }}>メモ（実績・担当業務）</label>
                    <textarea value={newCareer.notes} onChange={e=>setNewCareer(p=>({...p,notes:e.target.value}))} placeholder="主な実績や担当業務を記入..." style={{...IS, minHeight:60, resize:"none", lineHeight:1.6}}/>
                  </div>
                  <button onClick={addCareer}
                    style={{ width:"100%", padding:"11px", background:C.accent, color:"#fff", border:"none", borderRadius:10, fontSize:14, fontWeight:700, cursor:"pointer" }}>
                    追加する
                  </button>
                </div>
              )}

              {careers.length === 0 && !showCareerForm && (
                <div style={{ textAlign:"center", padding:"20px 0", color:C.muted, fontSize:13 }}>
                  職歴を追加してください
                </div>
              )}
            </div>

            {/* スキル */}
            <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:16, padding:"20px", boxShadow:C.shadow }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
                <div style={{ fontSize:15, fontWeight:700, color:C.text }}>スキル</div>
                <span style={{ fontSize:12, color:C.muted, fontFamily:FM }}>{Object.keys(skillMap).length}個選択中</span>
              </div>
              {SKILL_CATS_MP.map(cat=>(
                <div key={cat.label} style={{ marginBottom:18 }}>
                  <div style={{ fontSize:11, fontWeight:700, color:cat.color, marginBottom:8, letterSpacing:"0.04em" }}>{cat.label}</div>
                  <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                    {cat.skills.map(skill=>{
                      const sel = !!skillMap[skill];
                      return (
                        <div key={skill} style={{ border:`1.5px solid ${sel?cat.color:C.border}`, background:sel?`${cat.color}08`:C.bg, borderRadius:10, padding:"8px 12px", transition:"all 0.15s" }}>
                          <div onClick={()=>toggleSkill(skill)} style={{ display:"flex", alignItems:"center", gap:8, cursor:"pointer", marginBottom:sel?8:0 }}>
                            <div style={{ width:16, height:16, borderRadius:4, border:`2px solid ${sel?cat.color:C.border}`, background:sel?cat.color:"transparent", display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, color:"#fff", flexShrink:0 }}>
                              {sel && "✓"}
                            </div>
                            <span style={{ fontSize:13, color:sel?C.text:C.sub }}>{skill}</span>
                          </div>
                          {sel && (
                            <select value={skillMap[skill]} onChange={e=>setYears(skill,e.target.value)}
                              style={{ width:"100%", padding:"4px 8px", background:C.surface, border:`1px solid ${C.border}`, borderRadius:8, fontSize:12, color:C.sub, fontFamily:FM, outline:"none", cursor:"pointer" }}>
                              {YEAR_OPTS.map(y=><option key={y} value={y}>{y}</option>)}
                            </select>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// SESSION DETAIL COMPONENT
// ══════════════════════════════════════════════════════════
function SessionDetail({ messages, result: r2, onBack, GlobalStyles }) {
  return (
    <div style={{ minHeight:"100vh", background:C.bg, fontFamily:F }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;600;700;800&family=DM+Mono:wght@400;500&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        body{background:${C.bg};font-family:${F}}
      `}</style>
      <nav style={{ background:C.surface, borderBottom:`1px solid ${C.border}`, padding:"0 20px", display:"flex", alignItems:"center", gap:12, height:52, position:"sticky", top:0, zIndex:100, boxShadow:C.shadow }}>
        <button onClick={onBack} style={{ background:"none", border:"none", cursor:"pointer", color:C.muted, display:"flex", padding:4, alignItems:"center" }}>
          <ArrowLeft size={20}/>
        </button>
        <span style={{ fontWeight:700, fontSize:15, color:C.text }}>対話の詳細</span>
      </nav>

      <div style={{ maxWidth:560, margin:"0 auto", padding:"24px 20px 56px" }}>
        {/* 結果サマリー */}
        {r2 && (
          <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:16, padding:"20px", marginBottom:24, boxShadow:C.shadow }}>
            <div style={{ fontSize:11, fontWeight:700, color:C.muted, marginBottom:10, letterSpacing:"0.08em" }}>このセッションの結果</div>
            {r2.keyword && <div style={{ display:"inline-block", padding:"5px 16px", background:C.accent, color:"#fff", borderRadius:20, fontSize:14, fontWeight:800, marginBottom:12 }}>「{r2.keyword}」</div>}
            {r2.axis && <p style={{ fontSize:13, color:C.sub, lineHeight:1.8, marginBottom:10 }}><strong style={{ color:C.text }}>軸：</strong>{r2.axis}</p>}
            {(r2.strengths||[]).length > 0 && (
              <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                {(r2.strengths||[]).map((s,i)=>(
                  <span key={i} style={{ fontSize:11, padding:"2px 9px", borderRadius:10, background:C.accentL, color:C.accent, border:`1px solid ${C.accentM}33` }}>{s}</span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* チャットログ */}
        <div style={{ fontSize:13, fontWeight:700, color:C.sub, marginBottom:12 }}>対話の記録</div>
        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
          {(messages||[]).filter(m=>m.content).map((msg, i) => (
            <div key={i} style={{ display:"flex", flexDirection:msg.role==="user"?"row-reverse":"row", gap:8, alignItems:"flex-end" }}>
              {msg.role==="assistant" && (
                <div style={{ width:28, height:28, borderRadius:"50%", background:C.accent, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="4.5" r="2.5" fill="white"/><path d="M2 12C2 9.8 4.2 8 7 8S12 9.8 12 12" stroke="white" strokeWidth="1.3" strokeLinecap="round"/></svg>
                </div>
              )}
              <div style={{
                maxWidth:"80%", padding:"11px 14px",
                borderRadius: msg.role==="user"?"14px 14px 4px 14px":"14px 14px 14px 4px",
                background: msg.role==="user"?C.accent:C.surface,
                color: msg.role==="user"?"#fff":C.text,
                fontSize:13, lineHeight:1.8, boxShadow:C.shadow,
                border: msg.role==="user"?"none":`1px solid ${C.border}`,
                whiteSpace:"pre-wrap",
              }}>
                {msg.content}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── NoteSectionCard ───────────────────────────────────────────
function NoteSectionCard({ title, color, items }) {
  if (!items || items.length === 0) return null;
  return (
    <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:14, padding:"18px 20px", boxShadow:C.shadow }}>
      <div style={{ fontSize:11, fontWeight:700, color, marginBottom:12, letterSpacing:"0.06em" }}>{title}</div>
      <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
        {items.map((item,i)=>(
          <div key={i} style={{ display:"flex", alignItems:"flex-start", gap:8, padding:"8px 12px", background:`${color}08`, borderRadius:8 }}>
            <span style={{ color, fontWeight:700, fontSize:12, flexShrink:0, marginTop:1 }}>▸</span>
            <span style={{ fontSize:14, color:C.text, lineHeight:1.7, wordBreak:"keep-all" }}>{item}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── SectionCard ───────────────────────────────────────────────
function SectionCard({ title, color, items, icon }) {
  if (!items || items.length === 0) return null;
  return (
    <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:16, padding:"20px 22px", marginBottom:14, boxShadow:`0 1px 6px rgba(0,0,0,0.06)` }}>
      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:14 }}>
        <div style={{ width:24, height:24, borderRadius:6, background:`${color}15`, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
          {icon}
        </div>
        <span style={{ fontSize:13, fontWeight:700, color }}>{title}</span>
      </div>
      <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
        {items.map((item, i) => (
          <div key={i} style={{ display:"flex", alignItems:"flex-start", gap:10, padding:"10px 14px", background:`${color}07`, borderRadius:10 }}>
            <span style={{ color, fontWeight:700, fontSize:13, flexShrink:0, marginTop:1 }}>▸</span>
            <span style={{ fontSize:14, color:"#1C1C1C", lineHeight:1.65, wordBreak:"keep-all" }}>{item}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
