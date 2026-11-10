"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  BookPlus,
  BrainCircuit,
  FileText,
  ListChecks,
  Loader2,
  MessageCircleQuestion,
  Plus,
  Send,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { Badge, Button, Card, EmptyState, LoadingBlock, Modal } from "@/components/ui";
import { useData } from "@/lib/data";
import { useToast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { askAI, asObjectArray, num, str } from "@/lib/ai";
import { taskStats, minutesByCourse, courseProgress } from "@/lib/stats";
import { shiftDateStr, todayStr } from "@/lib/date";
import type { ChatMessage, Conversation } from "@/lib/types";

type Mode = "chat" | "summary" | "questions" | "flashcards";

const MODES: { mode: Mode; label: string; icon: typeof Bot; template?: string; hint: string }[] = [
  { mode: "chat", label: "Hỏi đáp", icon: Sparkles, hint: "Giải đáp mọi thắc mắc, giải thích khái niệm khó" },
  { mode: "summary", label: "Tóm tắt", icon: FileText, template: "Giúp mình tóm tắt nội dung sau:\n\n", hint: "Dán văn bản/tài liệu cần tóm tắt" },
  { mode: "questions", label: "Trắc nghiệm", icon: ListChecks, template: "Tạo câu hỏi trắc nghiệm từ nội dung sau:\n\n", hint: "AI tạo 5 câu hỏi 4 lựa chọn có đáp án" },
  { mode: "flashcards", label: "Flashcard", icon: BookPlus, template: "Tạo flashcard từ nội dung sau:\n\n", hint: "AI tạo 6–10 thẻ ôn tập" },
];

interface FlashcardDraft {
  question: string;
  answer: string;
}
interface QuizDraft {
  question: string;
  options: string[];
  answerIndex: number;
  explain: string;
}

interface MessageMeta {
  flashcards?: FlashcardDraft[];
  quiz?: QuizDraft[];
}

function uid(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default function AssistantPage() {
  const { loading, conversations, saveConversation, deleteConversation, courses, tasks, sessions, exams, examResults, chapters, flashcards, addFlashcard } = useData();
  const { push } = useToast();

  const [conv, setConv] = useState<Conversation | null>(null);
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<Mode>("chat");
  const [thinking, setThinking] = useState(false);
  const [meta, setMeta] = useState<Record<string, MessageMeta>>({});
  const [courseFilter, setCourseFilter] = useState("");
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const [cardsPreview, setCardsPreview] = useState<FlashcardDraft[] | null>(null);

  /* Mở đường chạy nhanh từ Course Manager: /assistant?create=flashcards&course=... */
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const create = params.get("create");
      if (create === "flashcards") {
        setCourseFilter(params.get("course") ?? "");
        setMode("flashcards");
        setInput("Tạo flashcard từ:- \n\nDán nội dung cần tạo thẻ ở đây…");
      }
    } catch {
      /* ignore */
    }
  }, []);

  const messages = conv?.messages ?? [];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, thinking]);

  const courseMap = useMemo(() => new Map(courses.map((c) => [c.id, c])), [courses]);

  const studyContext = useMemo(
    () => ({
      today: todayStr(),
      courses: courses.map((c) => c.name),
      taskStats: taskStats(tasks),
      weeklyMinutes: Math.round(sessions.filter((s) => new Date(s.startedAt) >= new Date(shiftDateStr(todayStr(), -7))).reduce((a, b) => a + b.durationSec, 0) / 60),
      minutesByCourse: minutesByCourse(sessions, courses).slice(0, 6),
      progressByCourse: courseProgress(courses, tasks, chapters).map((r) => ({ course: r.course.name, tasks: `${r.done}/${r.total}`, chapterScore: r.chapterScore })),
      exams: exams.slice(0, 6).map((e) => ({ title: e.title, date: e.examDate, course: courseMap.get(e.courseId ?? "")?.name ?? "" })),
      examResults: examResults.slice(0, 10).map((r) => ({ exam: exams.find((x) => x.id === r.examId)?.title ?? "", score: r.score })),
      flashcardsDue: flashcards.filter((f) => f.dueDate <= todayStr()).length,
      weakestChapters: chapters.filter((c) => c.understanding <= 2).slice(0, 8).map((c) => ({ course: courseMap.get(c.courseId)?.name ?? "", chapter: c.title })),
    }),
    [courses, tasks, sessions, exams, examResults, chapters, flashcards, courseMap]
  );

  const startNew = useCallback(() => {
    setConv({
      id: uid(),
      title: "Cuộc trò chuyện mới",
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    setMeta({});
  }, []);

  async function handleGenerateFlashcards(cards: FlashcardDraft[]) {
    try {
      for (const c of cards.slice(0, 20)) {
        await addFlashcard({
          courseId: courseFilter || null,
          chapterId: null,
          question: c.question,
          answer: c.answer,
          ease: 2.5,
          interval: 0,
          repetitions: 0,
          dueDate: todayStr(),
          createdAt: new Date().toISOString(),
        });
      }
      push(`Đã lưu ${cards.length} flashcard vào phần Ôn tập`, "success");
      setCardsPreview(null);
    } catch {
      /* lỗi đã toast */
    }
  }

  async function send(raw?: string) {
    const text = (raw ?? input).trim();
    if (!text || thinking) return;
    if (text.length > 6000) {
      push("Nội dung quá dài (tối đa 6000 ký tự). Hãy rút gọn nhé.", "error");
      return;
    }
    const target = conv ?? {
      id: uid(),
      title: "Cuộc trò chuyện mới",
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const userMsg: ChatMessage = { id: uid(), role: "user", content: text, createdAt: new Date().toISOString() };
    const nextMessages = [...target.messages, userMsg];
    setConv({ ...target, messages: nextMessages, title: target.messages.length === 0 ? text.slice(0, 48) : target.title });
    setInput("");
    setThinking(true);

    try {
      const res = await askAI(mode, {
        messages: nextMessages.map((m) => ({ role: m.role, content: m.content })),
        prompt: mode === "chat" ? undefined : text,
      });

      let assistantContent = res.text ?? "";
      const newMeta: MessageMeta = {};

      // Mode JSON: flashcards / questions
      if (mode === "flashcards" || mode === "questions") {
        const arr = asObjectArray(res.json);
        if (mode === "flashcards") {
          const cards: FlashcardDraft[] = arr
            .map((c) => ({ question: str(c.question ?? c.front), answer: str(c.answer ?? c.back) }))
            .filter((c) => c.question && c.answer);
          if (cards.length > 0) {
            newMeta.flashcards = cards;
            assistantContent = `Mình đã tạo ${cards.length} flashcard từ nội dung bạn gửi. Bấm nút dưới để lưu vào phần Ôn tập (SM-2 sẽ tự xếp lịch ôn).`;
          }
        } else {
          const quiz: QuizDraft[] = arr
            .map((q, i) => {
              const opts = Array.isArray(q.options)
                ? q.options.map((o) => String(o))
                : [str(q.a), str(q.b), str(q.c), str(q.d)].filter((s) => s);
              const correct = q.correctIndex ?? q.answerIndex ?? q.correct ?? "";
              const idx = num(correct, opts.findIndex((o) => o === str(correct)) >= 0 ? opts.indexOf(str(correct)) : 0);
              return { question: str(q.question ?? `Câu ${i + 1}`), options: opts.slice(0, 4), answerIndex: Math.min(3, Math.max(0, idx)), explain: str(q.explain) };
            })
            .filter((q) => q.question && q.options.length >= 2);
          if (quiz.length > 0) {
            newMeta.quiz = quiz;
            assistantContent = `Đây là ${quiz.length} câu hỏi trắc nghiệm — thử cùng lúc nào! Bấm vào đáp án bạn chọn.`;
          }
        }
      }

      if (res.error) {
        assistantContent = `⚠️ ${res.error}`;
      } else if (!assistantContent) {
        assistantContent = "Không nhận được phản hồi từ AI. Thử lại giúp mình nhé.";
      }

      const assistantMsg: ChatMessage = { id: uid(), role: "assistant", content: assistantContent, createdAt: new Date().toISOString() };
      const finalMessages = [...nextMessages, assistantMsg];
      const saved: Conversation = {
        ...target,
        title: target.messages.length === 0 ? text.slice(0, 48) : target.title,
        messages: finalMessages,
        updatedAt: new Date().toISOString(),
      };
      setConv(saved);
      if (Object.keys(newMeta).length > 0) {
        setMeta((p) => ({ ...p, [assistantMsg.id]: newMeta }));
      }
      await saveConversation(saved);
    } finally {
      setThinking(false);
    }
  }

  if (loading) {
    return <LoadingBlock label="Đang mở trợ lý AI..." />;
  }

  async function analyze() {
    const text = "Phân tích tiến độ học tập của mình dựa trên dữ liệu dưới đây và cho lời khuyên cụ thể.";
    const target = conv ?? {
      id: uid(),
      title: "Phân tích tiến độ",
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const userMsg: ChatMessage = { id: uid(), role: "user", content: text, createdAt: new Date().toISOString() };
    const next = [...target.messages, userMsg];
    setConv({ ...target, messages: next, title: target.messages.length === 0 ? "Phân tích tiến độ" : target.title });
    setThinking(true);
    setInput("");
    try {
      const res = await askAI("chat", { messages: next.map((m) => ({ role: m.role, content: m.content })), context: studyContext });
      const assistantMsg: ChatMessage = { id: uid(), role: "assistant", content: res.text ?? `⚠️ ${res.error ?? "AI không phản hồi"}`, createdAt: new Date().toISOString() };
      const saved: Conversation = { ...target, messages: [...next, assistantMsg], updatedAt: new Date().toISOString() };
      setConv(saved);
      await saveConversation(saved);
    } finally {
      setThinking(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[260px,1fr]">
      {/* Danh sách hội thoại */}
      <Card className="card-lift animate-fade-up hidden p-4 lg:block" style={{ animationDelay: "80ms" }}>
        <Button className="w-full" onClick={startNew}>
          <Plus className="h-4 w-4" /> Trò chuyện mới
        </Button>
        <div className="mt-3 space-y-1 overflow-y-auto" style={{ maxHeight: "calc(100vh - 260px)" }}>
          {conversations.length === 0 ? (
            <p className="px-2 py-4 text-center text-xs text-muted">Lịch sử hội thoại sẽ lưu ở đây.</p>
          ) : (
            conversations.map((c) => (
              <div
                key={c.id}
                className={cn(
                  "group flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
                  conv?.id === c.id ? "bg-indigo-500/10 font-medium text-indigo-700 dark:text-indigo-300" : "text-muted hover:bg-surface-2"
                )}
              >
                <button
                  className="min-w-0 flex-1 truncate text-left"
                  onClick={() => {
                    setConv(c);
                    setMeta({});
                  }}
                >
                  {c.title}
                </button>
                <button
                  onClick={() => {
                    if (window.confirm("Xóa hội thoại này?")) void deleteConversation(c.id);
                    if (conv?.id === c.id) setConv(null);
                  }}
                  className="shrink-0 rounded p-1 opacity-0 transition-opacity hover:bg-red-500/10 hover:text-red-500 group-hover:opacity-100"
                  aria-label="Xóa hội thoại"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      </Card>

      {/* Cửa sổ chat */}
      <Card className="card-lift animate-fade-up flex min-h-[70vh] flex-col p-0" style={{ animationDelay: "140ms" }}>
        {conv ? (
          <>
            {/* Nội dung hội thoại */}
            <div className="flex-1 space-y-4 overflow-y-auto p-5" style={{ maxHeight: "calc(100vh - 320px)", minHeight: 320 }}>
              {messages.length === 0 && (
                <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-600/25 animate-float">
                    <Bot className="h-7 w-7" />
                  </div>
                  <div>
                    <p className="font-semibold">Trợ lý AI của StudyOS</p>
                    <p className="mt-1 text-sm text-muted">Hỏi đáp kiến thức, tóm tắt tài liệu, tạo flashcard &amp; trắc nghiệm, đề xuất lịch học…</p>
                  </div>
                  <div className="mt-2 flex flex-wrap justify-center gap-2">
                    <Button variant="secondary" className="text-xs" onClick={() => void analyze()}>
                      <BrainCircuit className="h-3.5 w-3.5 text-violet-500" /> Phân tích tiến độ của tôi
                    </Button>
                  </div>
                </div>
              )}
              {messages.map((m) => {
                const m2 = meta[m.id] ?? {};
                if (m.role === "user") {
                  return (
                    <div key={m.id} className="flex justify-end">
                      <div className="max-w-[80%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-gradient-to-br from-indigo-600 to-violet-600 px-4 py-2.5 text-sm text-white shadow-md shadow-indigo-600/20">{m.content}</div>
                    </div>
                  );
                }
                return (
                  <div key={m.id} className="flex justify-start">
                    <div className="max-w-[85%]">
                      <div className="whitespace-pre-wrap rounded-2xl rounded-bl-sm border border-border bg-surface-2 px-4 py-2.5 text-sm">{m.content}</div>
                      {m2.flashcards && m2.flashcards.length > 0 && (
                        <div className="mt-2 space-y-2">
                          {m2.flashcards.slice(0, 10).map((c, i) => (
                            <div key={i} className="rounded-xl border border-violet-300/50 bg-violet-500/5 p-3 text-sm dark:border-violet-500/30">
                              <p className="font-medium">{c.question}</p>
                              <p className="mt-1 text-muted">{c.answer}</p>
                            </div>
                          ))}
                          <Button
                            className="bg-gradient-to-r from-violet-600 to-indigo-600"
                            onClick={() => setCardsPreview(m2.flashcards ?? [])}
                          >
                            <BookPlus className="h-4 w-4" /> Lưu vào Ôn tập ({(m2.flashcards ?? []).length})
                          </Button>
                        </div>
                      )}
                      {m2.quiz && m2.quiz.length > 0 && <QuizBlock quiz={m2.quiz} />}
                    </div>
                  </div>
                );
              })}
              {thinking && (
                <div className="flex justify-start">
                  <div className="flex items-center gap-2 rounded-2xl border border-border bg-surface-2 px-4 py-3 text-sm text-muted">
                    <Loader2 className="h-4 w-4 animate-spin text-violet-500" /> AI đang soạn câu trả lời…
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Chế độ nhanh + ô soạn */}
            <div className="border-t border-border p-4">
              <div className="mb-2.5 flex flex-wrap gap-1.5">
                {MODES.map((m) => (
                  <button
                    key={m.mode}
                    onClick={() => {
                      setMode(m.mode);
                      if (m.template && input === "") setInput(m.template);
                    }}
                    title={m.hint}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all",
                      mode === m.mode
                        ? "border-transparent bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-sm"
                        : "border-border bg-surface-2 text-muted hover:text-foreground"
                    )}
                  >
                    <m.icon className="h-3.5 w-3.5" />
                    {m.label}
                  </button>
                ))}
              </div>
              <form
                className="flex items-end gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void send();
                }}
              >
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void send();
                    }
                  }}
                  placeholder={`${MODES.find((x) => x.mode === mode)?.hint ?? "Nhập câu hỏi..."} (Enter để gửi, Shift+Enter xuống dòng)`}
                  rows={2}
                  className="input-base min-h-[46px] flex-1 resize-none"
                />
                <Button type="submit" disabled={thinking || !input.trim()} className="shrink-0">
                  {thinking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </form>
              <p className="mt-2 text-[11px] text-muted">AI có thể nhầm lẫn — hãy kiểm chứng thông tin quan trọng trước khi áp dụng.</p>
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center">
            {conversations.length === 0 ? (
              <EmptyState
                icon={<Bot className="h-12 w-12" />}
                title="Trợ lý AI sẵn sàng"
                hint="Bấm “Trò chuyện mới” ở cột bên trái để bắt đầu hỏi đáp, tóm tắt tài liệu hoặc tạo flashcard."
              />
            ) : (
              <div className="space-y-3 text-center">
                <EmptyState icon={<MessageCircleQuestion className="h-12 w-12" />} title="Chọn một hội thoại hoặc bắt đầu mới." />
                {conversations.slice(0, 3).map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setConv(c)}
                    className="ml-auto block w-full max-w-xs truncate rounded-lg border border-border px-3 py-2 text-sm text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
                  >
                    {c.title}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Mobile: chọn hội thoại (thanh ngang) */}
      {conversations.length > 0 && !conv && (
        <div className="lg:hidden">
          <Badge>Today: {conversations.length} hội thoại trong lịch sử</Badge>
        </div>
      )}

      {/* Modal duyệt flashcard trước khi lưu */}
      <Modal
        open={cardsPreview !== null}
        onClose={() => setCardsPreview(null)}
        title="Tạo flashcard từ AI"
        wide
      >
        <div className="space-y-3">
          {courses.length > 0 && (
            <label className="flex items-center gap-2 text-sm text-muted">
              Gắn với môn:
              <select className="input-base w-auto flex-1" value={courseFilter} onChange={(e) => setCourseFilter(e.target.value)}>
                <option value="">— Không môn —</option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="max-h-80 space-y-2 overflow-y-auto">
            {(cardsPreview ?? []).map((c, i) => (
              <div key={i} className="rounded-xl border border-border p-3">
                <p className="text-sm font-medium">{c.question}</p>
                <p className="mt-1 text-sm text-muted">{c.answer}</p>
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCardsPreview(null)}>
              <X className="h-4 w-4" /> Hủy
            </Button>
            <Button className="bg-gradient-to-r from-violet-600 to-indigo-600" onClick={() => void handleGenerateFlashcards(cardsPreview ?? [])}>
              Lưu tất cả vào Ôn tập
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

/* ─── Khối trắc nghiệm tương tác ──────────────────────────── */
function QuizBlock({ quiz }: { quiz: QuizDraft[] }) {
  const [answers, setAnswers] = useState<Record<number, number>>({});

  return (
    <div className="mt-2 space-y-2">
      {quiz.map((q, i) => {
        const chosen = answers[i];
        const answered = chosen !== undefined;
        const correct = chosen === q.answerIndex;
        return (
          <div key={i} className="rounded-xl border border-border bg-surface-2/60 p-3">
            <p className="text-sm font-medium">
              {i + 1}. {q.question}
            </p>
            <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {q.options.map((opt, oi) => {
                const isCorrect = oi === q.answerIndex;
                const isChosen = oi === chosen;
                return (
                  <button
                    key={oi}
                    disabled={answered}
                    onClick={() => setAnswers((p) => ({ ...p, [i]: oi }))}
                    className={cn(
                      "rounded-lg border px-3 py-1.5 text-left text-xs transition-all",
                      !answered && "border-border hover:border-indigo-400 hover:bg-indigo-500/5",
                      answered && isCorrect && "border-emerald-400 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
                      answered && isChosen && !isCorrect && "border-red-400 bg-red-500/10 text-red-600 dark:text-red-300",
                      answered && !isChosen && !isCorrect && "border-border text-muted"
                    )}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>
            {answered && (q.explain || correct) && (
              <p className={cn("mt-1.5 text-xs", correct ? "text-emerald-600 dark:text-emerald-400" : "text-muted")}>
                {correct ? "✔ Chính xác! " : "✘ Chưa đúng. "}
                {q.explain}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
