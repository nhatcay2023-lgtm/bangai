import React, { useState } from 'react';
import type { User } from 'firebase/auth';
import { Cloud, CloudOff, LogIn, LogOut, Plus, RefreshCw, Trash2, X } from 'lucide-react';
import type { BoardDocument } from '../types/board';

interface SyncBoardsModalProps {
  open: boolean;
  user: User | null;
  authReady: boolean;
  syncStatus: 'local' | 'syncing' | 'synced' | 'error';
  syncError: string | null;
  boards: BoardDocument[];
  activeBoardId: string;
  onClose: () => void;
  onSignIn: () => Promise<void>;
  onSignOut: () => Promise<void>;
  onCreateBoard: (title: string) => Promise<void>;
  onSelectBoard: (boardId: string) => void;
  onDeleteBoard: (boardId: string) => Promise<void>;
  onForceSync: () => Promise<void>;
}

export const SyncBoardsModal: React.FC<SyncBoardsModalProps> = ({
  open,
  user,
  authReady,
  syncStatus,
  syncError,
  boards,
  activeBoardId,
  onClose,
  onSignIn,
  onSignOut,
  onCreateBoard,
  onSelectBoard,
  onDeleteBoard,
  onForceSync,
}) => {
  const [newTitle, setNewTitle] = useState('');
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const title = newTitle.trim() || `Bảng học ${boards.length + 1}`;
    setBusy(true);
    try {
      await onCreateBoard(title);
      setNewTitle('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Đồng bộ đám mây và danh sách bảng"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 backdrop-blur-sm p-4"
    >
      <div className="w-full max-w-lg rounded-2xl bg-slate-900 text-slate-100 border border-white/15 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            {user ? (
              <Cloud className="w-5 h-5 text-emerald-400" />
            ) : (
              <CloudOff className="w-5 h-5 text-slate-400" />
            )}
            <h2 className="text-base font-semibold">Đồng bộ đa thiết bị &amp; Bảng đã lưu</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng hộp thoại đồng bộ"
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Cloud Auth Section */}
          <div className="p-4 rounded-xl bg-white/5 border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="min-w-0">
              {user ? (
                <>
                  <div className="text-sm font-semibold text-slate-100 truncate">
                    {user.displayName || user.email}
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    {syncStatus === 'syncing'
                      ? 'Đang đồng bộ lên đám mây...'
                      : syncStatus === 'synced'
                        ? 'Đã đồng bộ tự động giữa các thiết bị'
                        : syncStatus === 'error'
                          ? 'Gặp sự cố đồng bộ'
                          : 'Sẵn sàng đồng bộ'}
                  </div>
                </>
              ) : (
                <>
                  <div className="text-sm font-semibold text-slate-100">Chưa đăng nhập đồng bộ</div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    Đăng nhập Google để lưu và học tiếp trên máy tính, máy tính bảng, điện thoại.
                  </div>
                </>
              )}
            </div>

            {authReady && (
              user ? (
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={onForceSync}
                    className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-xs font-medium flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Đồng bộ ngay</span>
                  </button>
                  <button
                    type="button"
                    onClick={onSignOut}
                    className="px-3 py-1.5 rounded-lg bg-rose-500/15 text-rose-300 hover:bg-rose-500/25 text-xs font-medium flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Đăng xuất</span>
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={onSignIn}
                  className="px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-semibold flex items-center gap-2 shrink-0 whitespace-nowrap transition-colors"
                >
                  <LogIn className="w-4 h-4" />
                  <span>Đăng nhập Google</span>
                </button>
              )
            )}
          </div>

          {syncError && (
            <div className="px-3.5 py-2.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-xs text-rose-200">
              {syncError}
            </div>
          )}

          {/* Create New Board */}
          <form onSubmit={handleCreate} className="flex items-center gap-2">
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Tên bảng mới (ví dụ: Hình học lớp 9)..."
              aria-label="Tên bảng học mới"
              className="flex-1 min-w-0 px-3.5 py-2 rounded-xl bg-white/8 border border-white/15 text-sm text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-sky-400"
            />
            <button
              type="submit"
              disabled={busy}
              className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-semibold flex items-center gap-1.5 shrink-0 whitespace-nowrap transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Tạo bảng</span>
            </button>
          </form>

          {/* Saved Boards List */}
          <div>
            <div className="text-xs font-medium text-slate-400 mb-2">
              Danh sách bảng học ({boards.length})
            </div>
            <div className="max-h-56 overflow-y-auto thin-scrollbar space-y-2">
              {boards.map((b) => {
                const isActive = b.boardId === activeBoardId;
                return (
                  <div
                    key={b.boardId}
                    className={`flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl border transition-colors ${
                      isActive
                        ? 'bg-sky-500/15 border-sky-400/50'
                        : 'bg-white/5 border-white/10 hover:bg-white/8'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        onSelectBoard(b.boardId);
                        onClose();
                      }}
                      className="flex-1 min-w-0 text-left"
                    >
                      <div className="text-sm font-medium text-slate-100 truncate">{b.title}</div>
                      <div className="text-[11px] text-slate-400 font-mono tabular-nums mt-0.5">
                        {b.strokes.length} nét · {b.items.length} hình · {b.theme}
                      </div>
                    </button>
                    {boards.length > 1 && (
                      <button
                        type="button"
                        onClick={() => onDeleteBoard(b.boardId)}
                        aria-label={`Xóa bảng "${b.title}"`}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-300 hover:bg-rose-500/15 transition-colors shrink-0"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
