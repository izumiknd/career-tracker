import { useState, useEffect } from "react";

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
    body: JSON.stringify({
      model: "llama-3.1-8b-instant",
      messages,
      temperature: 0.5,
      max_tokens: 800,
    }),
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
  const [page, setPage]       = useState("home");       // home | quiz | loading | result
  const [step, setStep]       = useState(0);            // 0-2
  const [answers, setAnswers] = useState([]);           // {q, a, free?}
  const [freeText, setFreeText] = useState("");
  const [showFree, setShowFree] = useState(false);
  const [result, setResult]   = useState(null);
  const [loading, setLoading] = useState(false);
  const [savedResult, setSavedResult] = useState(null);

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
      const prompt = `以下は自己理解のための3つの質問への回答です。
回答者のことを深く読み取り、JSONのみで返答してください（説明文・コードブロック不要）。

回答:
${answersText}

以下のJSON形式のみで返答:
{"strengths":["強み1（10〜20文字）","強み2","強み3"],"values":["価値観1（10〜20文字）","価値観2","価値観3"],"wants":["やりたいこと1（15〜25文字）","やりたいこと2"],"message":"回答者へのメッセージ（2〜3文。あなたの言葉で、温かく、具体的に）","keyword":"この人を一言で表すキーワード（5〜10文字）"}

ルール:
- strengths：回答から見えた「行動・思考・姿勢」の具体的な強み。3個
- values：大切にしていること・譲れないもの。3個
- wants：この人が向かいたい方向・やりたいこと。2個
- message：「あなたは〜」で始まる、温かみのある2〜3文
- keyword：この人の本質を一言で表す言葉（例：「人を動かす力」「静かな情熱」）
- すべて日本語で、具体的に、冗長にならずに`;

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

  const restart = () => {
    setStep(0);
    setAnswers([]);
    setFreeText("");
    setShowFree(false);
    setResult(null);
    setPage("quiz");
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
      {showResult && savedResult && (
        <button onClick={()=>{ setResult(savedResult.result); setPage("result"); }}
          style={{ background:"none", border:`1px solid ${C.border}`, borderRadius:8, padding:"5px 12px", color:C.sub, cursor:"pointer", fontSize:12 }}>
          結果を見る
        </button>
      )}
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
          はじめる →
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
            { icon:"⚡", text:"3問に答えるだけ。職歴の入力不要" },
            { icon:"🧠", text:"AIがあなたの言葉から強みを読み取る" },
            { icon:"📝", text:"「言語化できた感」が得られる" },
          ].map((item, i) => (
            <div key={i} style={{ display:"flex", alignItems:"center", gap:14, padding:"14px 18px", background:C.surface, border:`1px solid ${C.border}`, borderRadius:12, boxShadow:C.shadow }}>
              <span style={{ fontSize:20, flexShrink:0 }}>{item.icon}</span>
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
                  次へ →
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
              <button onClick={()=>alert("フェーズ②は近日公開予定です！")}
                style={{ width:"100%", padding:"13px", background:"transparent", border:`1.5px solid ${C.accent}`, borderRadius:12, fontSize:14, fontWeight:600, color:C.accent, cursor:"pointer" }}>
                AI対話でもっと深掘りする →
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

  return null;
}

// ── SectionCard ───────────────────────────────────────────────
function SectionCard({ title, color, items, icon }) {
  return (
    <div style={{ background:"#FDFCFA", border:`1px solid #E8E3DC`, borderRadius:16, padding:"20px 22px", marginBottom:14, boxShadow:"0 1px 6px rgba(0,0,0,0.06)" }}>
      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:14 }}>
        <div style={{ width:24, height:24, borderRadius:6, background:`${color}15`, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
          {icon}
        </div>
        <span style={{ fontSize:13, fontWeight:700, color }}>{ title}</span>
      </div>
      <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
        {(items||[]).map((item, i) => (
          <div key={i} style={{ display:"flex", alignItems:"flex-start", gap:10, padding:"10px 14px", background:`${color}07`, borderRadius:10 }}>
            <span style={{ color, fontWeight:700, fontSize:13, flexShrink:0, marginTop:1 }}>▸</span>
            <span style={{ fontSize:14, color:"#1C1C1C", lineHeight:1.65, wordBreak:"keep-all" }}>{item}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
