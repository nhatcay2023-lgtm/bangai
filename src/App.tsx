import React, { useCallback, useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { Cloud, CloudOff, Download, Grid3X3, Palette } from 'lucide-react';
import { ChalkboardCanvas, type ChalkboardCanvasHandle } from './components/ChalkboardCanvas';
import { SyncBoardsModal } from './components/SyncBoardsModal';
import { UnifiedBubble } from './components/UnifiedBubble';
import { BOARD_THEMES, CHALK_COLORS, GRID_OPTIONS } from './constants/boardTheme';
import { createInitialStudyTools } from './constants/studyTools';
import { auth, db, googleProvider, handleFirestoreError, OperationType } from './lib/firebase';
import type {
  BoardDocument,
  BoardItem,
  BoardTheme,
  ChatMessage,
  DiagramSpec,
  DrawingTool,
  Grade1ExerciseSpec,
  GridType,
  Point,
  Stroke,
} from './types/board';
import type { ActiveStudyTool, StudyToolKind } from './types/tools';
import {
  compactItemsForSync,
  compactStrokesForSync,
  sanitizeBoardId,
  sanitizeBoardTitle,
  sanitizeGridType,
  sanitizeTheme,
} from './utils/boardSerializer';
import { getDefaultWorksheetSize } from './utils/worksheetGeometry';

const LOCAL_STORAGE_KEY = 'bang_phan_ai_boards_v1';
const ACTIVE_BOARD_KEY = 'bang_phan_ai_active_board_v1';

function createInitialBoard(id = 'board-main', title = 'Bảng học chính'): BoardDocument {
  return {
    boardId: id,
    ownerId: 'local',
    title,
    theme: 'green',
    gridType: 'square',
    strokes: [],
    items: [],
    updatedAtMs: Date.now(),
  };
}

function loadLocalBoards(): BoardDocument[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return [createInitialBoard()];
    const parsed = JSON.parse(raw) as BoardDocument[];
    if (!Array.isArray(parsed) || parsed.length === 0) return [createInitialBoard()];
    return parsed.map((b) => ({
      ...b,
      boardId: sanitizeBoardId(b.boardId),
      title: sanitizeBoardTitle(b.title),
      theme: sanitizeTheme(b.theme),
      gridType: sanitizeGridType(b.gridType),
      strokes: Array.isArray(b.strokes) ? b.strokes : [],
      items: Array.isArray(b.items) ? b.items : [],
    }));
  } catch {
    return [createInitialBoard()];
  }
}

