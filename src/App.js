import { useState, useEffect, useRef } from "react";
import logoPathnote from './logo-pathnote.png';
import { Zap, Brain, PenLine, ArrowRight, ArrowLeft, ChevronRight, Save, MessageCircle, FileText, BookOpen, Send, Star, Heart, Compass, Sparkles, Map } from "lucide-react";

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
  tensyoku:"転職について", workstyle:"理想の働き方", free:"自由に話したい",
};

// ── 会社情報・法的定数 ─────────────────────────────────────────
const COMPANY = {
  name:        "合同会社Min.lake",
  service:     "PathNote",
  email:       "info@minlake.jp",
  address:     "お問い合わせいただいた際に開示いたします",
  tel:         "お問い合わせはメールにて承ります",
  since:       "2025年5月",
  price:       "現在無料でご利用いただけます（将来的に有料プランを導入する場合は、事前にご案内いたします）",
  payment:     "該当なし（現在無料）",
  delivery:    "お申し込み後、即時ご利用いただけます（インターネット上でのサービス提供）",
  cancel:      "いつでも利用を停止できます。データの削除をご希望の場合はお問い合わせください",
  returns:     "デジタルコンテンツの性質上、返金はお受けできません（有料プラン導入時に別途規定を設けます）",
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

// ── 悩み選択肢 ───────────────────────────────────────────────
const CONCERNS = [
  { id:"strength",  label:"自分の強みがわからない",         desc:"得意なことや人より優れている点が言葉にできない",  color:"#2D6A4F" },
  { id:"moyo",      label:"仕事でもやもやしている",          desc:"なんとなく違和感があるが、何が問題かわからない",  color:"#7B2FBE" },
  { id:"value",     label:"何を大切にしているかわからない",  desc:"仕事の軸や価値観が言語化できていない",           color:"#C9742B" },
  { id:"direction", label:"これからの方向性が見えない",      desc:"キャリアをどう描けばいいかわからない",           color:"#1565C0" },
  { id:"job",       label:"自分に合った仕事がわからない",    desc:"向いている職種や環境が見えていない",             color:"#AD1457" },
  { id:"other",     label:"うまく言葉にできないが悩んでいる", desc:"漠然とした不安や迷いを整理したい",             color:"#555550" },
];

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
  const [page, setPage]       = useState("home");
  const [legalPage, setLegalPage] = useState(null); // "tokusho" | "terms" | "privacy" | null
  const [concern, setConcern] = useState(null); // 選択された悩み
  const [step, setStep]       = useState(0);
  const [answers, setAnswers] = useState([]);
  const [freeText, setFreeText] = useState("");
  const [showFree, setShowFree] = useState(false);
  const [result, setResult]   = useState(null);
  const [loading, setLoading] = useState(false);
  const [savedResult, setSavedResult] = useState(null);

  // Phase2 state
  const [p2messages, setP2messages]   = useState([]);
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
      const concernLabel = CONCERNS.find(c=>c.id===concern)?.label || "";
      const concernContext = concernLabel ? `\nユーザーが感じている悩み：「${concernLabel}」\nこの悩みを踏まえた言語化をしてください。` : "";
      const prompt = `以下は自己理解のための質問への回答です。JSONのみで返答してください（説明文・コードブロック不要）。

回答:
${answersText}
${concernContext}

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
  const P2_SYSTEM = (context, themeLabel) => `あなたは経験豊富なキャリアコンサルタントです。クライアントと自然な対話をしながら、自己理解を深めるお手伝いをしています。

【話し方の基本】
・敬語で、自然な話し言葉を使う。書き言葉にならないように
・1回の返答は2〜3文まで。短くていい
・相手の言葉をそのまま使って返す（例：「〇〇だったんですね」）
・カタカナ専門用語を使わない（モチベーション・スキルセット・ダイナミクス等すべてNG）
・「なぜ」は使わない。「どんな場面で」「そのとき何を感じましたか」を使う
・アドバイス・評価・判断はしない

【質問の作り方】
・質問は必ずシンプルな一文にする
・「〇〇と△△が重なる場面は？」のような複合的な質問はしない（答えにくいのでNG）
・具体的なエピソードを引き出す質問をする
・「どんな場面でしたか？」「そのとき、どんな気持ちでしたか？」「どんな仕事をしているときが一番楽しいですか？」のようなオープンな質問にする
・相手が自由に話せる余白を作る

【良い質問の例】
・「最近、仕事で手応えを感じた瞬間はありましたか？」
・「そのとき、どんな気持ちでしたか？」
・「もう少し聞かせてもらえますか？」
・「それをやっているとき、何が楽しいと感じますか？」
・「周りから感謝されることって、どんなことが多いですか？」

【文末のルール】
・質問するときは「？」をつける
・共感・受け取りのとき（「〇〇だったんですね。」）は疑問符不要
・なるべく質問で締めくくる

【会話の質の判定基準】
以下の3つが揃ったら、まとめに入る：
1. 具体的なエピソードが出ている
2. そのときの気持ち・感情が語られている
3. 大切にしていること・価値観に触れている
→ 3つ揃う前は続ける

${context ? `【STEP1の結果（参考）】\n${context}` : ""}
${themeLabel ? `【今日のテーマ】${themeLabel}` : ""}`;

  const startPhase2 = async (themeId) => {
    setP2messages([]);
    setP2turn(0);
    setP2done(false);
    setP2result(null);
    setPage("p2_chat");
    setP2typing(true);

    const r = result || savedResult?.result;
    const concernLabel = CONCERNS.find(c=>c.id===concern)?.label || "";
    const concernContext = concernLabel ? `ユーザーの悩み：「${concernLabel}」` : "";
    const context = r
      ? `強み：${(r.strengths||[]).join("・")} ／ 大切にしていること：${(r.values||[]).join("・")} ／ 向いている方向：${(r.wants||[]).join("・")}${concernContext ? " ／ " + concernContext : ""}`
      : concernContext;
    const themeId2 = themeId || "free";
    const themeLabel = THEMES_P2_LABELS[themeId2] || "";
    // STEP1の結果を踏まえた最初の質問を生成
    const s1 = r?.strengths?.[0] || "";
    const s2 = r?.strengths?.[1] || "";
    const v1 = r?.values?.[0] || "";
    const v2 = r?.values?.[1] || "";
    const w1 = r?.wants?.[0] || "";

    const openingByTheme = {
      moyo: r
        ? `STEP1で「${v1}」を大切にしていると出ていました。最近、仕事でそれと逆のことが起きて、しんどいなと思った場面はありますか？`
        : "最近の仕事で、なんとなく気が重いと感じる場面はどんなときですか？",
      tsuyomi: r
        ? `STEP1で「${s1}」という強みが出ていましたが、自分ではどう感じていますか？ 「そんなにすごいかな」と思いますか、それとも「たしかにそうかも」と感じますか？`
        : "仕事の中で「これは自分が得意かも」と感じる場面はありますか？",
      taisetu: r
        ? `STEP1で「${v1}」が出ていました。それって、どんな経験からそう思うようになったんでしょうか？`
        : "仕事をしていて「これは大切にしたいな」と感じたのは、どんなときでしたか？",
      tensyoku: r
        ? `今の仕事を振り返ったとき、「ここは合ってるな」と感じることと、「ここはしっくりこないな」と感じることって、それぞれどんなことですか？`
        : "転職を意識し始めたのは、どんなきっかけがありましたか？",
      career: r
        ? `STEP1で「${w1}」という方向性が見えてきましたが、それってどんなイメージですか？ もう少し聞かせてもらえますか？`
        : "5年後、どんな仕事をしていたいというイメージはありますか？",
      free: r
        ? `STEP1で「${s1}」という強みが出ていましたが、自分ではどんな場面でそれを感じますか？`
        : "最近の仕事で、一番印象に残っていることを教えてもらえますか？",
    };
    const opening = openingByTheme[themeId2] || openingByTheme.free;

    // タイプライター演出：文字を少しずつ表示
    setP2messages([{ role:"assistant", content:"" }]);
    setP2typing(true);
    let displayed = "";
    for (let i = 0; i < opening.length; i++) {
      await new Promise(res => setTimeout(res, 12));
      displayed += opening[i];
      setP2messages([{ role:"assistant", content:displayed }]);
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
    const concernLabel = CONCERNS.find(c=>c.id===concern)?.label || "";
    const context = r
      ? `強み：${(r.strengths||[]).join("・")} ／ 大切にしていること：${(r.values||[]).join("・")}${concernLabel ? " ／ ユーザーの悩み：「"+concernLabel+"」" : ""}`
      : (concernLabel ? `ユーザーの悩み：「${concernLabel}」` : "");

    // 深掘り十分かどうかをAIに判定させる
    const depthCheck = newTurn >= 4
      ? `\n\n【重要な判定】これまでの会話を読んで、以下の3つが揃っているか判断してください：
①具体的なエピソードが出ている ②そのときの気持ちが語られている ③価値観・大切にしていることに触れている
→ 3つ揃っていたら：会話の内容を1〜2文でフィードバックし「ここまでの内容を整理することができます。どうなさいますか？」と聞いてください。
→ 揃っていなければ：引き続き深掘りの質問を続けてください。`
      : "";

    const sys = `${P2_SYSTEM(context, "")}${depthCheck}`;

    try {
      let finalContent = "";
      await callAIStream_p2(
        [{ role:"system", content:sys }, ...newMsgs],
        (partial) => {
          finalContent = partial;
          setP2messages([...newMsgs, { role:"assistant", content:partial }]);
        }
      );
      // 「整理することができます」が含まれたらまとめ提案フラグ
      if (finalContent.includes("整理する") || finalContent.includes("まとめ") || newTurn >= 8) {
        setP2done(true);
      }
    } catch {
      setP2messages([...newMsgs, { role:"assistant", content:"申し訳ありません。もう一度送信してください。" }]);
    }
    setP2typing(false);
  };

  // まとめ提案後に「続ける」を選んだ場合 → AIが新たな質問を生成
  const continueChat = async () => {
    setP2done(false);
    setP2typing(true);
    const currentMsgs = [...p2messages];
    setP2messages([...currentMsgs, { role:"assistant", content:"" }]);

    const r = result || savedResult?.result;
    const context = r
      ? `強み：${(r.strengths||[]).join("・")} ／ 大切にしていること：${(r.values||[]).join("・")}`
      : "";
    const sys = `${P2_SYSTEM(context, "")}

【重要】ユーザーはもう少し話を続けることを選びました。
これまでの会話でまだ深掘りできていない部分、または新しい角度から、シンプルな質問を一つだけしてください。
「さきほどの〇〇について、もう少し聞かせてもらえますか？」のように、会話の流れを自然につなげてください。`;

    try {
      let finalContent = "";
      await callAIStream_p2(
        [{ role:"system", content:sys }, ...currentMsgs],
        (partial) => {
          finalContent = partial;
          setP2messages([...currentMsgs, { role:"assistant", content:partial }]);
        }
      );
    } catch {
      setP2messages([...currentMsgs, { role:"assistant", content:"もう少し聞かせてもらえますか？" }]);
    }
    setP2typing(false);
  };

  const generateP2Result = async () => {
    setPage("p2_loading");
    try {
      const conv = p2messages.map(m=>`${m.role==="user"?"あなた":"コーチ"}: ${m.content}`).join("\n");
      const r1 = result || savedResult?.result;
      const base = r1 ? `フェーズ①結果：強み「${(r1.strengths||[]).join("・")}」、価値観「${(r1.values||[]).join("・")}」、向いている方向「${(r1.wants||[]).join("・")}」` : "";

      const prompt = `以下はキャリア自己理解の深掘り対話です。JSONのみで返答してください（説明文・コードブロック不要）。

${base}

対話記録:
${conv}

以下のJSON形式のみで返答:
{"strengths":["強み1","強み2","強み3"],"values":["価値観1","価値観2","価値観3"],"wants":["やりたいこと1","やりたいこと2"],"workStyle":"この人に合っている働き方・環境（2〜3文）","axis":"キャリアの軸（2〜3文）","aiComment":"コンサルタントからのコメント（対話全体を通じて見えてきたこと・気づきを2〜3文で。温かく具体的に）","selfpr":"自己PR文（150文字程度）","careerDirection":["向いている職種・キャリアパス1（職種名＋理由1文）","向いている職種・キャリアパス2","向いている職種・キャリアパス3"],"message":"応援メッセージ（2文）","keyword":"この人の本質を表す独自の言葉（5〜10文字）"}

【各フィールドの厳守ルール】

keyword：
- ありきたりな言葉は絶対に使わない（「信頼の人」「縁の下の力持ち」「真摯な姿勢」などNG）
- その人だけの特徴を鋭く捉えた、詩的・比喩的な表現にする
- 例：「静かな推進力」「人の声を地図にする人」「余白を読む目」「根っこをつなぐ人」「摩擦を熱に変える力」

workStyle（理想の働き方・合っている環境）：
- 対話から読み取れるこの人の特性をもとに、どんな環境・チーム・働き方が合っているかを具体的に書く
- 「〜な環境が合っています」「〜なチームで力を発揮できます」という形で
- 本人が言った希望ではなく、対話から見えた特性から推測する
- 2〜3文

aiComment（AIコンサルタントからのコメント）：
- 対話全体を読んで、本物のキャリアコンサルタントが伝えるようなコメントを書く
- 「さん」や名前は使わない。「今回の対話を通じて」「お話を聞いていて」のような書き出しにする
- 本人が言葉にしていないが対話から見えてきたことを具体的に指摘する
- 本人が気づいていないかもしれない強みや視点を、温かく・具体的に伝える
- 3〜4文。「頑張ってください」のような空虚な励ましはNG
- 対話の中で出てきた具体的な言葉やエピソードに触れること

strengths（強み）：
- 対話から見えた具体的な強み。2〜4個（無理に3つにしなくてよい）
- 各項目は20〜40文字程度で具体的に

values：大切にしていること。2〜3個。

wants：向いている方向。2〜3個。「〜な仕事が向いている」「〜な環境で力を発揮できる」のような提案的な表現で書く

careerDirection（向いているキャリアの方向性）：
- 3〜5年後に向かえる具体的な職種・役割を提案
- なぜその方向が合っているかを1文で添える
- 3つは互いに異なる角度から提案する

selfpr：
- 対話で語られた具体的なエピソード・言葉を必ず盛り込む
- 「私は〜」で始まる転職書類に使えるレベルの文章
- 抽象的な表現NG。150文字程度

【MECE厳守】各カテゴリ内・カテゴリ間で内容が重複しない。すべて日本語。`;

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

  // ── フッター ──────────────────────────────────────────────
  const Footer = () => (
    <div style={{ borderTop:`1px solid ${C.border}`, padding:"24px 24px 32px", textAlign:"center", background:C.surface, fontFamily:F }}>
      <div style={{ fontSize:12, color:C.muted, marginBottom:12 }}>© 2025 {COMPANY.name}</div>
      <div style={{ display:"flex", justifyContent:"center", gap:20, flexWrap:"wrap" }}>
        {[
          { label:"特定商取引法に基づく表記", key:"tokusho" },
          { label:"利用規約", key:"terms" },
          { label:"プライバシーポリシー", key:"privacy" },
        ].map(item=>(
          <button key={item.key} onClick={()=>setLegalPage(item.key)}
            style={{ background:"none", border:"none", color:C.sub, cursor:"pointer", fontSize:12, fontFamily:F, textDecoration:"underline" }}>
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );

  // ── 法的ページ ────────────────────────────────────────────
  if (legalPage) {
    const LegalNav = () => (
      <nav style={{ background:C.surface, borderBottom:`1px solid ${C.border}`, padding:"0 20px", display:"flex", alignItems:"center", height:52, position:"sticky", top:0, zIndex:100, boxShadow:C.shadow }}>
        <button onClick={()=>setLegalPage(null)} style={{ background:"none", border:"none", cursor:"pointer", color:C.muted, padding:4, display:"flex", alignItems:"center", gap:6, fontFamily:F, fontSize:13 }}>
          <ArrowLeft size={18}/> 戻る
        </button>
      </nav>
    );

    const LegalRow = ({ label, value }) => (
      <div style={{ borderBottom:`1px solid ${C.border}`, padding:"14px 0", display:"flex", gap:16, flexWrap:"wrap" }}>
        <div style={{ width:180, flexShrink:0, fontSize:13, fontWeight:700, color:C.sub }}>{label}</div>
        <div style={{ flex:1, fontSize:14, color:C.text, lineHeight:1.8, minWidth:180 }}>{value}</div>
      </div>
    );

    const LegalSection = ({ title, children }) => (
      <div style={{ marginBottom:32 }}>
        <h2 style={{ fontSize:16, fontWeight:700, color:C.text, marginBottom:14, paddingBottom:8, borderBottom:`2px solid ${C.accent}` }}>{title}</h2>
        <div style={{ fontSize:14, color:C.sub, lineHeight:2 }}>{children}</div>
      </div>
    );

    return (
      <div style={{ minHeight:"100vh", background:C.bg, fontFamily:F }}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;600;700;800&display=swap'); *{box-sizing:border-box;margin:0;padding:0} body{background:${C.bg};font-family:${F}}`}</style>
        <LegalNav/>
        <div style={{ maxWidth:720, margin:"0 auto", padding:"36px 24px 64px" }}>

          {/* ── 特定商取引法 ── */}
          {legalPage === "tokusho" && <>
            <div style={{ marginBottom:32 }}>
              <div style={{ fontSize:11, fontWeight:700, color:C.accent, letterSpacing:"0.1em", marginBottom:8 }}>LEGAL</div>
              <h1 style={{ fontSize:22, fontWeight:800, marginBottom:6 }}>特定商取引法に基づく表記</h1>
              <p style={{ fontSize:13, color:C.muted }}>最終更新：{COMPANY.since}</p>
            </div>
            <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:16, padding:"8px 24px", marginBottom:24, boxShadow:C.shadow }}>
              <LegalRow label="販売業者" value={COMPANY.name}/>
              <LegalRow label="サービス名" value={COMPANY.service}/>
              <LegalRow label="運営責任者" value="代表社員"/>
              <LegalRow label="所在地" value={COMPANY.address}/>
              <LegalRow label="電話番号" value={COMPANY.tel}/>
              <LegalRow label="メールアドレス" value={COMPANY.email}/>
              <LegalRow label="販売価格" value={COMPANY.price}/>
              <LegalRow label="お支払い方法" value={COMPANY.payment}/>
              <LegalRow label="サービス提供時期" value={COMPANY.delivery}/>
              <LegalRow label="キャンセル・解約" value={COMPANY.cancel}/>
              <LegalRow label="返金・返品" value={COMPANY.returns}/>
              <LegalRow label="動作環境" value="インターネット接続環境が必要です。推奨ブラウザ：Chrome / Safari / Firefox（最新版）"/>
            </div>
            <div style={{ padding:"16px 20px", background:C.accentL, borderRadius:12, border:`1px solid ${C.accentM}33`, fontSize:13, color:C.sub, lineHeight:1.8 }}>
              本サービスは現在無料でご提供しています。有料プランを導入する際は、本ページを更新の上、事前にメール等でご案内いたします。
            </div>
          </>}

          {/* ── 利用規約 ── */}
          {legalPage === "terms" && <>
            <div style={{ marginBottom:32 }}>
              <div style={{ fontSize:11, fontWeight:700, color:C.accent, letterSpacing:"0.1em", marginBottom:8 }}>TERMS OF SERVICE</div>
              <h1 style={{ fontSize:22, fontWeight:800, marginBottom:6 }}>利用規約</h1>
              <p style={{ fontSize:13, color:C.muted }}>最終更新：{COMPANY.since}</p>
            </div>
            <div style={{ background:C.accentL, border:`1px solid ${C.accentM}33`, borderRadius:12, padding:"14px 18px", marginBottom:28, fontSize:13, color:C.sub, lineHeight:1.8 }}>
              本規約は、{COMPANY.name}（以下「当社」）が提供する「{COMPANY.service}」（以下「本サービス」）の利用条件を定めるものです。ご利用をもって本規約に同意いただいたものとみなします。
            </div>
            {[
              { title:"第1条（サービスの内容）", body:"本サービスは、スキルの棚卸し・AIを活用したキャリアコンサルティング・自己理解レポートの生成などの機能を提供します。AIによる分析・提案は参考情報であり、国家資格キャリアコンサルタントによる専門的なコンサルティングの代替ではありません。" },
              { title:"第2条（禁止事項）", body:"利用者は以下の行為を行ってはなりません。\n・法令または公序良俗に違反する行為\n・本サービスへの不正アクセス\n・AIへの不正操作・プロンプトインジェクション\n・取得した情報の無断転載・商用利用\n・その他当社が不適切と判断する行為" },
              { title:"第3条（免責事項）", body:"当社は、本サービスの利用により生じた損害について、当社の故意または重大な過失による場合を除き、責任を負いません。AIが生成するコンテンツの正確性・完全性、サービスの中断・停止、データの消失についても同様です。" },
              { title:"第4条（知的財産権）", body:"本サービスに関する著作権その他の知的財産権は当社に帰属します。利用者が入力した情報の権利は利用者に帰属しますが、サービス改善を目的とした匿名での分析・利用に同意いただくものとします。" },
              { title:"第5条（サービスの変更・終了）", body:"当社は事前通知なしに本サービスの内容を変更、停止、または終了することができます。" },
              { title:"第6条（規約の変更）", body:"当社は必要と判断した場合、本規約を変更することがあります。変更後も本サービスを利用し続けた場合、変更後の規約に同意したものとみなします。" },
              { title:"第7条（準拠法・管轄）", body:"本規約は日本法に準拠します。紛争については東京地方裁判所を専属的合意管轄とします。" },
              { title:"第8条（お問い合わせ）", body:`メールアドレス：${COMPANY.email}` },
            ].map((art,i)=>(
              <LegalSection key={i} title={art.title}>
                <p style={{ whiteSpace:"pre-wrap" }}>{art.body}</p>
              </LegalSection>
            ))}
          </>}

          {/* ── プライバシーポリシー ── */}
          {legalPage === "privacy" && <>
            <div style={{ marginBottom:32 }}>
              <div style={{ fontSize:11, fontWeight:700, color:C.accent, letterSpacing:"0.1em", marginBottom:8 }}>PRIVACY POLICY</div>
              <h1 style={{ fontSize:22, fontWeight:800, marginBottom:6 }}>プライバシーポリシー</h1>
              <p style={{ fontSize:13, color:C.muted }}>最終更新：{COMPANY.since}</p>
            </div>
            <div style={{ background:C.accentL, border:`1px solid ${C.accentM}33`, borderRadius:12, padding:"14px 18px", marginBottom:28, fontSize:13, color:C.sub, lineHeight:1.8 }}>
              {COMPANY.name}（以下「当社」）は、「{COMPANY.service}」における個人情報の取扱いについて、以下のとおりプライバシーポリシーを定めます。
            </div>
            {[
              { title:"1. 収集する情報", body:"・お名前（ニックネーム可）・年齢・業界・ポジション\n・職務経歴・スキル情報\n・AIとの対話内容・回答内容\n・アクセスログ（IPアドレス・ブラウザ種別・日時）" },
              { title:"2. 利用目的", body:"・本サービスの提供・改善\n・AIによる分析・レポート生成\n・お問い合わせへの対応\n・利用規約違反への対応" },
              { title:"3. 第三者提供", body:"当社は、法令に基づく場合・人の生命保護のために必要な場合を除き、利用者の個人情報を第三者に提供しません。" },
              { title:"4. 業務委託先への情報送信", body:`本サービスは以下の外部サービスを利用しており、AIによる処理のため入力内容が送信されます。\n\n・Groq API（Groq, Inc. / 米国）：AI対話・分析・レポート生成\n・Vercel（Vercel, Inc. / 米国）：サービスのホスティング\n\n各社のプライバシーポリシーについては各社サイトをご参照ください。` },
              { title:"5. データの保管", body:"利用者が入力したデータは、ご利用のブラウザのローカルストレージに保存されます。現時点ではサーバー上に個人情報を保存していません。ブラウザのデータを削除した場合、入力データも削除されます。" },
              { title:"6. 個人情報の開示・削除", body:`個人情報の開示・訂正・削除のご請求は下記までご連絡ください。\n\nメール：${COMPANY.email}` },
              { title:"7. ポリシーの変更", body:"本ポリシーは必要に応じて変更することがあります。重要な変更がある場合はサービス上でお知らせします。" },
            ].map((sec,i)=>(
              <LegalSection key={i} title={sec.title}>
                <p style={{ whiteSpace:"pre-wrap" }}>{sec.body}</p>
              </LegalSection>
            ))}
            <div style={{ padding:"14px 18px", background:C.surface, border:`1px solid ${C.border}`, borderRadius:12, fontSize:14 }}>
              <div><strong>事業者名：</strong>{COMPANY.name}</div>
              <div style={{ marginTop:4 }}><strong>お問い合わせ：</strong>{COMPANY.email}</div>
            </div>
          </>}

        </div>
        <Footer/>
      </div>
    );
  }
  const GlobalStyles = () => (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;600;700;800&family=DM+Mono:wght@400;500&display=swap');
      @keyframes fadeUp   { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
      @keyframes fadeIn   { from{opacity:0} to{opacity:1} }
      @keyframes spin     { to{transform:rotate(360deg)} }
      @keyframes blink    { 0%,100%{opacity:1} 50%{opacity:0} }
      @keyframes pulse    { 0%,100%{transform:scale(1)} 50%{transform:scale(1.04)} }
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
  const Nav = () => {
    const d = load() || {};
    const hasSaved = d.sessions?.length > 0 || d.result || d.p2result;
    return (
      <nav style={{ background:C.surface, borderBottom:`1px solid ${C.border}`, padding:"0 20px", display:"flex", alignItems:"center", justifyContent:"space-between", height:52, position:"sticky", top:0, zIndex:100, boxShadow:C.shadow }}>
        <div onClick={()=>setPage("home")} style={{ cursor:"pointer", display:"flex", alignItems:"center", gap:8 }}>
          <img src={logoPathnote} alt="PathNote" style={{ width:28, height:28, objectFit:"contain" }}/>
          <span style={{ fontWeight:800, fontSize:15, color:C.text, letterSpacing:"-0.02em" }}>PathNote</span>
        </div>
        <div style={{ display:"flex", gap:8 }}>
          {hasSaved && (
            <button onClick={()=>setPage("mypage")}
              style={{ background:"none", border:`1px solid ${C.border}`, borderRadius:8, padding:"5px 12px", color:C.sub, cursor:"pointer", fontSize:12 }}>
              マイページ
            </button>
          )}
        </div>
      </nav>
    );
  };

  // ══════════════════════════════════════════════════════════
  // HOME
  // ══════════════════════════════════════════════════════════
  if (page === "home") return (
    <div style={{ minHeight:"100vh", background:C.bg, fontFamily:F }}>
      <GlobalStyles/>
      <Nav/>

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
            { Icon:Zap,     color:"#E8960C", text:"3問に答えるだけ。職歴の入力不要" },
            { Icon:Brain,   color:"#7B2FBE", text:"AIがあなたの言葉から強みを読み取る" },
            { Icon:PenLine, color:"#4361EE", text:"「言語化できた感」が得られる" },
          ].map((item, i) => (
            <div key={i} style={{ display:"flex", alignItems:"center", gap:14, padding:"14px 18px", background:C.surface, border:`1px solid ${C.border}`, borderRadius:12, boxShadow:C.shadow }}>
              <item.Icon size={20} color={item.color} strokeWidth={1.8} style={{ flexShrink:0 }}/>
              <span style={{ fontSize:14, color:C.sub, lineHeight:1.6 }}>{item.text}</span>
            </div>
          ))}
        </div>
      </div>
      <Footer/>
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

          {/* 強み */}
          <SectionCard title="強み" color={C.accent} items={r.strengths}
            icon={<svg width="15" height="15" viewBox="0 0 15 15" fill="none"><path d="M7.5 1L9.5 5.5L14.5 6L11 9.5L12 14.5L7.5 12L3 14.5L4 9.5L0.5 6L5.5 5.5L7.5 1Z" fill={C.accent}/></svg>}
          />

          {/* 価値観 */}
          <SectionCard title="大切にしていること" color={C.warm} items={r.values}
            icon={<svg width="15" height="15" viewBox="0 0 15 15" fill="none"><path d="M7.5 13S2 9 2 5.5C2 3.5 3.5 2 5.5 2C6.5 2 7.5 2.8 7.5 2.8S8.5 2 9.5 2C11.5 2 13 3.5 13 5.5C13 9 7.5 13 7.5 13Z" fill={C.warm}/></svg>}
          />

          {/* やりたいこと */}
          <SectionCard title="向いている方向" color="#7B5EA7" items={r.wants}
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
              <button onClick={()=>startPhase2("free")}
                style={{ width:"100%", padding:"13px", background:C.accent, color:"#fff", border:"none", borderRadius:12, fontSize:14, fontWeight:700, cursor:"pointer", boxShadow:`0 3px 12px rgba(45,106,79,0.25)` }}>
                AIと対話してもっと深掘りする <ChevronRight size={15} style={{ display:"inline", verticalAlign:"middle" }}/>
              </button>
              <button onClick={restart}
                style={{ width:"100%", padding:"13px", background:"transparent", border:`1.5px solid ${C.border}`, borderRadius:12, fontSize:14, fontWeight:600, color:C.sub, cursor:"pointer" }}>
                もう一度やってみる
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
        <Footer/>
      </div>
    );
  }

  // ── チャット画面の高さ管理（Android/iOS両対応） ────────────
  const chatContainerRef = useRef(null);
  useEffect(() => {
    if (page !== "p2_chat") return;
    const update = () => {
      const h = window.visualViewport ? window.visualViewport.height : window.innerHeight;
      if (chatContainerRef.current) {
        chatContainerRef.current.style.height = h + "px";
      }
    };
    update();
    const vp = window.visualViewport;
    if (vp) {
      vp.addEventListener("resize", update);
      return () => vp.removeEventListener("resize", update);
    } else {
      window.addEventListener("resize", update);
      return () => window.removeEventListener("resize", update);
    }
  }, [page]);

  // ══════════════════════════════════════════════════════════
  // PHASE 2 CHAT
  // ══════════════════════════════════════════════════════════
  if (page === "p2_chat") {
    return (
      <div ref={chatContainerRef} style={{ position:"fixed", top:0, left:0, right:0, height:"100%", background:C.bg, fontFamily:F, display:"flex", flexDirection:"column", overflow:"hidden" }}>
        <GlobalStyles/>
        {/* ヘッダー */}
        <nav style={{ background:C.surface, borderBottom:`1px solid ${C.border}`, padding:"0 16px", display:"flex", alignItems:"center", justifyContent:"space-between", height:52, flexShrink:0, zIndex:20 }}>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <button onClick={()=>setPage("mypage")} style={{ background:"none", border:"none", cursor:"pointer", color:C.muted, padding:4, display:"flex", alignItems:"center" }}>
              <ArrowLeft size={20}/>
            </button>
            <div>
              <div style={{ fontSize:13, fontWeight:700, color:C.accent }}>STEP 2 · 深掘り対話</div>
              <div style={{ fontSize:11, color:C.muted }}>{p2turn}問回答済み</div>
            </div>
          </div>
          <div style={{ display:"flex", gap:6, alignItems:"center" }}>
            {p2turn > 0 && !p2done && (
              <button onClick={()=>setPage("mypage")}
                style={{ padding:"5px 12px", background:"transparent", border:`1px solid ${C.border}`, borderRadius:8, color:C.muted, cursor:"pointer", fontSize:12, fontFamily:F }}>
                やめる
              </button>
            )}
            {p2done && (
              <button onClick={generateP2Result}
                style={{ padding:"6px 14px", background:C.accent, color:"#fff", border:"none", borderRadius:8, fontSize:13, fontWeight:700, cursor:"pointer" }}>
                まとめる <ChevronRight size={14} style={{ display:"inline", verticalAlign:"middle" }}/>
              </button>
            )}
          </div>
        </nav>

        {/* プログレス */}
        <div style={{ background:C.border, height:3, flexShrink:0 }}>
          <div style={{ width:`${Math.min(100,(p2turn/7)*100)}%`, height:"100%", background:`linear-gradient(90deg,${C.accent},${C.accentM})`, transition:"width 0.5s ease" }}/>
        </div>

        {/* チャットエリア */}
        <div style={{ flex:1, overflowY:"auto", WebkitOverflowScrolling:"touch", padding:"16px 16px 16px" }}>
          <div style={{ maxWidth:520, margin:"0 auto", display:"flex", flexDirection:"column", gap:14 }}>

            {/* STEP1結果の要約 */}
            {(result || savedResult?.result) && (() => {
              const r = result || savedResult?.result;
              return (
                <div style={{ padding:"12px 14px", background:C.accentL, borderRadius:12, border:`1px solid ${C.accentM}33` }}>
                  <div style={{ fontSize:11, fontWeight:700, color:C.accent, marginBottom:6, letterSpacing:"0.06em" }}>STEP 1 の結果</div>
                  <div style={{ display:"flex", flexWrap:"wrap", gap:5 }}>
                    {[...(r.strengths||[]).slice(0,2), ...(r.values||[]).slice(0,1)].map((item,i)=>(
                      <span key={i} style={{ fontSize:12, padding:"2px 9px", borderRadius:16, background:C.surface, border:`1px solid ${C.border}`, color:C.sub }}>{item}</span>
                    ))}
                  </div>
                </div>
              );
            })()}

            {p2messages.map((msg, i) => (
              <div key={i} style={{ display:"flex", flexDirection:msg.role==="user"?"row-reverse":"row", gap:8, alignItems:"flex-end" }}>
                {msg.role === "assistant" && (
                  <svg width="32" height="32" viewBox="0 0 32 32" fill="none" style={{ flexShrink:0 }}>
                    <circle cx="16" cy="16" r="16" fill={C.accentL}/>
                    <ellipse cx="16" cy="13" rx="5.5" ry="6" fill="#F5D9C8"/>
                    <ellipse cx="16" cy="8.5" rx="5.8" ry="3.5" fill="#5C4033"/>
                    <ellipse cx="10.8" cy="11.5" rx="1.6" ry="3" fill="#5C4033"/>
                    <ellipse cx="21.2" cy="11.5" rx="1.6" ry="3" fill="#5C4033"/>
                    <ellipse cx="13.8" cy="13" rx="0.8" ry="0.9" fill="#2C2825"/>
                    <ellipse cx="18.2" cy="13" rx="0.8" ry="0.9" fill="#2C2825"/>
                    <path d="M14.2 15.5 Q16 16.5 17.8 15.5" stroke="#C08070" strokeWidth="0.8" strokeLinecap="round" fill="none"/>
                    <rect x="14.5" y="18.5" width="3" height="2" rx="1" fill="#F5D9C8"/>
                    <path d="M7 32 Q7 24 16 22 Q25 24 25 32" fill={C.accent}/>
                    <path d="M14.5 22 L13 25.5 L16 24 L19 25.5 L17.5 22" fill="#FDFCFA"/>
                  </svg>
                )}
                <div style={{ maxWidth:"80%", padding:"11px 14px", borderRadius:msg.role==="user"?"14px 14px 4px 14px":"14px 14px 14px 4px", background:msg.role==="user"?C.accent:C.surface, color:msg.role==="user"?"#fff":C.text, fontSize:14, lineHeight:1.85, boxShadow:C.shadow, border:msg.role==="user"?"none":`1px solid ${C.border}`, whiteSpace:"pre-wrap" }}>
                  {msg.content}
                  {msg.role==="assistant" && p2typing && i===p2messages.length-1 && msg.content && (
                    <span style={{ display:"inline-block", width:2, height:13, background:C.accent, marginLeft:2, animation:"blink 0.8s infinite", verticalAlign:"middle" }}/>
                  )}
                </div>
              </div>
            ))}

            {p2typing && p2messages[p2messages.length-1]?.content==="" && (
              <div style={{ display:"flex", gap:8, alignItems:"flex-end" }}>
                <svg width="32" height="32" viewBox="0 0 32 32" fill="none" style={{ flexShrink:0 }}>
                  <circle cx="16" cy="16" r="16" fill={C.accentL}/>
                  <ellipse cx="16" cy="13" rx="5.5" ry="6" fill="#F5D9C8"/>
                  <ellipse cx="16" cy="8.5" rx="5.8" ry="3.5" fill="#5C4033"/>
                  <ellipse cx="10.8" cy="11.5" rx="1.6" ry="3" fill="#5C4033"/>
                  <ellipse cx="21.2" cy="11.5" rx="1.6" ry="3" fill="#5C4033"/>
                  <ellipse cx="13.8" cy="13" rx="0.8" ry="0.9" fill="#2C2825"/>
                  <ellipse cx="18.2" cy="13" rx="0.8" ry="0.9" fill="#2C2825"/>
                  <path d="M14.2 15.5 Q16 16.5 17.8 15.5" stroke="#C08070" strokeWidth="0.8" strokeLinecap="round" fill="none"/>
                  <rect x="14.5" y="18.5" width="3" height="2" rx="1" fill="#F5D9C8"/>
                  <path d="M7 32 Q7 24 16 22 Q25 24 25 32" fill={C.accent}/>
                  <path d="M14.5 22 L13 25.5 L16 24 L19 25.5 L17.5 22" fill="#FDFCFA"/>
                </svg>
                <div style={{ padding:"11px 16px", borderRadius:"14px 14px 14px 4px", background:C.surface, border:`1px solid ${C.border}`, display:"flex", gap:4, alignItems:"center" }}>
                  {[0,1,2].map(i=><div key={i} style={{ width:6, height:6, borderRadius:"50%", background:C.muted, animation:`blink 1.2s ${i*0.3}s infinite` }}/>)}
                </div>
              </div>
            )}

            {/* まとめ選択UI */}
            {p2done && !p2typing && (
              <div style={{ background:`linear-gradient(135deg,${C.accentL},#F0F8F4)`, border:`1px solid ${C.accentM}44`, borderRadius:14, padding:"16px 18px" }}>
                <div style={{ fontSize:13, fontWeight:600, color:C.accent, marginBottom:12 }}>どうしますか？</div>
                <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                  <button onClick={generateP2Result}
                    style={{ width:"100%", padding:"12px", background:C.accent, color:"#fff", border:"none", borderRadius:10, fontSize:14, fontWeight:700, cursor:"pointer" }}>
                    結果をまとめる
                  </button>
                  <button onClick={continueChat}
                    style={{ width:"100%", padding:"12px", background:"transparent", border:`1px solid ${C.border}`, borderRadius:10, fontSize:13, color:C.sub, cursor:"pointer" }}>
                    もう少し話を続ける
                  </button>
                </div>
              </div>
            )}

            <div ref={el=>el&&el.scrollIntoView({behavior:"smooth",block:"end"})}/>
          </div>
        </div>

        {/* 入力エリア */}
        <div style={{ background:C.surface, borderTop:`1px solid ${C.border}`, padding:"10px 16px 10px", flexShrink:0, zIndex:20 }}>
          <div style={{ maxWidth:520, margin:"0 auto", display:"flex", gap:8, alignItems:"flex-end" }}>
            <textarea value={p2input} onChange={e=>setP2input(e.target.value)}
              onKeyDown={e=>{ if(e.key==="Enter"&&(e.ctrlKey||e.metaKey)){ e.preventDefault(); sendP2Message(); } }}
              placeholder={p2done ? "続けて話す場合はここに入力..." : "思っていることを自由に...（Ctrl+Enterで送信）"}
              disabled={p2typing}
              style={{ flex:1, padding:"10px 14px", background:C.bg, border:`1px solid ${C.border}`, borderRadius:12, fontSize:14, lineHeight:1.6, resize:"none", minHeight:44, maxHeight:96, color:C.text, outline:"none", fontFamily:F }}/>
            <button onClick={()=>{ if(p2done) setP2done(false); sendP2Message(); }} disabled={p2typing||!p2input.trim()}
              style={{ width:44, height:44, borderRadius:12, background:p2input.trim()&&!p2typing?C.accent:C.border, border:"none", color:"#fff", cursor:p2input.trim()&&!p2typing?"pointer":"not-allowed", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center", transition:"background 0.15s" }}>
              <Send size={18}/>
            </button>
          </div>
        </div>
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
        <Nav/>
        <div style={{ maxWidth:560, margin:"0 auto", padding:"32px 20px 56px", animation:"fadeUp 0.4s ease" }}>

          {/* キーワード */}
          <div style={{ textAlign:"center", marginBottom:28 }}>
            <div style={{ fontSize:10, fontWeight:700, color:C.muted, letterSpacing:"0.1em", marginBottom:10 }}>STEP 2 完了 · あなたを表すと</div>
            <div style={{ display:"inline-block", padding:"10px 28px", background:C.accent, color:"#fff", borderRadius:40, fontSize:20, fontWeight:800, boxShadow:`0 4px 20px rgba(45,106,79,0.25)` }}>
              {r2.keyword}
            </div>
          </div>

          {/* AIメッセージ */}
          {/* キャリアの軸 */}
          <div style={{ background:`linear-gradient(135deg,${C.accentL},#F0F8F4)`, border:`1px solid ${C.accentM}44`, borderRadius:16, padding:"20px 22px", marginBottom:14 }}>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:12, color:C.accent }}>
              <Compass size={18} strokeWidth={1.8}/>
              <span style={{ fontSize:14, fontWeight:700 }}>キャリアの軸</span>
            </div>
            <p style={{ fontSize:15, color:C.text, lineHeight:1.9, fontWeight:600 }}>{r2.axis}</p>
          </div>

          {/* AIコンサルタントより */}
          {r2.aiComment && (
            <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:16, padding:"20px 22px", marginBottom:14, boxShadow:C.shadow }}>
              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:12, color:C.accentM }}>
                <svg width="18" height="18" viewBox="0 0 32 32" fill="none">
                  <circle cx="16" cy="16" r="16" fill={C.accentL}/>
                  <ellipse cx="16" cy="13" rx="5.5" ry="6" fill="#F5D9C8"/>
                  <ellipse cx="16" cy="8.5" rx="5.8" ry="3.5" fill="#5C4033"/>
                  <path d="M7 32 Q7 24 16 22 Q25 24 25 32" fill={C.accent}/>
                </svg>
                <span style={{ fontSize:14, fontWeight:700 }}>AIコンサルタントより</span>
              </div>
              <p style={{ fontSize:14, color:C.sub, lineHeight:1.9 }}>{r2.aiComment}</p>
            </div>
          )}

          <SectionCard title="強み" color={C.accent} items={r2.strengths}
            icon={<Star size={15} fill={C.accent} strokeWidth={0}/>}
          />
          <SectionCard title="大切にしていること" color={C.warm} items={r2.values}
            icon={<Heart size={15} fill={C.warm} strokeWidth={0}/>}
          />
          <SectionCard title="向いている方向" color="#7B5EA7" items={r2.wants}
            icon={<Map size={15} color="#7B5EA7" strokeWidth={1.8}/>}
          />

          {/* 理想の働き方 */}
          {r2.workStyle && (
            <div style={{ background:"#EEF6FF", border:`1px solid #90CAF944`, borderRadius:16, padding:"20px 22px", marginBottom:14 }}>
              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:12, color:"#1565C0" }}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="1" y="4" width="14" height="10" rx="2" stroke="#1565C0" strokeWidth="1.5"/><path d="M5 4V3C5 2.4 5.4 2 6 2H10C10.6 2 11 2.4 11 3V4" stroke="#1565C0" strokeWidth="1.5"/><path d="M1 8H15" stroke="#1565C0" strokeWidth="1.5"/></svg>
                <span style={{ fontSize:14, fontWeight:700 }}>理想の働き方</span>
              </div>
              <p style={{ fontSize:14, color:"#1C1C1C", lineHeight:1.9 }}>{r2.workStyle}</p>
            </div>
          )}

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
            <button onClick={()=>{
              if (window.confirm("結果を保存せずにマイページに進みますか？")) setPage("mypage");
            }}
              style={{ width:"100%", padding:"13px", background:"transparent", border:"none", borderRadius:12, fontSize:13, color:C.muted, cursor:"pointer" }}>
              保存せずにマイページへ
            </button>
            <button onClick={restart}
              style={{ width:"100%", padding:"12px", background:"transparent", border:"none", borderRadius:12, fontSize:13, color:C.muted, cursor:"pointer" }}>
              最初からやり直す
            </button>
          </div>
        </div>
        <Footer/>
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
    logoSrc={logoPathnote}
    onNewSession={(themeId)=>{
      if (themeId) {
        setP2messages([]); setP2turn(0); setP2done(false); setP2result(null);
        startPhase2(themeId);
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
  { id:"moyo",      color:"#7B2FBE", label:"仕事のもやもや",       desc:"今感じている違和感・不満を整理したい" },
  { id:"tsuyomi",   color:"#2D6A4F", label:"自分の強みを知りたい", desc:"自分でも気づいていない得意なことを探したい" },
  { id:"taisetu",   color:"#C9742B", label:"大切にしていること",    desc:"仕事を通じて何を大事にしているか言語化したい" },
  { id:"workstyle", color:"#1565C0", label:"理想の働き方",         desc:"どんな環境・条件で働きたいかを整理したい" },
  { id:"career",    color:"#0097A7", label:"これからのキャリア",   desc:"将来どんな方向に進みたいか考えたい" },
  { id:"tensyoku",  color:"#4361EE", label:"転職について",         desc:"転職の軸・方向性・不安を整理したい" },
  { id:"free",      color:"#555550", label:"自由に話したい",       desc:"テーマを決めずに今感じていることを話したい" },
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

function MyPage({ data, onBack, onRestart, onNewSession, onViewSession, logoSrc }) {
  const [tab, setTab] = useState("note");
  const [showCareerForm, setShowCareerForm] = useState(false);
  const [showThemeSelect, setShowThemeSelect] = useState(false);
  const [editingSkills, setEditingSkills] = useState(false);
  const [freeSkillInput, setFreeSkillInput] = useState("");
  const [careers, setCareers] = useState(data.careers || []);
  const [skillMap, setSkillMap] = useState(data.skillMap || {});
  const [newCareer, setNewCareer] = useState({ company:"", fromY:"", fromM:"", toY:"", toM:"", current:false, role:"", notes:"" });

  const sessions = data.sessions || [];
  const latest = data.latestP2 || sessions[0]?.p2result || null;

  const addCareer = () => {
    if (!newCareer.company && !newCareer.role) return;
    const from = newCareer.fromY ? `${newCareer.fromY}年${newCareer.fromM||""}月` : "";
    const to = newCareer.current ? "現在" : (newCareer.toY ? `${newCareer.toY}年${newCareer.toM||""}月` : "");
    const period = from && to ? `${from} 〜 ${to}` : from || to;
    const updated = [...careers, { ...newCareer, period, id: Date.now().toString() }];
    setCareers(updated);
    setNewCareer({ company:"", fromY:"", fromM:"", toY:"", toM:"", current:false, role:"", notes:"" });
    setShowCareerForm(false);
    const existing = load() || {};
    save({ ...existing, careers: updated });
  };

  const addFreeSkill = () => {
    if (!freeSkillInput.trim()) return;
    const updated = { ...skillMap, [freeSkillInput.trim()]: "1〜3年" };
    setSkillMap(updated);
    setFreeSkillInput("");
    const existing = load() || {};
    save({ ...existing, skillMap: updated });
  };

  const saveSkills = () => {
    setEditingSkills(false);
    const existing = load() || {};
    save({ ...existing, skillMap });
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
          <img src={logoSrc} alt="PathNote" style={{ width:28, height:28, objectFit:"contain" }}/>
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
                    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10, color:C.accent }}>
                      <Compass size={17} strokeWidth={1.8}/>
                      <span style={{ fontSize:15, fontWeight:700 }}>キャリアの軸</span>
                    </div>
                    <p style={{ fontSize:14, color:C.text, lineHeight:1.9, fontWeight:600 }}>{latest.axis}</p>
                  </div>
                )}

                {/* AIコンサルタントより */}
                {latest.aiComment && (
                  <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:14, padding:"18px 20px", boxShadow:C.shadow }}>
                    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10, color:C.accentM }}>
                      <svg width="17" height="17" viewBox="0 0 32 32" fill="none">
                        <circle cx="16" cy="16" r="16" fill={C.accentL}/>
                        <ellipse cx="16" cy="13" rx="5.5" ry="6" fill="#F5D9C8"/>
                        <ellipse cx="16" cy="8.5" rx="5.8" ry="3.5" fill="#5C4033"/>
                        <path d="M7 32 Q7 24 16 22 Q25 24 25 32" fill={C.accent}/>
                      </svg>
                      <span style={{ fontSize:15, fontWeight:700 }}>AIコンサルタントより</span>
                    </div>
                    <p style={{ fontSize:14, color:C.sub, lineHeight:1.9 }}>{latest.aiComment}</p>
                  </div>
                )}

                {/* 強み */}
                <NoteSectionCard title="強み" color={C.accent} items={latest.strengths} Icon={Star}/>
                {/* 価値観 */}
                <NoteSectionCard title="大切にしていること" color={C.warm} items={latest.values} Icon={Heart}/>
                {/* 向いている方向 */}
                <NoteSectionCard title="向いている方向" color="#7B5EA7" items={latest.wants} Icon={Map}/>

                {/* 理想の働き方 */}
                {latest.workStyle && (
                  <div style={{ background:"#EEF6FF", border:`1px solid #90CAF944`, borderRadius:14, padding:"18px 20px" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10, color:"#1565C0" }}>
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="1" y="4" width="14" height="10" rx="2" stroke="#1565C0" strokeWidth="1.5"/><path d="M5 4V3C5 2.4 5.4 2 6 2H10C10.6 2 11 2.4 11 3V4" stroke="#1565C0" strokeWidth="1.5"/><path d="M1 8H15" stroke="#1565C0" strokeWidth="1.5"/></svg>
                      <span style={{ fontSize:15, fontWeight:700 }}>理想の働き方</span>
                    </div>
                    <p style={{ fontSize:14, color:"#1C1C1C", lineHeight:1.9 }}>{latest.workStyle}</p>
                  </div>
                )}

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
function NoteSectionCard({ title, color, items, Icon }) {
  if (!items || items.length === 0) return null;
  return (
    <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:14, padding:"18px 20px", boxShadow:C.shadow }}>
      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:14, color }}>
        {Icon && <Icon size={17} strokeWidth={1.8}/>}
        <span style={{ fontSize:15, fontWeight:700 }}>{title}</span>
      </div>
      <div style={{ background:`${color}08`, borderRadius:10, padding:"12px 14px" }}>
        {items.map((item,i)=>(
          <div key={i} style={{ display:"flex", alignItems:"flex-start", gap:8, marginBottom: i < items.length-1 ? 10 : 0 }}>
            <span style={{ color, fontWeight:700, fontSize:13, flexShrink:0, marginTop:1 }}>▸</span>
            <span style={{ fontSize:15, color:C.text, lineHeight:1.7, wordBreak:"keep-all" }}>{item}</span>
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
        <div style={{ width:28, height:28, borderRadius:7, background:`${color}15`, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
          {icon}
        </div>
        <span style={{ fontSize:15, fontWeight:700, color }}>{title}</span>
      </div>
      <div style={{ background:`${color}08`, borderRadius:12, padding:"14px 16px" }}>
        {items.map((item, i) => (
          <div key={i} style={{ display:"flex", alignItems:"flex-start", gap:8, marginBottom: i < items.length-1 ? 10 : 0 }}>
            <span style={{ color, fontWeight:700, fontSize:14, flexShrink:0, marginTop:1 }}>▸</span>
            <span style={{ fontSize:15, color:"#1C1C1C", lineHeight:1.7, wordBreak:"keep-all" }}>{item}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
