import { useState, useEffect, useRef } from "react";
import logoPathnote from './logo-pathnote.png';
import {
  MessageCircle, Brain, Users, Palette, TrendingUp, Wrench, Briefcase,
  Wind, Gem, DoorOpen, Sparkles, Map, MessageSquare,
  ClipboardList, FileText, Rocket, Compass, Heart, Award, PenLine,
  ChevronRight, ChevronLeft, Save, Check, Lightbulb, ArrowRight,
  BookOpen, Building2, Clock, ScrollText, LayoutDashboard
} from "lucide-react";

// ── Design tokens ─────────────────────────────────────────────
const C = {
  bg:      "#F5F3F0",
  surface: "#FDFCFB",
  border:  "#E2DDD8",
  accent:  "#5C6BC0",
  accentL: "#ECEEF8",
  accentD: "#3949AB",
  teal:    "#4A7C6F",
  tealL:   "#EBF3F1",
  gold:    "#B07D2E",
  goldL:   "#FAF3E6",
  green:   "#4A7C5F",
  greenL:  "#EBF3EE",
  red:     "#C0483E",
  redL:    "#FAECEA",
  text:    "#2C2825",
  sub:     "#5C564F",
  muted:   "#A09890",
  shadow:  "0 1px 8px rgba(0,0,0,0.06)",
  shadowM: "0 4px 20px rgba(0,0,0,0.09)",
};
const F  = "'Noto Sans JP','Hiragino Sans',sans-serif";
const FM = "'DM Mono',monospace";

// ── Legal info (要変更) ────────────────────────────────────────
const LEGAL = {
  serviceName: "PathNote",
  operator:    "【運営者名を記入してください】",
  email:       "【メールアドレスを記入してください】",
  since:       "2025年5月1日",
};

// ── Storage ───────────────────────────────────────────────────
const KEY = "pathnote_v3";
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } };
const save = (d) => localStorage.setItem(KEY, JSON.stringify(d));

// ── API ───────────────────────────────────────────────────────
async function callAIStream(messages, onChunk) {
  const apiKey = process.env.REACT_APP_GROQ_API_KEY;
  if (!apiKey) throw new Error("APIキーが設定されていません");
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
    body: JSON.stringify({ model: "llama-3.3-70b-versatile", messages, temperature: 0.6, max_tokens: 400, stream: true }),
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

// ── UI Components ─────────────────────────────────────────────
function ConsultantAvatar({ size = 36 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
      <circle cx="18" cy="18" r="18" fill={C.tealL}/>
      <ellipse cx="18" cy="14.5" rx="6" ry="6.5" fill="#F5D9C8"/>
      <ellipse cx="18" cy="10" rx="6.2" ry="4" fill="#5C4033"/>
      <ellipse cx="12.2" cy="13" rx="1.8" ry="3.5" fill="#5C4033"/>
      <ellipse cx="23.8" cy="13" rx="1.8" ry="3.5" fill="#5C4033"/>
      <ellipse cx="15.5" cy="14.5" rx="0.9" ry="1" fill="#2C2825"/>
      <ellipse cx="20.5" cy="14.5" rx="0.9" ry="1" fill="#2C2825"/>
      <path d="M14.2 12.8 Q15.5 12.2 16.8 12.8" stroke="#5C4033" strokeWidth="0.8" strokeLinecap="round" fill="none"/>
      <path d="M19.2 12.8 Q20.5 12.2 21.8 12.8" stroke="#5C4033" strokeWidth="0.8" strokeLinecap="round" fill="none"/>
      <path d="M16 17 Q18 18.2 20 17" stroke="#C08070" strokeWidth="0.9" strokeLinecap="round" fill="none"/>
      <rect x="16.2" y="20.5" width="3.6" height="2.5" rx="1" fill="#F5D9C8"/>
      <path d="M8 36 Q8 27 18 25 Q28 27 28 36" fill="#4A7C6F"/>
      <path d="M16 25 L14 29 L18 27 L22 29 L20 25" fill="#FDFCFB"/>
    </svg>
  );
}

function BoldText({ text }) {
  if (!text) return null;
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>{parts.map((part, i) =>
      part.startsWith("**") && part.endsWith("**")
        ? <strong key={i} style={{ fontWeight: 700, color: "inherit" }}>{part.slice(2,-2)}</strong>
        : <span key={i}>{part}</span>
    )}</>
  );
}

const Bar = ({ value, color = C.accent, height = 6 }) => (
  <div style={{ background: C.border, borderRadius: 99, height, overflow: "hidden" }}>
    <div style={{ width: `${Math.min(value,100)}%`, height: "100%", background: color, borderRadius: 99, transition: "width 0.8s ease" }}/>
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
    primary:   { background: C.accent, color: "#fff", border: "none" },
    secondary: { background: "transparent", color: C.sub, border: `1px solid ${C.border}` },
    teal:      { background: C.teal, color: "#fff", border: "none" },
    ghost:     { background: C.accentL, color: C.accent, border: `1px solid ${C.accent}33` },
  };
  return (
    <button onClick={onClick} disabled={disabled}
      style={{ padding: "11px 20px", borderRadius: 10, fontSize: 14, fontFamily: F, fontWeight: 600,
               cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1,
               transition: "all 0.15s", ...styles[variant], ...style }}>
      {children}
    </button>
  );
};

// ── Legal pages ───────────────────────────────────────────────
function LegalSection({ title, children }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <h2 style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 12, paddingBottom: 8, borderBottom: `1px solid ${C.border}` }}>{title}</h2>
      <div style={{ fontSize: 14, color: C.sub, lineHeight: 2 }}>{children}</div>
    </div>
  );
}

function LegalArticle({ number, title, children }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontWeight: 700, color: C.text, marginBottom: 6, fontSize: 14 }}>第{number}条　{title}</div>
      <div style={{ paddingLeft: 14, borderLeft: `2px solid ${C.border}`, lineHeight: 2, fontSize: 14, color: C.sub }}>{children}</div>
    </div>
  );
}

function TermsOfService({ onClose }) {
  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: F, color: C.text }}>
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "40px 24px" }}>
        <button onClick={onClose} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 13, fontFamily: F, marginBottom: 24, display: "flex", alignItems: "center", gap: 4 }}>
          <ChevronLeft size={14}/> 戻る
        </button>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.teal, letterSpacing: "0.1em", marginBottom: 8 }}>TERMS OF SERVICE</div>
        <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 6 }}>利用規約</h1>
        <p style={{ color: C.muted, fontSize: 13, marginBottom: 32 }}>最終更新日：{LEGAL.since}</p>

        <div style={{ background: C.tealL, border: `1px solid ${C.teal}33`, borderRadius: 12, padding: "14px 18px", marginBottom: 32, fontSize: 13, color: C.teal, lineHeight: 1.8 }}>
          {LEGAL.operator}（以下「運営者」）が提供するキャリア自己理解サービス「{LEGAL.serviceName}」（以下「本サービス」）の利用に関する条件を定めるものです。本サービスをご利用になる前に、本規約をよくお読みください。ご利用をもって、本規約に同意いただいたものとみなします。
        </div>

        <LegalArticle number="1" title="サービスの内容">
          <p>本サービスは、スキルの棚卸し・AIを活用したキャリアコンサルティング対話・自己理解レポートの生成などの機能を提供します。</p>
          <p style={{ marginTop: 8 }}>本サービスで提供するAIによる対話・分析・提案は参考情報であり、国家資格キャリアコンサルタントによる専門的なコンサルティングの代替ではありません。重要なキャリア上の判断については、専門家へのご相談をあわせてお勧めします。</p>
        </LegalArticle>

        <LegalArticle number="2" title="利用資格">
          <p>本サービスは日本国内在住の方を対象としています。未成年の方がご利用になる場合は、親権者の同意を得た上でご利用ください。</p>
        </LegalArticle>

        <LegalArticle number="3" title="禁止事項">
          <p>利用者は以下の行為を行ってはなりません。</p>
          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
            {["法令または公序良俗に違反する行為","運営者または第三者の権利・利益を侵害する行為","本サービスのシステムへの不正アクセス","取得した情報を無断で第三者に提供する行為","AIへの不正操作・プロンプトインジェクション等の試み","本サービスの運営を妨害するおそれのある行為","その他、運営者が不適切と判断する行為"].map((item,i)=>(
              <div key={i} style={{ display: "flex", gap: 8 }}><span style={{ color: C.teal, flexShrink: 0 }}>（{i+1}）</span><span>{item}</span></div>
            ))}
          </div>
        </LegalArticle>

        <LegalArticle number="4" title="知的財産権">
          <p>本サービスに関する著作権その他の知的財産権は、運営者または正当な権利者に帰属します。利用者が入力した情報の権利は利用者に帰属しますが、個人を特定できない形でのサービス改善目的の分析・利用に同意いただくものとします。</p>
        </LegalArticle>

        <LegalArticle number="5" title="免責事項">
          <p>運営者は、本サービスの利用により生じた損害（直接・間接を問わず）について、一切の責任を負いません。また以下についても責任を負いかねます。</p>
          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
            {["AIが生成するコンテンツの正確性・完全性","本サービスの中断・停止・障害","ブラウザのデータ削除等によるデータの消失","本サービスを利用したキャリア上の意思決定の結果"].map((item,i)=>(
              <div key={i} style={{ display: "flex", gap: 8 }}><span style={{ color: C.teal, flexShrink: 0 }}>・</span><span>{item}</span></div>
            ))}
          </div>
        </LegalArticle>

        <LegalArticle number="6" title="サービスの変更・停止・終了">
          <p>運営者は、利用者への事前通知なしに、本サービスの内容を変更、停止、または終了することができます。これにより利用者に損害が生じた場合でも、運営者は責任を負いません。</p>
        </LegalArticle>

        <LegalArticle number="7" title="規約の変更">
          <p>運営者は必要と判断した場合、本規約を変更することができます。変更後も本サービスを利用し続けた場合、変更後の規約に同意したものとみなします。</p>
        </LegalArticle>

        <LegalArticle number="8" title="準拠法・管轄">
          <p>本規約は日本法に準拠し、本サービスに関して生じた紛争については、運営者の所在地を管轄する裁判所を専属的合意管轄とします。</p>
        </LegalArticle>

        <LegalArticle number="9" title="お問い合わせ">
          <p>本規約に関するお問い合わせは、以下までご連絡ください。</p>
          <p style={{ marginTop: 8 }}>メール：{LEGAL.email}</p>
        </LegalArticle>

        <div style={{ marginTop: 40, padding: "14px 18px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, fontSize: 12, color: C.muted, textAlign: "center" }}>
          制定日：{LEGAL.since}　／　{LEGAL.serviceName}
        </div>
      </div>
    </div>
  );
}