export default function App() {
  const [boards, setBoards] = useState<BoardDocument[]>(() => loadLocalBoards());
  const [activeBoardId, setActiveBoardId] = useState<string>(() => {
    const saved = localStorage.getItem(ACTIVE_BOARD_KEY);
    return saved ? sanitizeBoardId(saved) : 'board-main';
  });

  const activeBoard = boards.find((b) => b.boardId === activeBoardId) || boards[0];

  // Drawing tool state
  const [activeTool, setActiveTool] = useState<DrawingTool>('chalk');
  const [activeColor, setActiveColor] = useState<string>(CHALK_COLORS[0].hex);
  const [strokeWidth, setStrokeWidth] = useState<number>(4);

  // Undo / Redo stacks per session
  const [undoStack, setUndoStack] = useState<{ strokes: Stroke[]; items: BoardItem[] }[]>([]);
  const [redoStack, setRedoStack] = useState<{ strokes: Stroke[]; items: BoardItem[] }[]>([]);

  // AI Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [aiLoading, setAiLoading] = useState(false);

  // Classroom study instruments state (8 interactive tools)
  const [studyTools, setStudyTools] = useState<ActiveStudyTool[]>(() =>
    createInitialStudyTools()
  );

  // Firebase Auth & Cloud Sync state
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [syncModalOpen, setSyncModalOpen] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'local' | 'syncing' | 'synced' | 'error'>('local');
  const [syncError, setSyncError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const canvasRef = useRef<ChalkboardCanvasHandle | null>(null);
  const syncTimeoutRef = useRef<number | null>(null);
  const cloudInitializedRef = useRef<Set<string>>(new Set());

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => {
      setToast((prev) => (prev === msg ? null : prev));
    }, 2600);
  }, []);

  // Persist locally
  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(boards));
      localStorage.setItem(ACTIVE_BOARD_KEY, activeBoard.boardId);
    } catch {
      // ignore storage quota errors
    }
  }, [boards, activeBoard.boardId]);

  // Listen to Firebase Auth state
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (currentUser) => {
      if (!currentUser && syncTimeoutRef.current) {
        window.clearTimeout(syncTimeoutRef.current);
        syncTimeoutRef.current = null;
      }
      setUser(currentUser);
      setAuthReady(true);
      if (!currentUser) {
        cloudInitializedRef.current.clear();
        setSyncStatus('local');
        setSyncError(null);
      }
    });
    return () => unsub();
  }, []);

  // Subscribe to Firestore boards when signed in
  useEffect(() => {
    if (!authReady || !user) return;
    let isSubscribed = true;
    const boardsPath = `users/${user.uid}/boards`;
    const q = query(collection(db, boardsPath), where('ownerId', '==', user.uid));

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        if (!isSubscribed || !auth.currentUser || auth.currentUser.uid !== user.uid) return;
        const cloudBoards: BoardDocument[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          cloudBoards.push({
            boardId: docSnap.id,
            ownerId: String(data.ownerId || user.uid),
            title: sanitizeBoardTitle(String(data.title || 'Bảng học')),
            theme: sanitizeTheme(String(data.theme || 'green')),
            gridType: sanitizeGridType(String(data.gridType || 'none')),
            strokes: Array.isArray(data.strokes) ? (data.strokes as Stroke[]) : [],
            items: Array.isArray(data.items) ? (data.items as BoardItem[]) : [],
            updatedAtMs: data.updatedAt?.toMillis?.() || Date.now(),
          });
          cloudInitializedRef.current.add(docSnap.id);
        });
        cloudBoards.sort((a, b) => (b.updatedAtMs || 0) - (a.updatedAtMs || 0));

        if (cloudBoards.length > 0) {
          setBoards(cloudBoards);
          setActiveBoardId((prev) =>
            cloudBoards.some((b) => b.boardId === prev) ? prev : cloudBoards[0].boardId
          );
          setSyncStatus('synced');
        } else {
          // Upload current local board to cloud on first sign-in
          const initial = activeBoard;
          if (!auth.currentUser || auth.currentUser.uid !== user.uid) return;
          const docRef = doc(db, boardsPath, initial.boardId);
          setDoc(docRef, {
            boardId: initial.boardId,
            ownerId: user.uid,
            title: sanitizeBoardTitle(initial.title),
            theme: sanitizeTheme(initial.theme),
            gridType: sanitizeGridType(initial.gridType),
            strokes: compactStrokesForSync(initial.strokes),
            items: compactItemsForSync(initial.items),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          })
            .then(() => {
              if (!isSubscribed) return;
              cloudInitializedRef.current.add(initial.boardId);
              setSyncStatus('synced');
            })
            .catch((err) => {
              if (!isSubscribed || !auth.currentUser || auth.currentUser.uid !== user.uid) {
                return;
              }
              setSyncStatus('error');
              setSyncError(err instanceof Error ? err.message : 'Lỗi đồng bộ');
              handleFirestoreError(err, OperationType.WRITE, `${boardsPath}/${initial.boardId}`);
            });
        }
      },
      (error) => {
        if (!isSubscribed || !auth.currentUser || auth.currentUser.uid !== user.uid) return;
        setSyncStatus('error');
        setSyncError(error.message);
        handleFirestoreError(error, OperationType.LIST, boardsPath);
      }
    );

    return () => {
      isSubscribed = false;
      unsub();
      if (syncTimeoutRef.current) {
        window.clearTimeout(syncTimeoutRef.current);
        syncTimeoutRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authReady, user]);

  const syncBoardToCloud = useCallback(
    async (board: BoardDocument) => {
      const currentUser = auth.currentUser;
      if (!user || !currentUser || currentUser.uid !== user.uid) return;
      const boardsPath = `users/${user.uid}/boards`;
      const docPath = `${boardsPath}/${board.boardId}`;
      const docRef = doc(db, boardsPath, board.boardId);
      setSyncStatus('syncing');
      setSyncError(null);
      try {
        let isExisting = cloudInitializedRef.current.has(board.boardId);
        if (!isExisting) {
          const existingSnap = await getDoc(docRef);
          if (!auth.currentUser || auth.currentUser.uid !== user.uid) return;
          isExisting = existingSnap.exists();
          if (isExisting) {
            cloudInitializedRef.current.add(board.boardId);
          }
        }
        if (!auth.currentUser || auth.currentUser.uid !== user.uid) return;
        if (isExisting) {
          await setDoc(
            docRef,
            {
              title: sanitizeBoardTitle(board.title),
              theme: sanitizeTheme(board.theme),
              gridType: sanitizeGridType(board.gridType),
              strokes: compactStrokesForSync(board.strokes),
              items: compactItemsForSync(board.items),
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          );
        } else {
          await setDoc(docRef, {
            boardId: board.boardId,
            ownerId: user.uid,
            title: sanitizeBoardTitle(board.title),
            theme: sanitizeTheme(board.theme),
            gridType: sanitizeGridType(board.gridType),
            strokes: compactStrokesForSync(board.strokes),
            items: compactItemsForSync(board.items),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          cloudInitializedRef.current.add(board.boardId);
        }
        setSyncStatus('synced');
      } catch (err) {
        if (!auth.currentUser || auth.currentUser.uid !== user.uid) {
          setSyncStatus('local');
          return;
        }
        setSyncStatus('error');
        setSyncError(err instanceof Error ? err.message : 'Lỗi đồng bộ');
        handleFirestoreError(err, OperationType.WRITE, docPath);
      }
    },
    [user]
  );

  const scheduleCloudSync = useCallback(
    (updatedBoard: BoardDocument) => {
      if (!user || !auth.currentUser || auth.currentUser.uid !== user.uid) return;
      if (syncTimeoutRef.current) {
        window.clearTimeout(syncTimeoutRef.current);
      }
      setSyncStatus('syncing');
      syncTimeoutRef.current = window.setTimeout(() => {
        syncTimeoutRef.current = null;
        if (!auth.currentUser || auth.currentUser.uid !== user.uid) return;
        syncBoardToCloud(updatedBoard).catch(() => {
          // handled inside syncBoardToCloud
        });
      }, 650);
    },
    [user, syncBoardToCloud]
  );

  const mutateActiveBoard = useCallback(
    (updater: (prev: BoardDocument) => BoardDocument, recordHistory = true) => {
      setBoards((prevBoards) =>
        prevBoards.map((b) => {
          if (b.boardId !== activeBoard.boardId) return b;
          if (recordHistory) {
            setUndoStack((u) => [...u.slice(-29), { strokes: b.strokes, items: b.items }]);
            setRedoStack([]);
          }
          const updated = { ...updater(b), updatedAtMs: Date.now() };
          scheduleCloudSync(updated);
          return updated;
        })
      );
    },
    [activeBoard.boardId, scheduleCloudSync]
  );

  const handleUndo = useCallback(() => {
    setUndoStack((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      setRedoStack((r) => [...r, { strokes: activeBoard.strokes, items: activeBoard.items }]);
      mutateActiveBoard(
        (b) => ({ ...b, strokes: last.strokes, items: last.items }),
        false
      );
      return prev.slice(0, -1);
    });
  }, [activeBoard.strokes, activeBoard.items, mutateActiveBoard]);

  const handleRedo = useCallback(() => {
    setRedoStack((prev) => {
      if (prev.length === 0) return prev;
      const next = prev[prev.length - 1];
      setUndoStack((u) => [...u, { strokes: activeBoard.strokes, items: activeBoard.items }]);
      mutateActiveBoard(
        (b) => ({ ...b, strokes: next.strokes, items: next.items }),
        false
      );
      return prev.slice(0, -1);
    });
  }, [activeBoard.strokes, activeBoard.items, mutateActiveBoard]);

  // Keyboard shortcuts Ctrl+Z / Ctrl+Y
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        if (
          document.activeElement instanceof HTMLInputElement ||
          document.activeElement instanceof HTMLTextAreaElement
        ) {
          return;
        }
        e.preventDefault();
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y') {
        if (
          document.activeElement instanceof HTMLInputElement ||
          document.activeElement instanceof HTMLTextAreaElement
        ) {
          return;
        }
        e.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleUndo, handleRedo]);

  const handleCommitStroke = useCallback(
    (stroke: Stroke) => {
      mutateActiveBoard((b) => ({
        ...b,
        strokes: [...b.strokes, stroke],
      }));
    },
    [mutateActiveBoard]
  );

  const handleToggleStudyTool = useCallback((id: StudyToolKind) => {
    setStudyTools((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        const nextEnabled = !t.enabled;
        if (!nextEnabled) {
          return { ...t, enabled: false, timerRunning: false };
        }
        // Position cleanly inside current viewport when enabling
        const w = typeof window !== 'undefined' ? window.innerWidth : 1440;
        const h = typeof window !== 'undefined' ? window.innerHeight - 56 : 844;
        const safeX = Math.min(Math.max(48, t.x), Math.max(48, w - 260));
        const safeY = Math.min(Math.max(72, t.y), Math.max(72, h - 180));
        return { ...t, enabled: true, x: safeX, y: safeY };
      })
    );
  }, []);

  const handleDisableAllStudyTools = useCallback(() => {
    setStudyTools((prev) =>
      prev.map((t) => ({ ...t, enabled: false, timerRunning: false }))
    );
  }, []);

  const handleUpdateStudyTool = useCallback(
    (id: StudyToolKind, patch: Partial<ActiveStudyTool>) => {
      setStudyTools((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    },
    []
  );

  const handleCommitToolPoints = useCallback(
    (points: Point[], label?: string, sharpCorners = false) => {
      if (points.length < 2) return;
      const baseTool = activeTool === 'highlighter' ? 'highlighter' : sharpCorners ? 'line' : 'chalk';
      const newStrokes: Stroke[] = [];
      if (sharpCorners && points.length > 2) {
        for (let i = 0; i < points.length - 1; i++) {
          newStrokes.push({
            id: `tool-stroke-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
            tool: baseTool,
            color: activeColor,
            width: strokeWidth,
            opacity: activeTool === 'highlighter' ? 0.34 : 0.95,
            points: [points[i], points[i + 1]],
          });
        }
      } else {
        newStrokes.push({
          id: `tool-stroke-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          tool: baseTool,
          color: activeColor,
          width: strokeWidth,
          opacity: activeTool === 'highlighter' ? 0.34 : 0.95,
          points,
        });
      }
      mutateActiveBoard((b) => ({
        ...b,
        strokes: [...b.strokes, ...newStrokes],
      }));
      if (label) {
        showToast(label);
      }
    },
    [activeColor, activeTool, mutateActiveBoard, showToast, strokeWidth]
  );

  const handleEraseStrokes = useCallback(
    (remainingStrokes: Stroke[]) => {
      mutateActiveBoard((b) => ({
        ...b,
        strokes: remainingStrokes,
      }));
    },
    [mutateActiveBoard]
  );

  const getNextBoardSlot = useCallback(
    (itemW: number, itemH: number) => {
      const idx = activeBoard.items.length;
      const isMobile = window.innerWidth < 768;
      if (isMobile) {
        return {
          x: 16 + (idx % 2) * 28,
          y: 72 + (idx % 3) * 140,
        };
      }
      const startX = 280;
      const startY = 82;
      const col = idx % 2;
      const row = Math.floor(idx / 2) % 3;
      const stepX = Math.max(290, itemW + 24);
      const stepY = Math.max(225, itemH + 20);
      const x = Math.min(startX + col * stepX, Math.max(20, window.innerWidth - itemW - 24));
      const y = Math.min(startY + row * stepY, Math.max(80, window.innerHeight - itemH - 20));
      return { x, y };
    },
    [activeBoard.items.length]
  );

  const handlePlaceDiagram = useCallback(
    (diagram: DiagramSpec, x?: number, y?: number) => {
      const slot = getNextBoardSlot(270, 210);
      const newItem: BoardItem = {
        id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        kind: 'diagram',
        title: diagram.title,
        color: diagram.color || '#38BDF8',
        x: x ?? slot.x,
        y: y ?? slot.y,
        width: 270,
        height: 210,
        diagram,
      };
      mutateActiveBoard((b) => ({
        ...b,
        items: [...b.items, newItem],
      }));
      showToast(`Đã đưa "${diagram.title}" lên bảng`);
    },
    [getNextBoardSlot, mutateActiveBoard, showToast]
  );

  const handlePlaceWorksheet = useCallback(
    (exercise: Grade1ExerciseSpec, x?: number, y?: number) => {
      const size = getDefaultWorksheetSize(exercise);
      const slot = getNextBoardSlot(size.width, size.height);
      const newItem: BoardItem = {
        id: `ws-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        kind: 'worksheet',
        title: `Bài ${exercise.number}: ${exercise.title}`,
        color: '#FDE047',
        x: x ?? slot.x,
        y: y ?? slot.y,
        width: size.width,
        height: size.height,
        worksheet: exercise,
      };
      mutateActiveBoard((b) => ({
        ...b,
        items: [...b.items, newItem],
      }));
      showToast(`Đã đưa "Bài ${exercise.number}: ${exercise.title}" ra bảng (nền trong suốt)`);
    },
    [getNextBoardSlot, mutateActiveBoard, showToast]
  );

  const handlePinNote = useCallback(
    (title: string, content: string, color: string, x?: number, y?: number) => {
      const slot = getNextBoardSlot(260, 145);
      const newItem: BoardItem = {
        id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        kind: 'note',
        title,
        content,
        color,
        x: x ?? slot.x,
        y: y ?? slot.y,
        width: 260,
        height: 145,
      };
      mutateActiveBoard((b) => ({
        ...b,
        items: [...b.items, newItem],
      }));
      showToast('Đã ghim ghi chú nổi bật lên bảng');
    },
    [getNextBoardSlot, mutateActiveBoard, showToast]
  );

  const handleUpdateItem = useCallback(
    (id: string, patch: Partial<BoardItem>) => {
      setBoards((prevBoards) =>
        prevBoards.map((b) => {
          if (b.boardId !== activeBoard.boardId) return b;
          const updated = {
            ...b,
            items: b.items.map((item) => (item.id === id ? { ...item, ...patch } : item)),
            updatedAtMs: Date.now(),
          };
          scheduleCloudSync(updated);
          return updated;
        })
      );
    },
    [activeBoard.boardId, scheduleCloudSync]
  );

  const handleDeleteItem = useCallback(
    (id: string) => {
      mutateActiveBoard((b) => ({
        ...b,
        items: b.items.filter((item) => item.id !== id),
      }));
    },
    [mutateActiveBoard]
  );

  const handleExportPng = useCallback(() => {
    const dataUrl = canvasRef.current?.exportPng(activeBoard.title);
    if (dataUrl) {
      showToast('Đã tải xuống ảnh bảng phấn (.png)');
    }
  }, [activeBoard.title, showToast]);

  const handleSendAiMessage = useCallback(
    async (question: string, includeBoardImage: boolean) => {
      const userMsg: ChatMessage = {
        id: `u-${Date.now()}`,
        role: 'user',
        text: question,
        createdAt: Date.now(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setAiLoading(true);

      try {
        const boardImageBase64 = includeBoardImage
          ? canvasRef.current?.captureSnapshotBase64() || undefined
          : undefined;

        const resp = await fetch('/api/ai/solve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            question,
            history: messages.slice(-6).map((m) => ({ role: m.role, text: m.text })),
            boardImageBase64,
            boardTheme: activeBoard.theme,
          }),
        });

        const data = await resp.json();
        if (!resp.ok) {
          throw new Error(data?.error || `HTTP ${resp.status}`);
        }

        const assistantMsg: ChatMessage = {
          id: `a-${Date.now()}`,
          role: 'assistant',
          text: String(data.answerMarkdown || 'Đã hoàn thành phân tích.'),
          highlights: Array.isArray(data.keyHighlights) ? data.keyHighlights : [],
          diagrams: Array.isArray(data.diagrams) ? data.diagrams : [],
          createdAt: Date.now(),
        };
        setMessages((prev) => [...prev, assistantMsg]);
      } catch (err) {
        const errText = err instanceof Error ? err.message : 'Lỗi kết nối AI';
        setMessages((prev) => [
          ...prev,
          {
            id: `err-${Date.now()}`,
            role: 'assistant',
            text: `Không thể kết nối AI lúc này (${errText}). Bạn vẫn có thể kéo thả hình mẫu từ nút "Hình mẫu" hoặc dùng bảng màu ghi chú ở trên!`,
            createdAt: Date.now(),
          },
        ]);
      } finally {
        setAiLoading(false);
      }
    },
    [messages, activeBoard.theme]
  );

  const handleSignIn = async () => {
    try {
      setSyncError(null);
      await signInWithPopup(auth, googleProvider);
      showToast('Đăng nhập thành công, đang đồng bộ bảng học...');
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : 'Đăng nhập không thành công');
    }
  };

  const handleSignOut = async () => {
    if (syncTimeoutRef.current) {
      window.clearTimeout(syncTimeoutRef.current);
      syncTimeoutRef.current = null;
    }
    await signOut(auth);
    cloudInitializedRef.current.clear();
    setSyncStatus('local');
    setSyncError(null);
    showToast('Đã chuyển sang chế độ lưu cục bộ');
  };

  const handleCreateBoard = async (title: string) => {
    const newId = sanitizeBoardId(`board-${Date.now()}`);
    const newBoard = createInitialBoard(newId, sanitizeBoardTitle(title));
    newBoard.ownerId = user?.uid || 'local';
    setBoards((prev) => [newBoard, ...prev]);
    setActiveBoardId(newId);
    setUndoStack([]);
    setRedoStack([]);
    if (user && auth.currentUser?.uid === user.uid) {
      await syncBoardToCloud(newBoard);
    }
    showToast(`Đã tạo "${newBoard.title}"`);
  };

  const handleDeleteBoard = async (boardId: string) => {
    if (boards.length <= 1) return;
    const remaining = boards.filter((b) => b.boardId !== boardId);
    setBoards(remaining);
    if (activeBoardId === boardId) {
      setActiveBoardId(remaining[0].boardId);
    }
    if (user && auth.currentUser?.uid === user.uid && cloudInitializedRef.current.has(boardId)) {
      const path = `users/${user.uid}/boards/${boardId}`;
      try {
        await deleteDoc(doc(db, `users/${user.uid}/boards`, boardId));
        cloudInitializedRef.current.delete(boardId);
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, path);
      }
    }
  };

  return (
    <div className="w-screen h-screen flex flex-col bg-slate-950 text-slate-100 overflow-hidden">
      {/* Top 3-Zone Classroom Bar */}
      <header className="h-14 px-3 sm:px-6 bg-slate-900/95 border-b border-white/10 flex items-center justify-between gap-2 sm:gap-8 shrink-0 z-40">
        {/* Zone 1: Single-line Brand Wordmark */}
        <div className="flex items-center gap-2 min-w-0 shrink-0">
          <span className="text-sm sm:text-lg font-bold tracking-tight text-white whitespace-nowrap shrink-0">
            Bảng Phấn AI
          </span>
        </div>

        {/* Zone 2: Board Color & Grid Ruling Controls */}
        <nav
          aria-label="Tùy chỉnh mặt bảng và ô lưới"
          className="flex items-center gap-1.5 sm:gap-5 min-w-0"
        >
          {/* Mobile compact selects (< sm) so all themes and grids stay visible */}
          <div className="flex sm:hidden items-center gap-1 min-w-0">
            <select
              aria-label="Chọn màu mặt bảng"
              value={activeBoard.theme}
              onChange={(e) =>
                mutateActiveBoard((b) => ({ ...b, theme: e.target.value as BoardTheme }), false)
              }
              className="max-w-[86px] px-1.5 py-1 rounded-lg bg-slate-800 border border-white/15 text-[11px] text-slate-100 focus:outline-none truncate"
            >
              {(Object.keys(BOARD_THEMES) as BoardTheme[]).map((themeKey) => (
                <option key={themeKey} value={themeKey}>
                  {BOARD_THEMES[themeKey].label}
                </option>
              ))}
            </select>
            <select
              aria-label="Chọn kiểu ô lưới"
              value={activeBoard.gridType}
              onChange={(e) =>
                mutateActiveBoard((b) => ({ ...b, gridType: e.target.value as GridType }), false)
              }
              className="max-w-[76px] px-1.5 py-1 rounded-lg bg-slate-800 border border-white/15 text-[11px] text-slate-100 focus:outline-none truncate"
            >
              {GRID_OPTIONS.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.label}
                </option>
              ))}
            </select>
          </div>

          {/* Desktop Board Surface Theme Selector */}
          <div className="hidden sm:flex items-center gap-1.5 shrink-0" role="group" aria-label="Màu mặt bảng">
            <Palette className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            {(Object.keys(BOARD_THEMES) as BoardTheme[]).map((themeKey) => {
              const t = BOARD_THEMES[themeKey];
              const isSelected = activeBoard.theme === themeKey;
              return (
                <button
                  key={themeKey}
                  type="button"
                  onClick={() => mutateActiveBoard((b) => ({ ...b, theme: themeKey }), false)}
                  aria-label={`Đổi sang ${t.label}`}
                  aria-pressed={isSelected}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
                    isSelected
                      ? 'bg-white/15 text-white ring-1 ring-amber-400/70'
                      : 'text-slate-300 hover:text-white hover:bg-white/8'
                  }`}
                >
                  <span
                    className="w-3 h-3 rounded-sm border border-white/30 shrink-0"
                    style={{ backgroundColor: t.bgHex }}
                  />
                  <span className="hidden md:inline">{t.label}</span>
                </button>
              );
            })}
          </div>

          <span className="hidden sm:block h-4 w-px bg-white/15 shrink-0" aria-hidden="true" />

          {/* Desktop Grid Ruling Selector */}
          <div className="hidden sm:flex items-center gap-1 shrink-0" role="group" aria-label="Kiểu ô lưới">
            <Grid3X3 className="w-3.5 h-3.5 text-slate-400 shrink-0 mr-0.5" />
            {GRID_OPTIONS.map((g) => {
              const isSelected = activeBoard.gridType === g.id;
              return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => mutateActiveBoard((b) => ({ ...b, gridType: g.id }), false)}
                  aria-pressed={isSelected}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    isSelected
                      ? 'bg-amber-400 text-slate-950 font-semibold'
                      : 'text-slate-300 hover:text-white hover:bg-white/8'
                  }`}
                >
                  {g.label}
                </button>
              );
            })}
          </div>
        </nav>

        {/* Zone 3: Primary Action (Cloud Sync & Save PNG) */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <button
            type="button"
            onClick={handleExportPng}
            aria-label="Lưu tranh vẽ dưới dạng ảnh PNG"
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/8 hover:bg-white/14 text-slate-100 text-xs font-medium transition-colors whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Lưu ảnh</span>
          </button>

          <button
            type="button"
            onClick={() => setSyncModalOpen(true)}
            aria-label="Mở đồng bộ đa thiết bị và danh sách bảng"
            className="flex items-center gap-1.5 px-2.5 sm:px-3.5 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 text-[11px] sm:text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
          >
            {user ? <Cloud className="w-3.5 h-3.5" /> : <CloudOff className="w-3.5 h-3.5" />}
            <span>{user ? 'Đã đồng bộ' : 'Đồng bộ'}</span>
          </button>
        </div>
      </header>

      {/* Main Chalkboard Interactive Stage */}
      <main className="flex-1 min-h-0 relative">
        <ChalkboardCanvas
          ref={canvasRef}
          theme={activeBoard.theme}
          gridType={activeBoard.gridType}
          activeTool={activeTool}
          activeColor={activeColor}
          strokeWidth={strokeWidth}
          strokes={activeBoard.strokes}
          items={activeBoard.items}
          onCommitStroke={handleCommitStroke}
          onEraseStrokes={handleEraseStrokes}
          onDropDiagram={(d, x, y) => handlePlaceDiagram(d, x, y)}
          onDropWorksheet={(ex, x, y) => handlePlaceWorksheet(ex, x, y)}
          onDropNote={(title, content, color, x, y) => handlePinNote(title, content, color, x, y)}
          onUpdateItem={handleUpdateItem}
          onDeleteItem={handleDeleteItem}
          studyTools={studyTools}
          onUpdateStudyTool={handleUpdateStudyTool}
          onCommitToolPoints={handleCommitToolPoints}
        />

        {/* Unified Circular Draggable Radial Bubble (Tools + AI Assistant) */}
        <UnifiedBubble
          theme={activeBoard.theme}
          activeTool={activeTool}
          activeColor={activeColor}
          strokeWidth={strokeWidth}
          canUndo={undoStack.length > 0}
          canRedo={redoStack.length > 0}
          messages={messages}
          aiLoading={aiLoading}
          onSelectTool={setActiveTool}
          onSelectColor={setActiveColor}
          onChangeWidth={setStrokeWidth}
          onUndo={handleUndo}
          onRedo={handleRedo}
          onClearBoard={() => mutateActiveBoard((b) => ({ ...b, strokes: [], items: [] }))}
          onExportPng={handleExportPng}
          onOpenSync={() => setSyncModalOpen(true)}
          onSendMessage={handleSendAiMessage}
          onPlaceDiagram={(d) => handlePlaceDiagram(d)}
          onPlaceWorksheet={(ex) => handlePlaceWorksheet(ex)}
          onPinNote={(title, content, color) => handlePinNote(title, content, color)}
          studyTools={studyTools}
          onToggleStudyTool={handleToggleStudyTool}
          onDisableAllStudyTools={handleDisableAllStudyTools}
        />

        {/* Non-blocking Toast */}
        {toast && (
          <div
            role="status"
            aria-live="polite"
            className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl bg-slate-900/95 text-amber-200 border border-amber-400/30 text-xs font-medium shadow-xl pointer-events-none"
          >
            {toast}
          </div>
        )}
      </main>

      <SyncBoardsModal
        open={syncModalOpen}
        user={user}
        authReady={authReady}
        syncStatus={syncStatus}
        syncError={syncError}
        boards={boards}
        activeBoardId={activeBoard.boardId}
        onClose={() => setSyncModalOpen(false)}
        onSignIn={handleSignIn}
        onSignOut={handleSignOut}
        onCreateBoard={handleCreateBoard}
        onSelectBoard={(id) => {
          setActiveBoardId(id);
          setUndoStack([]);
          setRedoStack([]);
        }}
        onDeleteBoard={handleDeleteBoard}
        onForceSync={() => syncBoardToCloud(activeBoard)}
      />
    </div>
  );
}
