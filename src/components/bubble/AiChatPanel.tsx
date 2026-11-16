import React, { useEffect, useRef, useState } from 'react';
import { Camera, Highlighter, Loader2, MoveRight, Pin, Send } from 'lucide-react';
import { NOTE_HIGHLIGHT_COLORS, resolveColorForTheme } from '../../constants/boardTheme';
import type { BoardTheme, ChatMessage, DiagramSpec, HighlightSnippet } from '../../types/board';
import { DiagramRenderer } from '../DiagramRenderer';

interface AiChatPanelProps {
  theme: BoardTheme;
  activeColor: string;
  messages: ChatMessage[];
  isLoading: boolean;
  onSendMessage: (question: string, includeBoardImage: boolean) => Promise<void>;
  onPlaceDiagram: (diagram: DiagramSpec) => void;
  onPinNote: (title: string, content: string, color: string) => void;
  onSelectHighlightColor: (hex: string) => void;
}

const QUICK_MATH_PROMPTS = [
  'Giải phương trình x² - 5x + 6 = 0 từng bước',
  'Vẽ tam giác vuông cạnh 3, 4, 5 và tính diện tích',
  'Vẽ đồ thị hàm số y = x² - 2x - 3',
];

export const AiChatPanel: React.FC<AiChatPanelProps> = ({
  theme,
  activeColor,
  messages,
  isLoading,
  onSendMessage,
  onPlaceDiagram,
  onPinNote,
  onSelectHighlightColor,
}) => {
  const [input, setInput] = useState('');
  const [includeBoard, setIncludeBoard] = useState(false);
  const [selectedNoteColor, setSelectedNoteColor] = useState(NOTE_HIGHLIGHT_COLORS[0].hex);
  const [quickNoteText, setQuickNoteText] = useState('');
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;
    setInput('');
    await onSendMessage(trimmed, includeBoard);
  };

  const handlePinQuickNote = (e: React.FormEvent) => {
    e.preventDefault();
    const text = quickNoteText.trim();
    if (!text) return;
    onPinNote('Ghi chú trọng tâm', text, selectedNoteColor);
    setQuickNoteText('');
  };

  const handleDiagramDragStart = (e: React.DragEvent, diagram: DiagramSpec) => {
    e.dataTransfer.setData('application/x-board-diagram', JSON.stringify(diagram));
    e.dataTransfer.effectAllowed = 'copy';
  };

  const handleNoteDragStart = (e: React.DragEvent, snippet: HighlightSnippet) => {
    e.dataTransfer.setData(
      'application/x-board-note',
      JSON.stringify({
        title: snippet.title,
        content: snippet.content,
        color: selectedNoteColor || snippet.color,
      })
    );
    e.dataTransfer.effectAllowed = 'copy';
  };

  return (
    <div className="flex flex-col h-[430px] max-h-[calc(100vh-180px)]">
      {/* Built-in highlight color strip inside AI chat */}
      <div className="px-3.5 py-2.5 bg-slate-950/50 border-b border-white/10 shrink-0 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-300">
            <Highlighter className="w-3.5 h-3.5 text-amber-300" />
            <span>Màu nổi bật nhanh</span>
          </div>
          <div className="flex items-center gap-1.5">
            {NOTE_HIGHLIGHT_COLORS.map((c) => {
              const selected =
                selectedNoteColor.toUpperCase() === c.hex.toUpperCase() ||
                activeColor.toUpperCase() === c.hex.toUpperCase();
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    setSelectedNoteColor(c.hex);
                    onSelectHighlightColor(c.hex);
                  }}
                  aria-label={`Chọn màu nổi bật ${c.name}`}
                  className={`w-5 h-5 rounded-md border transition-transform ${
                    selected ? 'scale-110 border-white ring-2 ring-amber-300/70' : 'border-white/25 hover:scale-105'
                  }`}
                  style={{ backgroundColor: resolveColorForTheme(c.hex, theme) }}
                />
              );
            })}
          </div>
        </div>

        <form onSubmit={handlePinQuickNote} className="flex items-center gap-1.5">
          <input
            type="text"
            value={quickNoteText}
            onChange={(e) => setQuickNoteText(e.target.value)}
            placeholder="Ghi chú ý quan trọng lên bảng..."
            aria-label="Nhập ghi chú nhanh để ghim lên bảng"
            className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg bg-white/8 border border-white/12 text-xs text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-amber-400"
          />
          <button
            type="submit"
            disabled={!quickNoteText.trim()}
            aria-label="Ghim ghi chú lên bảng"
            className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-950 disabled:opacity-40 transition-opacity whitespace-nowrap shrink-0 flex items-center gap-1"
            style={{ backgroundColor: selectedNoteColor }}
          >
            <Pin className="w-3 h-3" />
            <span>Ghim</span>
          </button>
        </form>
      </div>

      {/* Chat messages */}
      <div
        ref={scrollRef}
        data-testid="ai-chat-messages"
        className="flex-1 min-h-0 overflow-y-auto thin-scrollbar p-3.5 space-y-3"
      >
        {messages.length === 0 && (
          <div className="space-y-2">
            <p className="text-xs text-slate-300 leading-relaxed">
              Hỏi bài toán khó để nhận lời giải từng bước kèm hình vẽ kéo thả ra bảng phấn.
            </p>
            <div className="space-y-1.5">
              {QUICK_MATH_PROMPTS.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => onSendMessage(q, false)}
                  className="w-full text-left px-3 py-2 rounded-xl bg-white/6 hover:bg-white/12 border border-white/10 text-xs text-slate-200 transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
          >
            <div
              className={`max-w-[92%] rounded-xl px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap ${
                msg.role === 'user'
                  ? 'bg-sky-500/25 text-sky-50 border border-sky-400/30'
                  : 'bg-white/7 text-slate-100 border border-white/10'
              }`}
            >
              {msg.text}
            </div>

            {msg.highlights && msg.highlights.length > 0 && (
              <div className="mt-2 w-full space-y-1.5">
                {msg.highlights.map((hl, idx) => (
                  <div
                    key={idx}
                    draggable
                    onDragStart={(e) => handleNoteDragStart(e, hl)}
                    className="rounded-xl p-2.5 bg-slate-950/60 border cursor-grab active:cursor-grabbing flex items-start justify-between gap-2"
                    style={{ borderColor: `${selectedNoteColor || hl.color}70` }}
                  >
                    <div className="min-w-0">
                      <div
                        className="text-[11px] font-semibold"
                        style={{ color: selectedNoteColor || hl.color }}
                      >
                        {hl.title}
                      </div>
                      <div className="text-[11px] text-slate-200 mt-0.5">{hl.content}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onPinNote(hl.title, hl.content, selectedNoteColor || hl.color)}
                      aria-label={`Ghim "${hl.title}" lên bảng`}
                      className="px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-[10px] font-semibold shrink-0 whitespace-nowrap"
                    >
                      Ghim bảng
                    </button>
                  </div>
                ))}
              </div>
            )}

            {msg.diagrams && msg.diagrams.length > 0 && (
              <div className="mt-2 w-full space-y-2">
                {msg.diagrams.map((diagram) => (
                  <div
                    key={diagram.id}
                    draggable
                    onDragStart={(e) => handleDiagramDragStart(e, diagram)}
                    data-testid={`draggable-diagram-${diagram.id}`}
                    className="rounded-xl bg-slate-950/75 border border-sky-400/35 p-2.5 cursor-grab active:cursor-grabbing hover:border-sky-300 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span className="text-xs font-semibold text-sky-200 truncate">
                        {diagram.title}
                      </span>
                      <button
                        type="button"
                        onClick={() => onPlaceDiagram(diagram)}
                        aria-label={`Đưa hình "${diagram.title}" lên bảng`}
                        className="flex items-center gap-1 px-2 py-1 rounded-lg bg-sky-500 text-slate-950 hover:bg-sky-400 text-[11px] font-semibold shrink-0 whitespace-nowrap"
                      >
                        <span>Đưa lên bảng</span>
                        <MoveRight className="w-3 h-3" />
                      </button>
                    </div>
                    <div className="h-28 w-full rounded-lg bg-slate-900/90 border border-white/10 p-1">
                      <DiagramRenderer diagram={diagram} theme="navy" width={260} height={108} />
                    </div>
                    {diagram.caption && (
                      <div className="mt-1 text-[11px] text-slate-400">{diagram.caption}</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}

        {isLoading && (
          <div className="flex items-center gap-2 text-xs text-sky-300 py-1">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>AI đang phân tích bài toán...</span>
          </div>
        )}
      </div>

      {/* Composer */}
      <form
        onSubmit={handleSubmit}
        className="p-3 border-t border-white/10 bg-slate-950/60 space-y-2 shrink-0"
      >
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setIncludeBoard((v) => !v)}
            aria-pressed={includeBoard}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors ${
              includeBoard
                ? 'bg-amber-400/20 text-amber-200 border border-amber-400/40'
                : 'bg-white/6 text-slate-300 hover:bg-white/10 border border-transparent'
            }`}
          >
            <Camera className="w-3.5 h-3.5" />
            <span>{includeBoard ? 'Đang đính kèm ảnh bảng' : 'Kèm ảnh bảng'}</span>
          </button>
          <span className="text-[10px] text-slate-400">Kéo hình ra bảng</span>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Nhập bài toán hoặc câu hỏi..."
            aria-label="Nhập câu hỏi cho trợ lý AI"
            className="flex-1 min-w-0 px-3 py-2 rounded-xl bg-white/8 border border-white/15 text-xs text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-sky-400"
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            aria-label="Gửi câu hỏi tới AI"
            className="p-2.5 rounded-xl bg-sky-500 text-slate-950 hover:bg-sky-400 disabled:opacity-40 transition-colors shrink-0"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </form>
    </div>
  );
};