function PrivacyPolicy({ onClose }) {
  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: F, color: C.text }}>
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "40px 24px" }}>
        <button onClick={onClose} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 13, fontFamily: F, marginBottom: 24, display: "flex", alignItems: "center", gap: 4 }}>
          <ChevronLeft size={14}/> 戻る
        </button>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.teal, letterSpacing: "0.1em", marginBottom: 8 }}>PRIVACY POLICY</div>
        <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 6 }}>プライバシーポリシー</h1>
        <p style={{ color: C.muted, fontSize: 13, marginBottom: 32 }}>最終更新日：{LEGAL.since}</p>

        <div style={{ background: C.tealL, border: `1px solid ${C.teal}33`, borderRadius: 12, padding: "14px 18px", marginBottom: 32, fontSize: 13, color: C.teal, lineHeight: 1.8 }}>
          {LEGAL.operator}（以下「運営者」）は、「{LEGAL.serviceName}」における利用者の個人情報の取扱いについて、以下のとおりプライバシーポリシーを定めます。
        </div>

        <LegalSection title="1. 収集する情報">
          <p style={{ fontWeight: 600, color: C.text, marginBottom: 6 }}>利用者が入力する情報</p>
          {["お名前（ニックネーム可）・年齢","現在の業界・ポジション","このサービスでやりたいこと","職務経歴（会社名・期間・役割・実績）","スキル・経験年数","AIコンサルタントとの対話内容"].map((item,i)=>(
            <div key={i} style={{ display: "flex", gap: 8 }}><span style={{ color: C.teal, flexShrink: 0 }}>・</span><span>{item}</span></div>
          ))}
          <p style={{ fontWeight: 600, color: C.text, margin: "12px 0 6px" }}>自動的に収集される情報</p>
          {["アクセスログ（IPアドレス・ブラウザ種別・アクセス日時）","Cookie・ローカルストレージに保存されるデータ"].map((item,i)=>(
            <div key={i} style={{ display: "flex", gap: 8 }}><span style={{ color: C.teal, flexShrink: 0 }}>・</span><span>{item}</span></div>
          ))}
        </LegalSection>

        <LegalSection title="2. 情報の利用目的">
          {["本サービスの提供・運営・改善","AIによる分析・提案・レポート生成","お問い合わせへの対応","利用規約違反行為への対応"].map((item,i)=>(
            <div key={i} style={{ display: "flex", gap: 8 }}><span style={{ color: C.teal, flexShrink: 0 }}>（{i+1}）</span><span>{item}</span></div>
          ))}
        </LegalSection>

        <LegalSection title="3. 第三者への情報提供">
          <p>運営者は、以下の場合を除き、利用者の個人情報を第三者に提供しません。</p>
          <div style={{ marginTop: 8 }}>
            {["利用者本人の同意がある場合","法令に基づく場合","人の生命・身体・財産の保護のために必要な場合"].map((item,i)=>(
              <div key={i} style={{ display: "flex", gap: 8 }}><span style={{ color: C.teal, flexShrink: 0 }}>・</span><span>{item}</span></div>
            ))}
          </div>
        </LegalSection>

        <LegalSection title="4. 業務委託先（AIサービス）への情報送信">
          <p style={{ marginBottom: 12 }}>本サービスは以下の外部AIサービスを利用しています。利用者が入力した情報・対話内容は、AIによる処理のためこれらのサービスに送信されます。</p>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: C.bg }}>
                  {["サービス名","運営会社","利用目的"].map(h=>(
                    <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontWeight: 700, color: C.text, borderBottom: `1px solid ${C.border}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={{ padding: "8px 12px", borderBottom: `1px solid ${C.border}`, color: C.sub }}>Groq API</td>
                  <td style={{ padding: "8px 12px", borderBottom: `1px solid ${C.border}`, color: C.sub }}>Groq, Inc.（米国）</td>
                  <td style={{ padding: "8px 12px", borderBottom: `1px solid ${C.border}`, color: C.sub }}>AI対話・分析・レポート生成</td>
                </tr>
                <tr>
                  <td style={{ padding: "8px 12px", color: C.sub }}>Vercel</td>
                  <td style={{ padding: "8px 12px", color: C.sub }}>Vercel, Inc.（米国）</td>
                  <td style={{ padding: "8px 12px", color: C.sub }}>サービスのホスティング</td>
                </tr>
              </tbody>
            </table>
          </div>
        </LegalSection>

        <LegalSection title="5. データの保管">
          <p>利用者が入力したデータは、ご利用のブラウザのローカルストレージに保存されます。サーバー上には保存されません。ブラウザのデータを削除した場合、入力データも削除されますのでご注意ください。</p>
        </LegalSection>

        <LegalSection title="6. 個人情報の開示・訂正・削除">
          <p>利用者は、自身の個人情報の開示・訂正・削除を請求することができます。ご請求の場合は、下記お問い合わせ先までご連絡ください。なお、ブラウザのローカルストレージに保存されたデータは、ブラウザの設定から削除することができます。</p>
        </LegalSection>

        <LegalSection title="7. プライバシーポリシーの変更">
          <p>運営者は、必要に応じて本ポリシーを変更することがあります。変更後も本サービスを利用し続けた場合、変更後のポリシーに同意したものとみなします。</p>
        </LegalSection>

        <LegalSection title="8. お問い合わせ">
          <div style={{ padding: "14px 18px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10 }}>
            <div><strong>サービス名：</strong>{LEGAL.serviceName}</div>
            <div style={{ marginTop: 4 }}><strong>運営者：</strong>{LEGAL.operator}</div>
            <div style={{ marginTop: 4 }}><strong>メール：</strong>{LEGAL.email}</div>
          </div>
        </LegalSection>

        <div style={{ marginTop: 40, padding: "14px 18px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, fontSize: 12, color: C.muted, textAlign: "center" }}>
          制定日：{LEGAL.since}　／　{LEGAL.serviceName}
        </div>
      </div>
    </div>
  );
}

function Footer({ onTerms, onPrivacy }) {
  return (
    <div style={{ borderTop: `1px solid ${C.border}`, padding: "20px 24px", textAlign: "center", background: C.surface, fontFamily: F }}>
      <div style={{ fontSize: 12, color: C.muted, marginBottom: 8 }}>© 2025 {LEGAL.serviceName}</div>
      <div style={{ display: "flex", justifyContent: "center", gap: 20 }}>
        <button onClick={onTerms} style={{ background: "none", border: "none", color: C.sub, cursor: "pointer", fontSize: 12, fontFamily: F, textDecoration: "underline" }}>利用規約</button>
        <button onClick={onPrivacy} style={{ background: "none", border: "none", color: C.sub, cursor: "pointer", fontSize: 12, fontFamily: F, textDecoration: "underline" }}>プライバシーポリシー</button>
      </div>
    </div>
  );
}

// ── Data ─────────────────────────────────────────────────────
const INDUSTRIES = ["IT・通信","メーカー・製造","金融・保険","商社・流通","小売・サービス","医療・福祉","教育","建設・不動産","コンサルティング","広告・メディア","公務員・非営利","その他"];
const POSITIONS  = ["一般社員・スタッフ","主任・リーダー","係長・課長補佐","課長・マネージャー","部長・シニアマネージャー","役員・経営者","フリーランス","学生・就活中","その他"];
const WANTS      = ["年収アップ","キャリアアップ","職種・業界チェンジ","ワークライフバランス改善","人間関係","会社の将来性への不安","スキルアップ・成長機会","働き方の変化（リモート等）","その他"];
const SKILL_CATS = [
  { label:"コミュニケーション", color:"#4361EE", Icon:MessageCircle, skills:["プレゼンテーション","交渉・説得","ヒアリング","文章作成","語学（英語）","ファシリテーション","クレーム対応","電話・メール応対"] },
  { label:"思考・分析",         color:"#7B2FBE", Icon:Brain,         skills:["論理的思考","データ分析","課題発見","企画立案","リサーチ","数値管理","問題解決"] },
  { label:"マネジメント",       color:"#E8960C", Icon:Users,         skills:["チームマネジメント","プロジェクト管理","目標設定","育成・コーチング","採用","予算管理","リスク管理"] },
  { label:"クリエイティブ",     color:"#E91E8C", Icon:Palette,       skills:["デザイン思考","グラフィック","映像・動画","コピーライティング","SNS運用","ブランディング","写真・撮影"] },
  { label:"営業・マーケ",       color:"#FF6B35", Icon:TrendingUp,    skills:["営業","マーケティング","集客・広告","顧客管理(CRM)","市場調査","SNSマーケ","コンテンツ制作"] },
  { label:"専門・技術",         color:"#27A96C", Icon:Wrench,        skills:["IT・プログラミング","財務・会計","法務","医療・介護","教育・研修","建築・設計","製造・品質管理"] },
  { label:"ビジネス基礎",       color:"#6B8CFF", Icon:Briefcase,     skills:["Excel","Word","PowerPoint","資料作成","スケジュール管理","議事録作成","事務処理","業務改善"] },
];
const YEAR_OPTS = ["半年未満","半年〜1年","1〜3年","3〜5年","5年以上"];
const YEAR_NUM  = { "半年未満":10,"半年〜1年":25,"1〜3年":50,"3〜5年":75,"5年以上":95 };

const THEMES = [
  { id:"moyo",     Icon:Wind,         label:"仕事のもやもや",             desc:"今の仕事で感じる違和感・不満・迷いを整理したい",      color:"#7B2FBE", opening:"今日は、仕事の中で感じているもやもやについてお話を聞かせていただければと思います。最近、仕事の中でどんな場面でもやもやを感じることが多いですか？" },
  { id:"taisetu",  Icon:Gem,          label:"仕事で大切にしていること",   desc:"自分が仕事を通じて何を大事にしているか言語化したい",  color:"#E8960C", opening:"今日は、あなたが仕事を通じて大切にしていることについて、一緒に考えていければと思います。これまでの仕事の中で、「これだけは大事にしてきた」と感じることはありますか？" },
  { id:"tensyoku", Icon:DoorOpen,     label:"転職について考えたい",       desc:"転職の軸・方向性・不安を整理したい",                  color:"#4361EE", opening:"今日は転職についてのお気持ちをお聞かせください。転職を考え始めたのは、どんなきっかけがありましたか？" },
  { id:"tsuyomi",  Icon:Sparkles,     label:"自分の強みを知りたい",       desc:"自分でも気づいていない強み・得意なことを探りたい",    color:"#27A96C", opening:"今日は、あなた自身の強みについて一緒に探っていければと思います。周りの人から「いつもありがとう」とか「助かった」と言われた経験で、思い浮かぶものはありますか？" },
  { id:"career",   Icon:Map,          label:"これからのキャリアを考えたい", desc:"将来どんな働き方・仕事をしたいか考えたい",            color:"#FF6B35", opening:"今日は、これからのキャリアについてお話しできればと思います。5年後・10年後の自分について、漠然とでも何かイメージがありますか？" },
  { id:"free",     Icon:MessageSquare,label:"自由に話したい",             desc:"テーマを決めずに、今感じていることを話したい",        color:"#9097B8", opening:"今日はどんなことでもお話しいただける場です。今、仕事やキャリアのことで頭にあることを、自由に話していただけますか？" },
];

const BASE_SYSTEM = `あなたは国家資格キャリアコンサルタントです。クライアントと1対1のカウンセリングセッションを行っています。

【絶対に使ってはいけない言い回し】
・「〜できてほしいですよね」→NG
・「〜ということでしょうか？」→NG（解釈の押しつけ）
・「〜というのは、つまり〜ということですか？」→NG
・「〜ではないかと思います」→NG（コンサルタントの意見を言わない）
・「〜したほうがいいですよね」→NG（アドバイスしない）
・「それはつまり〜」→NG（勝手にまとめない）
・質問に「というと」「つまり」「要するに」をつける→NG

【自然な受け取り方の例】
・「そうでしたか。」
・「〇〇だったんですね。」（クライアントの言葉をそのまま使う）
・「それはしんどかったですね。」
・「嬉しかったんですね。」
・「なるほど。」

【自然な質問の例】
・「その時、どんな気持ちでしたか？」
・「もう少し聞かせていただけますか？」
・「具体的にはどんな場面でしたか？」
・「そのとき、何が一番気になっていましたか？」
・「〇〇というのは、どういうことですか？」

【基本姿勢】
・傾聴が最優先。クライアントの言葉を受け取ることが仕事
・アドバイス・提案・評価・解釈は絶対にしない
・クライアントが自分で気づくことを支援する

【会話の流れ】
1. クライアントの言葉をそのまま繰り返す（ミラーリング）か、短く受け取る
2. 必要なら感情に寄り添う一言を添える
3. シンプルな質問を一つだけ投げかける

【文体の厳格なルール】
・自然な日本語の話し言葉で書く
・1メッセージは2〜3文まで。短いほど良い
・必ず疑問文で終わること（「〜ですか？」「〜でしたか？」「〜ますか？」）
・質問は一文・一問のみ。補足説明を絶対に足さない
・箇条書きは使わない
・英語・カタカナ専門用語は使わない
・重要な言葉は **太字** にする（例：**やりがい**、**自分らしさ**）`;

const buildSystemPrompt = (themeId, profileSummary) => {
  const theme = THEMES.find(t => t.id === themeId) || THEMES[5];
  const guides = {
    moyo:     `【今日のテーマ：仕事のもやもや】\nもやもやの背景にある感情・欲求を、一緒に探ります。\n・もやもやを感じた具体的な場面を聞く\n・「何がそんなに引っかかっているんだろう」という気持ちに共感する\n・評価・アドバイスは一切しない`,
    taisetu:  `【今日のテーマ：仕事で大切にしていること】\n経験の中から、クライアントが大切にしてきたものを言語化するサポートをします。\n・具体的なエピソードを通じて価値観を探る\n・「そのとき、どんな気持ちでしたか？」で感情を引き出す\n・複数のエピソードに共通するものに気づいてもらう`,
    tensyoku: `【今日のテーマ：転職について】\n転職の「理由」より「何を求めているか」を引き出すことに集中します。\n・転職したい気持ちの背景にある感情や経験を丁寧に聞く\n・焦りや不安があれば、まずそこに共感する`,
    tsuyomi:  `【今日のテーマ：自分の強みを知る】\n経験談から、気づいていない強みを引き出します。\n・褒められた・感謝された経験を具体的に聞く\n・「そのとき、何を意識していましたか？」と聞く\n・「なぜできたと思いますか？」のような解釈を求める質問はしない`,
    career:   `【今日のテーマ：これからのキャリア】\n未来の話をしながら、今の価値観や自己概念を探ります。\n・「なりたい姿」より「どんな状態でいたいか」「何を感じていたいか」を聞く\n・「わからない」という気持ちも大切な出発点として受け取る`,
    free:     `【今日のテーマ：自由対話】\nクライアントが話したいことを中心に進めます。\n・最初の話題をじっくり深掘りする\n・クライアントのペースを最優先する`,
  };
  return `${BASE_SYSTEM}\n\n${guides[themeId]||guides.free}\n\n【クライアント情報（参考）】\n${profileSummary}\n\n最初のメッセージは以下の文で始めてください（変更しないでください）：\n「${theme.opening}」`;
};

// ══════════════════════════════════════════════════════════════
export default function App() {
  const [page, setPage]           = useState("loading");
  const [legalPage, setLegalPage] = useState(null); // "terms" | "privacy" | null
  const [data, setData]           = useState(null);
  const [p1step, setP1step]       = useState(1);
  const [basic, setBasic]         = useState({ name:"", age:"", industry:"", position:"", changeReason:[] });
  const [careers, setCareers]     = useState([{ id:1, company:"", period:"", role:"", achievements:"" }]);
  const [skillMap, setSkillMap]   = useState({});
  const [messages, setMessages]   = useState([]);
  const [input, setInput]         = useState("");
  const [aiTyping, setAiTyping]   = useState(false);
  const [sessionDone, setSessionDone] = useState(false);
  const [report, setReport]       = useState(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [activeTab, setActiveTab]         = useState("note");
  const [selectedTheme, setSelectedTheme] = useState(null);

  const chatEndRef = useRef(null);
  const inputRef   = useRef(null);

  useEffect(() => {
    const d = load();
    if (d) {
      setData(d);
      setSkillMap(d.skillMap||{});
      setBasic(d.basic||{ name:"", age:"", industry:"", position:"", changeReason:[] });
      setCareers(d.careers&&d.careers.length>0 ? d.careers : [{ id:1, company:"", period:"", role:"", achievements:"" }]);
      setSelectedTheme(d.selectedTheme||null);
      setPage("dashboard");
    } else {
      setPage("home");
    }
  }, []);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  useEffect(() => {
    if (!aiTyping && page === "phase2" && messages.length > 0) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [aiTyping, page]);

  const persist = (updates) => {
    const nd = { ...(data||{}), basic, careers, skillMap, ...updates, savedAt: new Date().toISOString() };
    setData(nd); save(nd);
  };

  const toggleReason = (r) => setBasic(prev => ({
    ...prev,
    changeReason: prev.changeReason.includes(r) ? prev.changeReason.filter(x=>x!==r) : [...prev.changeReason, r]
  }));
  const addCareer    = () => setCareers(prev => [...prev, { id:Date.now(), company:"", period:"", role:"", achievements:"" }]);
  const removeCareer = (id) => setCareers(prev => prev.filter(c=>c.id!==id));
  const updateCareer = (id, field, val) => setCareers(prev => prev.map(c=>c.id===id?{...c,[field]:val}:c));
  const toggleSkill  = (skill) => setSkillMap(prev => { const n={...prev}; if(n[skill]) delete n[skill]; else n[skill]="半年未満"; return n; });
  const setYears     = (skill, y) => setSkillMap(prev => ({...prev,[skill]:y}));

  const buildProfileSummary = () =>
    `名前: ${basic.name||"未入力"}、年齢: ${basic.age?basic.age+"歳":"未入力"}、業界: ${basic.industry||"未入力"}、ポジション: ${basic.position||"未入力"}、やりたいこと: ${basic.changeReason.join("、")||"未入力"}\n職歴: ${careers.filter(c=>c.company||c.role).map(c=>`${c.company}（${c.period}）${c.role}${c.achievements?" ／"+c.achievements:""}`).join(" / ")||"未入力"}\nスキル: ${Object.keys(skillMap).join("、")||"未入力"}`;

  const completePhase1 = () => {
    persist({ basic, careers, skillMap, phase1Done: true });
    setPage("theme-select");
  };

  const startConsulting = async (themeId) => {
    setSelectedTheme(themeId);
    setMessages([{ role:"assistant", content:"" }]);
    setAiTyping(true);
    try {
      const sysPrompt = buildSystemPrompt(themeId, buildProfileSummary());
      await callAIStream(
        [{ role:"system", content:sysPrompt }, { role:"user", content:"よろしくお願いします。" }],
        (partial) => setMessages([{ role:"assistant", content:partial }])
      );
    } catch {
      setMessages([{ role:"assistant", content:"申し訳ありません。接続エラーが発生しました。再度お試しください。" }]);
    }
    setAiTyping(false);
  };

  const sendMessage = async () => {
    if (!input.trim() || aiTyping) return;
    const userMsg = { role:"user", content:input.trim() };
    const newMessages = [...messages, userMsg];
    setMessages([...newMessages, { role:"assistant", content:"" }]);
    setInput("");
    setAiTyping(true);
    try {
      const userTurns = newMessages.filter(m=>m.role==="user").length;
      const isNearEnd = userTurns >= 7 && !sessionDone;
      const endingHint = isNearEnd ? "\n\n【セッション終盤】そろそろ対話のまとめに入ってください。これまでの会話で繰り返し出てきた言葉やテーマを丁寧にフィードバックし、クライアント自身に気づきを確認してもらってください。「ここまでの対話をもとにレポートを作成できます」と最後に自然に伝えてください。" : "";
      const sysPrompt = buildSystemPrompt(selectedTheme||"free", buildProfileSummary()) + endingHint;
      let finalReply = "";
      await callAIStream(
        [{ role:"system", content:sysPrompt }, ...newMessages],
        (partial) => { finalReply = partial; setMessages([...newMessages, { role:"assistant", content:partial }]); }
      );
      if (isNearEnd) setSessionDone(true);
      persist({ messages:[...newMessages, { role:"assistant", content:finalReply }], selectedTheme });
    } catch {
      setMessages([...newMessages, { role:"assistant", content:"申し訳ありません。エラーが発生しました。もう一度送信してください。" }]);
    }
    setAiTyping(false);
  };

  const generateReport = async () => {
    setReportLoading(true);
    try {
      const conversation = messages.map(m=>`${m.role==="user"?"クライアント":"コンサルタント"}: ${m.content}`).join("\n");
      const profileSummary = `職歴: ${careers.map(c=>`${c.company} ${c.role}`).join("、")}、スキル: ${Object.keys(skillMap).join("、")}`;
      const prompt = `以下はキャリアコンサルティングの対話記録です。この内容をもとに自己理解レポートを作成してください。JSONのみで返答してください（説明文・マークダウン不要）。\n\nプロフィール: ${profileSummary}\nテーマ: ${THEMES.find(t=>t.id===selectedTheme)?.label||"自由対話"}\n\n対話記録:\n${conversation}\n\n以下のJSON形式のみで返答:\n{"strengths":["強み1","強み2","強み3"],"softSkills":["ソフトスキル1","ソフトスキル2","ソフトスキル3"],"values":["価値観1","価値観2","価値観3"],"careerAxis":"キャリアの軸（2〜3文）","selfPR":"自己PR文のベース（150文字程度）","nextSteps":["次のアクション1","次のアクション2","次のアクション3"],"aiComment":"全体的な所感・応援メッセージ（2〜3文）","insights":[{"label":"キーワード","text":"対話を通じて明確になったこと（1文）"}]}\n\ninsightsは対話の中で特に重要な気づきを3〜5個抽出してください。`;
      const result = await callAIJSON([{ role:"user", content:prompt }]);
      setReport(result);
      persist({ report:result, phase2Done:true, messages, selectedTheme });
      setPage("report");
    } catch(e) {
      alert(`レポート生成エラー: ${e.message}`);
    }
    setReportLoading(false);
  };

  const IS = { width:"100%", padding:"10px 14px", background:C.bg, border:`1px solid ${C.border}`, borderRadius:10, color:C.text, fontSize:14, fontFamily:F, outline:"none" };

  // ── Shell ──────────────────────────────────────────────────
  const shell = (children, fullHeight = false) => (
    <div style={{ minHeight:"100vh", background:C.bg, color:C.text, fontFamily:F, display:"flex", flexDirection:"column" }}>
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
      <nav style={{ background:C.surface, borderBottom:`1px solid ${C.border}`, padding:"0 24px", display:"flex", alignItems:"center", justifyContent:"space-between", height:58, position:"sticky", top:0, zIndex:100, boxShadow:C.shadow, flexShrink:0 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10, cursor:"pointer" }} onClick={()=>setPage(data?"dashboard":"home")}>
          <img src={logoPathnote} alt="PathNote" style={{ width:30, height:30, objectFit:"contain" }}/>
          <span style={{ fontWeight:700, fontSize:16, color:C.text, letterSpacing:"-0.02em" }}>PathNote</span>
        </div>
        {data && <Btn variant="ghost" onClick={()=>setPage("dashboard")} style={{ padding:"7px 16px", fontSize:13 }}>マイページ</Btn>}
      </nav>
      <div style={{ flex:1, display:"flex", flexDirection:"column" }}>{children}</div>
      {!fullHeight && <Footer onTerms={()=>setLegalPage("terms")} onPrivacy={()=>setLegalPage("privacy")}/>}
    </div>
  );

  // ── Legal pages ────────────────────────────────────────────
  if (legalPage === "terms")   return <TermsOfService onClose={()=>setLegalPage(null)}/>;
  if (legalPage === "privacy") return <PrivacyPolicy  onClose={()=>setLegalPage(null)}/>;

  // ── Loading ────────────────────────────────────────────────
  if (page === "loading") return shell(
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", flex:1, gap:12, color:C.muted }}>
      <div style={{ width:20, height:20, border:`2px solid ${C.border}`, borderTopColor:C.accent, borderRadius:"50%", animation:"spin .8s linear infinite" }}/>
      読み込み中...
    </div>
  );

  // ── Home ───────────────────────────────────────────────────
  if (page === "home") return shell(
    <div>
      <div style={{ background:`linear-gradient(135deg,#F0F4FF 0%,#E8F7F5 100%)`, padding:"72px 24px 60px", textAlign:"center" }}>
        <div style={{ maxWidth:640, margin:"0 auto" }}>
          <Badge label="キャリア自己理解サービス" color={C.teal}/>
          <h1 style={{ fontSize:36, fontWeight:800, lineHeight:1.3, marginTop:20, marginBottom:16, color:C.text, letterSpacing:"-0.03em" }}>
            自分を知ることが、<br/>次の一歩につながる。
          </h1>
          <p style={{ fontSize:16, color:C.sub, lineHeight:1.9, marginBottom:36 }}>
            スキルの棚卸しとAIキャリアコンサルティングを通じて、<br/>
            あなたの強み・価値観・キャリアの軸を言語化します。
          </p>
          <Btn onClick={()=>setPage("phase1")} style={{ padding:"16px 40px", fontSize:16, borderRadius:12, display:"inline-flex", alignItems:"center", gap:8 }}>
            無料で始める <ChevronRight size={17}/>
          </Btn>
        </div>
      </div>
      <div style={{ maxWidth:760, margin:"0 auto", padding:"60px 24px" }}>
        <h2 style={{ fontSize:22, fontWeight:700, textAlign:"center", marginBottom:40 }}>PathNoteでできること</h2>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))", gap:20 }}>
          {[
            { Icon:ClipboardList, title:"スキルの棚卸し",    desc:"職歴・スキル・実績を整理。客観的な自分の強みを把握します。",       color:C.accent },
            { Icon:MessageCircle, title:"AIコンサルティング", desc:"AIが対話を通じてソフトスキルや価値観を引き出します。",            color:C.teal },
            { Icon:FileText,      title:"自己理解レポート",   desc:"対話の内容から強み・価値観・自己PR文のベースを生成。",            color:C.gold },
            { Icon:Rocket,        title:"書類への活用",       desc:"（近日公開）履歴書・職務経歴書の自動生成機能。",                  color:C.muted },
          ].map(s=>(
            <Card key={s.title} style={{ padding:20 }}>
              <div style={{ marginBottom:14 }}><s.Icon size={26} color={s.color} strokeWidth={1.5}/></div>
              <div style={{ fontWeight:700, fontSize:15, marginBottom:8, color:s.color }}>{s.title}</div>
              <div style={{ fontSize:13, color:C.sub, lineHeight:1.7 }}>{s.desc}</div>
            </Card>
          ))}
        </div>
        <div style={{ textAlign:"center", marginTop:48 }}>
          <Btn onClick={()=>setPage("phase1")} style={{ padding:"14px 36px", fontSize:15, borderRadius:12, display:"inline-flex", alignItems:"center", gap:8 }}>
            スキルの棚卸しを始める <ChevronRight size={16}/>
          </Btn>
        </div>
      </div>
    </div>
  );

  // ── Phase 1 ────────────────────────────────────────────────
  if (page === "phase1") return shell(
    <div style={{ maxWidth:720, margin:"0 auto", padding:"32px 20px", animation:"fadeUp 0.4s ease" }}>
      <div style={{ marginBottom:32 }}>
        <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, color:C.muted, marginBottom:8 }}>
          <span>PHASE 1：スキルの棚卸し</span><span>{p1step}/4</span>
        </div>
        <div style={{ background:C.border, borderRadius:99, height:4 }}>
          <div style={{ width:`${(p1step/4)*100}%`, height:"100%", background:C.accent, borderRadius:99, transition:"width 0.4s ease" }}/>
        </div>
        <div style={{ display:"flex", marginTop:10 }}>
          {[["1","基本情報"],["2","職務経歴"],["3","スキル"],["4","確認"]].map(([n,label],i)=>(
            <div key={n} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:4 }}>
              <div style={{ width:24, height:24, borderRadius:"50%", background:p1step>i?C.accent:p1step===i+1?C.accent:C.border, color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:700 }}>{p1step>i?"✓":n}</div>
              <span style={{ fontSize:11, color:p1step===i+1?C.accent:C.muted }}>{label}</span>
            </div>
          ))}
        </div>
      </div>

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
              <label style={{ display:"block", fontSize:12, fontWeight:600, color:C.sub, marginBottom:8 }}>このサービスでやりたいこと（複数選択可）</label>
              <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
                {WANTS.map(r=>{
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
            <Btn onClick={()=>setP1step(2)} style={{ width:"100%", display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}>
              次へ：職務経歴 <ChevronRight size={15}/>
            </Btn>
          </div>
        </div>
      )}

      {p1step === 2 && (
        <div>
          <h2 style={{ fontSize:22, fontWeight:700, marginBottom:6 }}>職務経歴</h2>
          <p style={{ color:C.sub, fontSize:14, marginBottom:12 }}>これまでの職歴を入力してください（直近から）</p>
          <div style={{ background:C.accentL, border:`1px solid ${C.accent}33`, borderRadius:10, padding:"10px 16px", marginBottom:20, fontSize:13, color:C.accent, display:"flex", alignItems:"center", gap:8 }}>
            <Lightbulb size={15} color={C.accent} strokeWidth={1.8}/>
            <span>実績・担当業務を詳しく入力するほど、AIのスキル解析と提案の精度が上がります</span>
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
            {careers.map((c,i)=>(
              <Card key={c.id} style={{ padding:20 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
                  <span style={{ fontSize:13, fontWeight:700, color:C.accent }}>職歴 {i+1}</span>
                  {careers.length > 1 && <button onClick={()=>removeCareer(c.id)} style={{ background:"none", border:"none", color:C.muted, cursor:"pointer", fontSize:18 }}>×</button>}
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
            <Btn variant="secondary" onClick={()=>setP1step(1)} style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}><ChevronLeft size={15}/> 戻る</Btn>
            <Btn onClick={()=>setP1step(3)} style={{ flex:2, display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}>次へ：スキル <ChevronRight size={15}/></Btn>
          </div>
        </div>
      )}

      {p1step === 3 && (
        <div style={{ margin:"0 -24px" }}>
          <div style={{ padding:"0 24px", marginBottom:24 }}>
            <h2 style={{ fontSize:22, fontWeight:700, marginBottom:6 }}>スキルの棚卸し</h2>
            <p style={{ color:C.sub, fontSize:14, marginBottom:6 }}>経験・得意なことをすべて選んでください</p>
            <div style={{ color:C.accent, fontFamily:FM, fontSize:12, fontWeight:600 }}>{Object.keys(skillMap).length} 個選択中</div>
          </div>
          {SKILL_CATS.map(cat=>(
            <div key={cat.label} style={{ marginBottom:24, padding:"0 24px" }}>
              <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:10 }}>
                <cat.Icon size={15} color={cat.color} strokeWidth={1.8}/>
                <span style={{ fontSize:13, fontWeight:700, color:cat.color }}>{cat.label}</span>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))", gap:8 }}>
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
          <div style={{ display:"flex", gap:12, marginTop:8, padding:"0 24px" }}>
            <Btn variant="secondary" onClick={()=>setP1step(2)} style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}><ChevronLeft size={15}/> 戻る</Btn>
            <Btn onClick={()=>setP1step(4)} style={{ flex:2, display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}>
              登録内容を確認する <ChevronRight size={15}/>
            </Btn>
          </div>
        </div>
      )}

      {p1step === 4 && (
        <div>
          <h2 style={{ fontSize:22, fontWeight:700, marginBottom:6 }}>登録内容の確認</h2>
          <p style={{ color:C.sub, fontSize:14, marginBottom:24 }}>内容を確認して、問題なければAIコンサルティングへ進みましょう</p>

          <Card style={{ marginBottom:16, padding:20 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
              <div style={{ fontSize:13, fontWeight:700, color:C.accent }}>基本情報</div>
              <button onClick={()=>setP1step(1)} style={{ background:"none", border:"none", color:C.muted, cursor:"pointer", fontSize:12, textDecoration:"underline" }}>編集</button>
            </div>
            <div style={{ display:"flex", flexWrap:"wrap", gap:10 }}>
              {[{label:"名前",value:basic.name||"未入力"},{label:"年齢",value:basic.age?`${basic.age}歳`:"未入力"},{label:"業界",value:basic.industry||"未入力"},{label:"ポジション",value:basic.position||"未入力"}].map(item=>(
                <div key={item.label} style={{ background:C.bg, borderRadius:8, padding:"8px 14px", minWidth:100 }}>
                  <div style={{ fontSize:10, color:C.muted, marginBottom:2 }}>{item.label}</div>
                  <div style={{ fontSize:13, fontWeight:600, color:C.text }}>{item.value}</div>
                </div>
              ))}
            </div>
            {basic.changeReason.length > 0 && (
              <div style={{ marginTop:12 }}>
                <div style={{ fontSize:11, color:C.muted, marginBottom:6 }}>やりたいこと</div>
                <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                  {basic.changeReason.map(r=>(
                    <span key={r} style={{ fontSize:12, padding:"3px 10px", borderRadius:20, background:C.accentL, color:C.accent, fontWeight:600 }}>{r}</span>
                  ))}
                </div>
              </div>
            )}
          </Card>

          <Card style={{ marginBottom:16, padding:20 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
              <div style={{ fontSize:13, fontWeight:700, color:C.accent }}>職務経歴</div>
              <button onClick={()=>setP1step(2)} style={{ background:"none", border:"none", color:C.muted, cursor:"pointer", fontSize:12, textDecoration:"underline" }}>編集</button>
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
              {careers.filter(c=>c.company||c.role).map(c=>(
                <div key={c.id} style={{ borderLeft:`3px solid ${C.accent}`, paddingLeft:12 }}>
                  <div style={{ fontWeight:600, fontSize:14, color:C.text }}>{c.company||"会社名未入力"}</div>
                  <div style={{ fontSize:12, color:C.muted, marginTop:2 }}>{c.period} ／ {c.role}</div>
                  {c.achievements && <div style={{ fontSize:12, color:C.sub, marginTop:4, lineHeight:1.6 }}>{c.achievements}</div>}
                </div>
              ))}
              {careers.every(c=>!c.company&&!c.role) && <div style={{ fontSize:13, color:C.muted }}>未入力</div>}
            </div>
          </Card>

          <Card style={{ marginBottom:24, padding:20 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
              <div style={{ display:"flex", alignItems:"center", gap:8, color:C.accent }}>
                <Wrench size={15} strokeWidth={1.8}/>
                <span style={{ fontSize:13, fontWeight:700, color:C.accent }}>ハードスキル（{Object.keys(skillMap).length}個）</span>
              </div>
              <button onClick={()=>setP1step(3)} style={{ background:"none", border:"none", color:C.muted, cursor:"pointer", fontSize:12, textDecoration:"underline" }}>編集</button>
            </div>
            {Object.keys(skillMap).length === 0 ? (
              <div style={{ fontSize:13, color:C.muted }}>未選択</div>
            ) : (
              <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
                {SKILL_CATS.map(cat=>{
                  const mySkills = cat.skills.filter(s=>skillMap[s]);
                  if (!mySkills.length) return null;
                  return (
                    <div key={cat.label}>
                      <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:8 }}>
                        <cat.Icon size={12} color={cat.color} strokeWidth={1.8}/>
                        <span style={{ fontSize:11, fontWeight:700, color:cat.color }}>{cat.label}</span>
                      </div>
                      <div style={{ display:"flex", flexWrap:"wrap", gap:7 }}>
                        {mySkills.map(skill=>(
                          <div key={skill} style={{ display:"flex", alignItems:"center", gap:6, padding:"5px 12px", background:`${cat.color}0D`, border:`1px solid ${cat.color}33`, borderRadius:20 }}>
                            <span style={{ fontSize:12, color:C.text, fontWeight:500 }}>{skill}</span>
                            <span style={{ fontSize:10, color:cat.color, fontFamily:FM, fontWeight:600 }}>{skillMap[skill]}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          <div style={{ background:C.tealL, border:`1px solid ${C.teal}33`, borderRadius:12, padding:"16px 20px", marginBottom:20, fontSize:14, color:C.teal, lineHeight:1.7, display:"flex", gap:12, alignItems:"flex-start" }}>
            <ConsultantAvatar size={28}/>
            <div>
              <div style={{ fontWeight:700, marginBottom:4 }}>次はAIキャリアコンサルティングへ</div>
              <div style={{ fontSize:13 }}>AIコンサルタントがあなたに質問しながら、言葉にしにくいソフトスキルや価値観を一緒に引き出します。対話は5〜8往復程度です。</div>
            </div>
          </div>

          <div style={{ display:"flex", gap:12, marginBottom:12 }}>
            <Btn variant="secondary" onClick={()=>setP1step(3)} style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}>
              <ChevronLeft size={15}/> 戻る
            </Btn>
            <Btn variant="teal" onClick={completePhase1} style={{ flex:2, display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}>
              <MessageCircle size={15}/> AIコンサルティングへ進む
            </Btn>
          </div>
          <button onClick={()=>{ persist({ basic, careers, skillMap, phase1Done:true }); setPage("dashboard"); }}
            style={{ width:"100%", padding:"12px", background:"transparent", border:`1px solid ${C.border}`, borderRadius:12, color:C.muted, cursor:"pointer", fontSize:13, fontFamily:F, display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}>
            <Save size={14}/> いったん保存してマイページへ
          </button>
        </div>
      )}
    </div>
  );

  // ── Theme Select ───────────────────────────────────────────
  if (page === "theme-select") return shell(
    <div style={{ maxWidth:720, margin:"0 auto", padding:"40px 20px", animation:"fadeUp 0.4s ease" }}>
      <div style={{ textAlign:"center", marginBottom:36 }}>
        <div style={{ fontSize:11, fontWeight:700, color:C.teal, letterSpacing:"0.1em", marginBottom:8 }}>PHASE 2</div>
        <h1 style={{ fontSize:24, fontWeight:800, marginBottom:10 }}>今日話したいテーマを選んでください</h1>
        <p style={{ color:C.sub, fontSize:14, lineHeight:1.7 }}>選んだテーマに合わせて、AIコンサルタントが<br/>対話のスタイルを変えてお話しします。</p>
      </div>

      {/* ハードスキルプレビュー */}
      {Object.keys(skillMap).length > 0 && (
        <Card style={{ marginBottom:28, padding:20 }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16 }}>
            <div style={{ display:"flex", alignItems:"center", gap:8, color:C.accent }}>
              <Wrench size={15} strokeWidth={1.8}/>
              <span style={{ fontSize:13, fontWeight:700 }}>登録済みハードスキル</span>
              <span style={{ fontSize:11, color:C.muted, fontFamily:FM }}>({Object.keys(skillMap).length}個)</span>
            </div>
            <button onClick={()=>{ setP1step(3); setPage("phase1"); }} style={{ background:"none", border:"none", color:C.muted, cursor:"pointer", fontSize:12, textDecoration:"underline", fontFamily:F }}>編集</button>
          </div>
          <div style={{ display:"flex", flexWrap:"wrap", gap:7 }}>
            {SKILL_CATS.flatMap(cat=>
              cat.skills.filter(s=>skillMap[s]).map(skill=>(
                <div key={skill} style={{ display:"flex", alignItems:"center", gap:5, padding:"5px 11px", background:`${cat.color}0D`, border:`1px solid ${cat.color}33`, borderRadius:20 }}>
                  <cat.Icon size={10} color={cat.color} strokeWidth={2}/>
                  <span style={{ fontSize:12, color:C.text, fontWeight:500 }}>{skill}</span>
                  <span style={{ fontSize:10, color:cat.color, fontFamily:FM, fontWeight:600 }}>{skillMap[skill]}</span>
                </div>
              ))
            )}
          </div>
        </Card>
      )}

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:32 }}>
        {THEMES.map(theme=>(
          <button key={theme.id} onClick={()=>{ setPage("phase2"); startConsulting(theme.id); }}
            style={{ textAlign:"left", padding:"20px", background:C.surface, border:`1.5px solid ${C.border}`, borderRadius:16, cursor:"pointer", fontFamily:F, transition:"all 0.2s", boxShadow:C.shadow }}>
            <div style={{ marginBottom:10 }}><theme.Icon size={24} color={theme.color} strokeWidth={1.5}/></div>
            <div style={{ fontWeight:700, fontSize:15, color:theme.color, marginBottom:6 }}>{theme.label}</div>
            <div style={{ fontSize:12, color:C.sub, lineHeight:1.6 }}>{theme.desc}</div>
          </button>
        ))}
      </div>
      <button onClick={()=>setPage("phase1")} style={{ background:"none", border:"none", color:C.muted, cursor:"pointer", fontSize:13, fontFamily:F, display:"flex", alignItems:"center", gap:4 }}>
        <ChevronLeft size={14}/> スキルの棚卸しに戻る
      </button>
    </div>
  );

  // ── Phase 2: Chat ──────────────────────────────────────────
  if (page === "phase2") return shell(
    <div style={{ display:"flex", flexDirection:"column", height:"calc(100dvh - 58px)", overflow:"hidden" }}>
      {/* チャットヘッダー */}
      <div style={{ background:C.surface, borderBottom:`1px solid ${C.border}`, padding:"12px 16px", display:"flex", alignItems:"center", justifyContent:"space-between", flexShrink:0, zIndex:10 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          {selectedTheme && (()=>{ const t=THEMES.find(x=>x.id===selectedTheme); return t?<><t.Icon size={16} color={t.color} strokeWidth={1.8}/><div><div style={{ fontSize:13, fontWeight:700, color:t.color }}>{t.label}</div><div style={{ fontSize:11, color:C.muted }}>AIキャリアコンサルティング</div></div></>:null; })()}
        </div>
        <div style={{ display:"flex", gap:6, alignItems:"center" }}>
          <button onClick={()=>setPage("theme-select")} style={{ background:"none", border:`1px solid ${C.border}`, borderRadius:8, padding:"5px 10px", color:C.muted, cursor:"pointer", fontSize:12, fontFamily:F }}>テーマ変更</button>
          {sessionDone && (
            <Btn variant="teal" onClick={generateReport} disabled={reportLoading} style={{ padding:"6px 12px", fontSize:12, display:"flex", alignItems:"center", gap:5 }}>
              <FileText size={13}/> {reportLoading?"生成中...":"レポート作成"}
            </Btn>
          )}
        </div>
      </div>

      {/* チャットエリア（スクロール可能） */}
      <div style={{ flex:1, overflowY:"auto", WebkitOverflowScrolling:"touch", padding:"20px 16px", display:"flex", flexDirection:"column", gap:14 }}>
        {messages.length === 0 && (
          <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100%", color:C.muted, fontSize:14 }}>
            <div style={{ width:18, height:18, border:`2px solid ${C.border}`, borderTopColor:C.teal, borderRadius:"50%", animation:"spin .8s linear infinite", marginRight:8 }}/>
            準備中です...
          </div>
        )}
        {messages.map((msg,i)=>(
          <div key={i} style={{ display:"flex", flexDirection:msg.role==="user"?"row-reverse":"row", gap:8, alignItems:"flex-end" }}>
            {msg.role === "assistant" && <div style={{ flexShrink:0 }}><ConsultantAvatar size={32}/></div>}
            <div style={{ maxWidth:"80%", padding:"12px 14px", borderRadius:msg.role==="user"?"16px 16px 4px 16px":"16px 16px 16px 4px", background:msg.role==="user"?C.accent:C.surface, color:msg.role==="user"?"#fff":C.text, fontSize:14, lineHeight:1.85, boxShadow:C.shadow, border:msg.role==="user"?"none":`1px solid ${C.border}`, whiteSpace:"pre-wrap" }}>
              {msg.role==="assistant" ? <BoldText text={msg.content}/> : msg.content}
              {msg.role==="assistant" && aiTyping && i===messages.length-1 && msg.content && (
                <span style={{ display:"inline-block", width:2, height:14, background:C.teal, marginLeft:2, animation:"blink 0.8s infinite", verticalAlign:"middle" }}/>
              )}
            </div>
          </div>
        ))}
        {aiTyping && messages[messages.length-1]?.content==="" && (
          <div style={{ display:"flex", gap:8, alignItems:"flex-end" }}>
            <div style={{ flexShrink:0 }}><ConsultantAvatar size={32}/></div>
            <div style={{ padding:"12px 16px", borderRadius:"16px 16px 16px 4px", background:C.surface, border:`1px solid ${C.border}`, boxShadow:C.shadow, display:"flex", gap:4, alignItems:"center" }}>
              {[0,1,2].map(i=><div key={i} style={{ width:6, height:6, borderRadius:"50%", background:C.muted, animation:`blink 1.2s ${i*0.3}s infinite` }}/>)}
            </div>
          </div>
        )}
        <div ref={chatEndRef}/>
      </div>

      {/* 入力エリア */}
      <div style={{ background:C.surface, borderTop:`1px solid ${C.border}`, padding:"12px 16px", flexShrink:0 }}>
        {sessionDone && (
          <div style={{ marginBottom:10, padding:"8px 14px", background:C.tealL, border:`1px solid ${C.teal}44`, borderRadius:10, fontSize:12, color:C.teal, display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:8 }}>
            <span>対話の内容が十分になりました</span>
            <Btn variant="teal" onClick={generateReport} disabled={reportLoading} style={{ padding:"5px 12px", fontSize:12, display:"flex", alignItems:"center", gap:5 }}>
              <FileText size={12}/> {reportLoading?"生成中...":"レポートを作成"}
            </Btn>
          </div>
        )}
        <div style={{ display:"flex", gap:8, alignItems:"flex-end" }}>
          <textarea ref={inputRef} value={input} onChange={e=>setInput(e.target.value)}
            onKeyDown={e=>{ if(e.key==="Enter"&&(e.ctrlKey||e.metaKey)){ e.preventDefault(); sendMessage(); } }}
            placeholder="メッセージを入力...（Ctrl+Enterで送信）" disabled={aiTyping}
            style={{...IS, flex:1, minHeight:44, maxHeight:100, lineHeight:1.6, resize:"none", borderRadius:12, padding:"10px 14px", fontSize:14 }}/>
          <button onClick={sendMessage} disabled={aiTyping||!input.trim()}
            style={{ width:44, height:44, borderRadius:12, background:input.trim()&&!aiTyping?C.teal:C.border, border:"none", color:"#fff", fontSize:18, cursor:input.trim()&&!aiTyping?"pointer":"not-allowed", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center", transition:"all 0.15s" }}>
            ↑
          </button>
        </div>
      </div>
    </div>
  , true);

  // ── Report ─────────────────────────────────────────────────
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

        <Card style={{ background:C.tealL, border:`1px solid ${C.teal}33`, marginBottom:20 }}>
          <div style={{ display:"flex", alignItems:"center", gap:7, marginBottom:10, color:C.teal }}>
            <MessageCircle size={14} strokeWidth={1.8}/><span style={{ fontSize:12, fontWeight:700 }}>AIコンサルタントより</span>
          </div>
          <p style={{ color:C.sub, fontSize:14, lineHeight:1.8 }}>{r.aiComment}</p>
        </Card>

        <Card style={{ marginBottom:20 }}>
          <div style={{ display:"flex", alignItems:"center", gap:7, marginBottom:10, color:C.accent }}>
            <Compass size={14} strokeWidth={1.8}/><span style={{ fontSize:12, fontWeight:700 }}>あなたのキャリアの軸</span>
          </div>
          <p style={{ color:C.text, fontSize:15, lineHeight:1.8, fontWeight:500 }}>{r.careerAxis}</p>
        </Card>

        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:16, marginBottom:20 }}>
          {[{label:"強み",Icon:Award,items:r.strengths,color:C.accent},{label:"ソフトスキル",Icon:Sparkles,items:r.softSkills,color:C.teal},{label:"価値観",Icon:Heart,items:r.values,color:C.gold}].map(section=>(
            <Card key={section.label} style={{ padding:18 }}>
              <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:12, color:section.color }}>
                <section.Icon size={13} strokeWidth={1.8}/><span style={{ fontSize:12, fontWeight:700 }}>{section.label}</span>
              </div>
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

        <Card style={{ marginBottom:20, background:C.goldL, border:`1px solid ${C.gold}33` }}>
          <div style={{ display:"flex", alignItems:"center", gap:7, marginBottom:10, color:C.gold }}>
            <PenLine size={14} strokeWidth={1.8}/><span style={{ fontSize:12, fontWeight:700 }}>自己PR文のベース</span>
          </div>
          <p style={{ color:C.text, fontSize:14, lineHeight:1.9 }}>{r.selfPR}</p>
          <div style={{ fontSize:11, color:C.muted, marginTop:8 }}>※このテキストをベースに、自己PR文を仕上げてください</div>
        </Card>

        <Card style={{ marginBottom:32 }}>
          <div style={{ display:"flex", alignItems:"center", gap:7, marginBottom:12, color:C.green }}>
            <ArrowRight size={14} strokeWidth={1.8}/><span style={{ fontSize:12, fontWeight:700 }}>次のアクション</span>
          </div>
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
          <Btn onClick={()=>{ persist({ report:r }); setPage("dashboard"); }} style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}>
            <Save size={14}/> 保存してマイページへ
          </Btn>
          <Btn variant="secondary" onClick={()=>setPage("phase2")} style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}>
            <ChevronLeft size={14}/> 対話に戻る
          </Btn>
        </div>
      </div>
    );
  }

  // ── Dashboard ──────────────────────────────────────────────
  if (page === "dashboard") {
    const d2 = data||{};
    const b  = d2.basic||{};
    const r  = d2.report;
    const sm = d2.skillMap||{};
    const cs = d2.careers||[];
    const skillCount = Object.keys(sm).length;
    const savedAt    = d2.savedAt ? new Date(d2.savedAt).toLocaleDateString("ja-JP") : "—";

    // タブ定義
    const TABS = [
      { id:"note",     label:"キャリアノート",  Icon:BookOpen },
      { id:"dialogue", label:"対話ログ",        Icon:MessageCircle },
      { id:"career",   label:"職務経歴",         Icon:Building2 },
    ];
    // activeTabはstateから使う（初期値を"note"に設定済み）

    return shell(
      <div style={{ maxWidth:860, margin:"0 auto", padding:"32px 20px", animation:"fadeUp 0.4s ease" }}>

        {/* ── ヘッダー ── */}
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:28 }}>
          <div>
            <div style={{ fontSize:11, fontWeight:700, color:C.accent, letterSpacing:"0.1em", marginBottom:6 }}>MY PAGE</div>
            <h1 style={{ fontSize:22, fontWeight:800 }}>{b.name?`${b.name}さんのキャリアノート`:"マイキャリアノート"}</h1>
            <div style={{ color:C.muted, fontSize:12, marginTop:4 }}>最終更新: {savedAt}</div>
          </div>
          <div style={{ display:"flex", gap:8 }}>
            <Btn variant="teal" onClick={()=>{ setMessages([]); setSessionDone(false); setPage("theme-select"); }} style={{ fontSize:13, padding:"8px 14px", display:"flex", alignItems:"center", gap:6 }}>
              <MessageCircle size={14}/> AI対話
            </Btn>
            <Btn onClick={()=>{ setP1step(1); setPage("phase1"); }} variant="ghost" style={{ fontSize:13, padding:"8px 14px" }}>+ 情報を更新</Btn>
          </div>
        </div>

        {/* ── ステータスバー ── */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10, marginBottom:28 }}>
          {[
            { label:"登録スキル",     value:skillCount,              unit:"個", color:C.accent, bg:C.accentL, done:skillCount>0 },
            { label:"AI対話",        value:d2.phase2Done?"完了":"未実施", unit:"", color:d2.phase2Done?C.teal:C.muted, bg:d2.phase2Done?C.tealL:C.bg, done:d2.phase2Done },
            { label:"自己理解レポート", value:r?"作成済み":"未作成",    unit:"", color:r?C.gold:C.muted, bg:r?C.goldL:C.bg, done:!!r },
          ].map(card=>(
            <div key={card.label} style={{ background:card.bg, border:`1px solid ${card.done?card.color+"44":C.border}`, borderRadius:12, padding:"14px 16px" }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
                <div style={{ color:card.color, fontSize:11, fontWeight:700 }}>{card.label}</div>
                {card.done ? <Check size={14} color={card.color} strokeWidth={2.5}/> : <div style={{ width:14, height:14, borderRadius:3, border:`1.5px solid ${C.border}` }}/>}
              </div>
              <div style={{ fontSize:typeof card.value==="number"?22:13, fontWeight:700, color:card.color }}>
                {card.value}<span style={{ fontSize:11, color:card.color, opacity:0.7 }}>{card.unit}</span>
              </div>
            </div>
          ))}
        </div>

        {/* ── タブナビ ── */}
        <div style={{ display:"flex", gap:2, marginBottom:28, borderBottom:`2px solid ${C.border}` }}>
          {TABS.map(tab=>(
            <button key={tab.id} onClick={()=>setActiveTab(tab.id)}
              style={{ display:"flex", alignItems:"center", gap:7, padding:"10px 20px", background:"transparent", border:"none", borderBottom:`2px solid ${activeTab===tab.id?C.accent:"transparent"}`, marginBottom:"-2px", color:activeTab===tab.id?C.accent:C.muted, cursor:"pointer", fontSize:14, fontFamily:F, fontWeight:activeTab===tab.id?700:400, transition:"all 0.2s" }}>
              <tab.Icon size={15} strokeWidth={1.8}/>{tab.label}
            </button>
          ))}
        </div>

        {/* ════════════════════════════════════════════
            タブ①：キャリアノート
        ════════════════════════════════════════════ */}
        {activeTab === "note" && (
          <div style={{ animation:"fadeUp 0.3s ease" }}>
            {r ? (
              <div style={{ display:"flex", flexDirection:"column", gap:20 }}>

                {/* キャリアの軸 */}
                <Card style={{ borderLeft:`4px solid ${C.teal}`, borderRadius:"0 16px 16px 0" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:14, color:C.teal }}>
                    <Compass size={18} strokeWidth={1.8}/>
                    <span style={{ fontSize:15, fontWeight:700 }}>キャリアの軸</span>
                  </div>
                  <p style={{ color:C.text, fontSize:15, lineHeight:2, fontWeight:500 }}>{r.careerAxis}</p>
                </Card>

                {/* 強み・ソフトスキル・価値観 */}
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:14 }}>
                  {[
                    { label:"強み",       Icon:Award,    items:r.strengths,  color:C.accent },
                    { label:"ソフトスキル", Icon:Sparkles, items:r.softSkills, color:C.teal },
                    { label:"価値観",     Icon:Heart,    items:r.values,     color:C.gold },
                  ].map(section=>(
                    <Card key={section.label} style={{ padding:20 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:7, marginBottom:14, color:section.color }}>
                        <section.Icon size={16} strokeWidth={1.8}/>
                        <span style={{ fontSize:14, fontWeight:700 }}>{section.label}</span>
                      </div>
                      <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                        {(section.items||[]).map((item,i)=>(
                          <div key={i} style={{ display:"flex", alignItems:"flex-start", gap:8, padding:"8px 12px", background:`${section.color}0D`, borderRadius:8 }}>
                            <span style={{ color:section.color, fontWeight:700, flexShrink:0, fontSize:13 }}>▸</span>
                            <span style={{ fontSize:13, color:C.text, lineHeight:1.6 }}>{item}</span>
                          </div>
                        ))}
                      </div>
                    </Card>
                  ))}
                </div>

                {/* 自己PR */}
                <Card style={{ background:C.goldL, border:`1px solid ${C.gold}44` }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:14, color:C.gold }}>
                    <PenLine size={18} strokeWidth={1.8}/>
                    <span style={{ fontSize:15, fontWeight:700 }}>自己PRのベース</span>
                    <span style={{ fontSize:11, color:C.muted, marginLeft:"auto" }}>※このテキストをベースに仕上げてください</span>
                  </div>
                  <p style={{ color:C.text, fontSize:14, lineHeight:2 }}>{r.selfPR}</p>
                </Card>

                {/* ハードスキル */}
                {skillCount > 0 && (
                  <Card>
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:20 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:8, color:C.accent }}>
                        <Wrench size={18} strokeWidth={1.8}/>
                        <span style={{ fontSize:15, fontWeight:700 }}>ハードスキル</span>
                        <span style={{ fontSize:12, color:C.muted, fontFamily:FM }}>{skillCount}個</span>
                      </div>
                      <Btn variant="secondary" onClick={()=>{ setP1step(3); setPage("phase1"); }} style={{ padding:"5px 12px", fontSize:12 }}>編集</Btn>
                    </div>
                    <div style={{ display:"flex", flexDirection:"column", gap:20 }}>
                      {SKILL_CATS.map(cat=>{
                        const mySkills = cat.skills.filter(s=>sm[s]);
                        if (!mySkills.length) return null;
                        return (
                          <div key={cat.label}>
                            <div style={{ display:"flex", alignItems:"center", gap:7, marginBottom:10 }}>
                              <cat.Icon size={14} color={cat.color} strokeWidth={1.8}/>
                              <span style={{ fontSize:12, fontWeight:700, color:cat.color }}>{cat.label}</span>
                            </div>
                            <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
                              {mySkills.map(skill=>(
                                <div key={skill} style={{ display:"flex", alignItems:"center", gap:8, padding:"7px 14px", background:C.bg, border:`1px solid ${cat.color}44`, borderRadius:20 }}>
                                  <span style={{ fontSize:13, color:C.text, fontWeight:500 }}>{skill}</span>
                                  <span style={{ fontSize:11, color:cat.color, fontFamily:FM, fontWeight:600 }}>{sm[skill]}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </Card>
                )}

              </div>
            ) : (
              /* レポート未作成 */
              <Card style={{ textAlign:"center", padding:48 }}>
                <div style={{ display:"flex", justifyContent:"center", marginBottom:20 }}>
                  <BookOpen size={48} color={C.border} strokeWidth={1}/>
                </div>
                <div style={{ fontSize:17, fontWeight:700, marginBottom:10 }}>キャリアノートはまだ作成されていません</div>
                <p style={{ color:C.sub, fontSize:14, marginBottom:28, lineHeight:1.8 }}>
                  AIコンサルタントとの対話を通じて、<br/>あなたのキャリアの軸・強み・価値観を言語化します。
                </p>
                {skillCount > 0 && (
                  <div style={{ marginBottom:16 }}>
                    <Btn variant="teal" onClick={()=>{ setMessages([]); setSessionDone(false); setPage("theme-select"); }} style={{ padding:"12px 28px", display:"inline-flex", alignItems:"center", gap:6 }}>
                      <MessageCircle size={15}/> AI対話を始める
                    </Btn>
                  </div>
                )}
                {!skillCount && (
                  <Btn onClick={()=>{ setP1step(1); setPage("phase1"); }} style={{ padding:"12px 28px", display:"inline-flex", alignItems:"center", gap:6 }}>
                    <ClipboardList size={15}/> スキルの棚卸しから始める
                  </Btn>
                )}
              </Card>
            )}
          </div>
        )}

        {/* ════════════════════════════════════════════
            タブ②：対話ログ
        ════════════════════════════════════════════ */}
        {activeTab === "dialogue" && (
          <div style={{ animation:"fadeUp 0.3s ease" }}>
            {(r?.insights||[]).length > 0 || (d2.messages||[]).length > 0 ? (
              <div style={{ display:"flex", flexDirection:"column", gap:20 }}>

                {/* 明確になったこと */}
                {(r?.insights||[]).length > 0 && (
                  <Card>
                    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:18, color:C.teal }}>
                      <Lightbulb size={18} strokeWidth={1.8}/>
                      <div>
                        <div style={{ fontSize:15, fontWeight:700 }}>対話を通じて明確になったこと</div>
                        <div style={{ fontSize:11, color:C.muted, marginTop:2 }}>
                          {THEMES.find(t=>t.id===d2.selectedTheme)?.label||"AIコンサルティング"} セッションより
                        </div>
                      </div>
                    </div>
                    <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                      {(r.insights||[]).map((ins,i)=>(
                        <div key={i} style={{ display:"flex", alignItems:"flex-start", gap:12, padding:"12px 16px", background:C.tealL, borderRadius:12, border:`1px solid ${C.teal}22` }}>
                          <div style={{ flexShrink:0, padding:"3px 10px", borderRadius:12, background:C.teal, color:"#fff", fontSize:11, fontWeight:700, whiteSpace:"nowrap" }}>{ins.label}</div>
                          <div style={{ fontSize:13, color:C.sub, lineHeight:1.8 }}>{ins.text}</div>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}

                {/* 対話セッション履歴一覧 */}
                {(d2.messages||[]).length > 0 && (
                  <Card>
                    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:18, color:C.sub }}>
                      <ScrollText size={18} strokeWidth={1.8}/>
                      <div style={{ fontSize:15, fontWeight:700, color:C.text }}>対話セッション履歴</div>
                    </div>
                    <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                      {/* 最新セッション */}
                      <div style={{ padding:"16px 20px", background:C.bg, borderRadius:12, border:`1px solid ${C.border}` }}>
                        <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:12, flexWrap:"wrap" }}>
                          <div>
                            {/* テーマ */}
                            {d2.selectedTheme && (() => {
                              const t = THEMES.find(x=>x.id===d2.selectedTheme);
                              return t ? (
                                <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:8 }}>
                                  <t.Icon size={14} color={t.color} strokeWidth={1.8}/>
                                  <span style={{ fontSize:13, fontWeight:700, color:t.color }}>{t.label}</span>
                                </div>
                              ) : null;
                            })()}
                            {/* 日時・件数 */}
                            <div style={{ fontSize:13, color:C.sub, marginBottom:4 }}>
                              {d2.savedAt ? new Date(d2.savedAt).toLocaleDateString("ja-JP", { year:"numeric", month:"long", day:"numeric" }) : "日時不明"}
                            </div>
                            <div style={{ fontSize:12, color:C.muted }}>
                              {(d2.messages||[]).filter(m=>m.role==="user").length}往復の対話
                              {r?.insights?.length ? `　／　気づき ${r.insights.length}件` : ""}
                            </div>
                          </div>
                          <Btn variant="ghost" onClick={()=>{
                            // 保存済みメッセージを復元して対話画面へ
                            setMessages(d2.messages||[]);
                            setSelectedTheme(d2.selectedTheme||null);
                            setSessionDone(true);
                            setPage("phase2");
                          }} style={{ padding:"7px 16px", fontSize:12, display:"flex", alignItems:"center", gap:6, flexShrink:0 }}>
                            <MessageCircle size={13}/> 対話に戻る
                          </Btn>
                        </div>
                      </div>
                      <div style={{ fontSize:12, color:C.muted, textAlign:"center", padding:"8px 0" }}>
                        ※ 現在は最新セッションのみ保存されます
                      </div>
                    </div>
                  </Card>
                )}

                <div style={{ display:"flex", gap:10 }}>
                  <Btn variant="teal" onClick={()=>{ setMessages([]); setSessionDone(false); setPage("theme-select"); }} style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}>
                    <MessageCircle size={14}/> 新しいテーマで話す
                  </Btn>
                  {r && (
                    <Btn variant="secondary" onClick={()=>setPage("report")} style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}>
                      <FileText size={14}/> レポートを見る
                    </Btn>
                  )}
                </div>
              </div>
            ) : (
              <Card style={{ textAlign:"center", padding:48 }}>
                <div style={{ display:"flex", justifyContent:"center", marginBottom:20 }}>
                  <MessageCircle size={48} color={C.border} strokeWidth={1}/>
                </div>
                <div style={{ fontSize:17, fontWeight:700, marginBottom:10 }}>対話ログはまだありません</div>
                <p style={{ color:C.sub, fontSize:14, marginBottom:28, lineHeight:1.8 }}>
                  AIコンサルタントとの対話を始めると、<br/>ここに履歴と気づきが蓄積されます。
                </p>
                <Btn variant="teal" onClick={()=>{ setMessages([]); setSessionDone(false); setPage("theme-select"); }} style={{ padding:"12px 28px", display:"inline-flex", alignItems:"center", gap:6 }}>
                  <MessageCircle size={15}/> AI対話を始める
                </Btn>
              </Card>
            )}
          </div>
        )}

        {/* ════════════════════════════════════════════
            タブ③：職務経歴（年表）
        ════════════════════════════════════════════ */}
        {activeTab === "career" && (
          <div style={{ animation:"fadeUp 0.3s ease" }}>
            {cs.filter(c=>c.company||c.role).length > 0 ? (
              <div>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:24 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8, color:C.sub }}>
                    <Clock size={16} strokeWidth={1.8}/>
                    <span style={{ fontSize:13, color:C.muted }}>直近から表示</span>
                  </div>
                  <Btn variant="secondary" onClick={()=>{ setP1step(2); setPage("phase1"); }} style={{ padding:"6px 14px", fontSize:12 }}>編集</Btn>
                </div>

                {/* 年表 */}
                <div style={{ position:"relative" }}>
                  {/* 縦線 */}
                  <div style={{ position:"absolute", left:20, top:0, bottom:0, width:2, background:`linear-gradient(to bottom, ${C.accent}, ${C.teal})`, borderRadius:2 }}/>

                  <div style={{ display:"flex", flexDirection:"column", gap:0 }}>
                    {cs.filter(c=>c.company||c.role).map((c, i, arr)=>(
                      <div key={c.id} style={{ display:"flex", gap:0, paddingBottom: i < arr.length-1 ? 32 : 0 }}>
                        {/* ドット */}
                        <div style={{ position:"relative", flexShrink:0, width:42 }}>
                          <div style={{ position:"absolute", left:12, top:16, width:18, height:18, borderRadius:"50%", background: i===0 ? C.accent : C.surface, border:`2.5px solid ${i===0?C.accent:C.teal}`, zIndex:1, display:"flex", alignItems:"center", justifyContent:"center" }}>
                            {i===0 && <div style={{ width:6, height:6, borderRadius:"50%", background:"#fff" }}/>}
                          </div>
                        </div>

                        {/* カード */}
                        <div style={{ flex:1, background:C.surface, border:`1px solid ${i===0?C.accent+"66":C.border}`, borderRadius:14, padding:20, boxShadow: i===0 ? `0 2px 12px ${C.accent}18` : C.shadow }}>
                          {/* 期間バッジ */}
                          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10, flexWrap:"wrap" }}>
                            {c.period && (
                              <span style={{ fontSize:11, padding:"3px 10px", borderRadius:20, background: i===0?C.accentL:C.bg, color: i===0?C.accent:C.muted, fontWeight:600, fontFamily:FM, border:`1px solid ${i===0?C.accent+"44":C.border}` }}>
                                {c.period}
                              </span>
                            )}
                            {i===0 && (
                              <span style={{ fontSize:11, padding:"3px 10px", borderRadius:20, background:C.greenL, color:C.green, fontWeight:700, border:`1px solid ${C.green}44` }}>
                                現在
                              </span>
                            )}
                          </div>

                          {/* 会社名・役割 */}
                          <div style={{ marginBottom:10 }}>
                            <div style={{ fontSize:17, fontWeight:800, color:C.text, marginBottom:4 }}>{c.company||"会社名未入力"}</div>
                            {c.role && (
                              <div style={{ fontSize:14, fontWeight:600, color: i===0?C.accent:C.sub }}>{c.role}</div>
                            )}
                          </div>

                          {/* 実績・業務 */}
                          {c.achievements && (
                            <div style={{ marginTop:12, paddingTop:12, borderTop:`1px solid ${C.border}` }}>
                              <div style={{ fontSize:11, fontWeight:700, color:C.muted, marginBottom:8, letterSpacing:"0.05em" }}>実績・担当業務</div>
                              <div style={{ fontSize:13, color:C.sub, lineHeight:1.9, whiteSpace:"pre-wrap" }}>
                                {c.achievements.split(/[。\n]/).filter(s=>s.trim()).map((sentence, j)=>(
                                  <div key={j} style={{ display:"flex", gap:8, marginBottom:4 }}>
                                    <span style={{ color:C.teal, flexShrink:0, fontWeight:700 }}>▸</span>
                                    <span>{sentence.trim()}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}

                    {/* 年表の終点 */}
                    <div style={{ display:"flex", gap:0 }}>
                      <div style={{ width:42, flexShrink:0, display:"flex", justifyContent:"center" }}>
                        <div style={{ width:10, height:10, borderRadius:"50%", background:C.border, marginTop:4 }}/>
                      </div>
                      <div style={{ paddingTop:4 }}>
                        <span style={{ fontSize:12, color:C.muted }}>キャリアのスタート</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <Card style={{ textAlign:"center", padding:48 }}>
                <div style={{ display:"flex", justifyContent:"center", marginBottom:20 }}>
                  <Building2 size={48} color={C.border} strokeWidth={1}/>
                </div>
                <div style={{ fontSize:17, fontWeight:700, marginBottom:10 }}>職務経歴が登録されていません</div>
                <p style={{ color:C.sub, fontSize:14, marginBottom:28, lineHeight:1.8 }}>
                  職歴を登録すると、ここに年表として表示されます。
                </p>
                <Btn onClick={()=>{ setP1step(2); setPage("phase1"); }} style={{ padding:"12px 28px", display:"inline-flex", alignItems:"center", gap:6 }}>
                  <Building2 size={15}/> 職務経歴を入力する
                </Btn>
              </Card>
            )}
          </div>
        )}

      </div>
    );
  }

  return null;
}
