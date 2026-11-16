import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

const solveResponseSchema = {
  type: Type.OBJECT,
  properties: {
    answerMarkdown: {
      type: Type.STRING,
      description:
        'Lời giải chi tiết, rõ ràng từng bước bằng tiếng Việt, dùng ký hiệu toán học dễ hiểu trên bảng phấn.',
    },
    keyHighlights: {
      type: Type.ARRAY,
      description:
        'Danh sách 1 đến 3 ghi chú hoặc công thức trọng tâm ngắn gọn để làm nổi bật và ghim lên bảng.',
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING, description: 'Tiêu đề ngắn (<= 40 ký tự).' },
          content: { type: Type.STRING, description: 'Nội dung công thức hoặc ý chính ngắn gọn.' },
          color: {
            type: Type.STRING,
            description: 'Mã màu hex phấn sáng: #FDE047, #38BDF8, #4ADE80, #FB7185, hoặc #C084FC.',
          },
        },
        required: ['title', 'content', 'color'],
      },
    },
    diagrams: {
      type: Type.ARRAY,
      description:
        '0 đến 2 hình vẽ minh họa trực quan để học sinh kéo thả từ bong bóng chat ra bảng phấn.',
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          title: { type: Type.STRING, description: 'Tên hình vẽ (ví dụ: Tam giác vuông ABC).' },
          kind: {
            type: Type.STRING,
            enum: [
              'triangle',
              'circle',
              'coordinate_graph',
              'rectangle',
              'fraction_bar',
              'angle',
              'formula_card',
            ],
          },
          caption: { type: Type.STRING, description: 'Chú thích ngắn dưới hình.' },
          color: {
            type: Type.STRING,
            description: 'Màu nét phấn cho hình: #FDE047, #38BDF8, #4ADE80, #FB7185, #F8FAFC.',
          },
          params: {
            type: Type.OBJECT,
            description: 'Tham số hình học tương ứng với loại hình (kind).',
            properties: {
              a: { type: Type.NUMBER },
              b: { type: Type.NUMBER },
              c: { type: Type.NUMBER },
              labelA: { type: Type.STRING },
              labelB: { type: Type.STRING },
              labelC: { type: Type.STRING },
              rightAngle: { type: Type.BOOLEAN },
              radiusLabel: { type: Type.STRING },
              diameterLabel: { type: Type.STRING },
              centerLabel: { type: Type.STRING },
              expression: {
                type: Type.STRING,
                description: 'Biểu thức hàm số dạng x^2 - 2*x - 3 hoặc 2*x + 1 hoặc sin(x).',
              },
              xMin: { type: Type.NUMBER },
              xMax: { type: Type.NUMBER },
              yMin: { type: Type.NUMBER },
              yMax: { type: Type.NUMBER },
              widthLabel: { type: Type.STRING },
              heightLabel: { type: Type.STRING },
              numerator: { type: Type.NUMBER },
              denominator: { type: Type.NUMBER },
              degrees: { type: Type.NUMBER },
              formula: { type: Type.STRING },
              note: { type: Type.STRING },
            },
          },
        },
        required: ['id', 'title', 'kind', 'params'],
      },
    },
  },
  required: ['answerMarkdown', 'keyHighlights', 'diagrams'],
};

interface ChatHistoryTurn {
  role: 'user' | 'assistant';
  text: string;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '8mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, hasGeminiKey: Boolean(process.env.GEMINI_API_KEY) });
  });

  app.post('/api/ai/solve', async (req, res) => {
    try {
      const { question, history, boardImageBase64, boardTheme } = req.body as {
        question?: string;
        history?: ChatHistoryTurn[];
        boardImageBase64?: string;
        boardTheme?: string;
      };

      if (!question || typeof question !== 'string' || !question.trim()) {
        res.status(400).json({ error: 'Vui lòng nhập câu hỏi hoặc bài toán cần giải đáp.' });
        return;
      }

      if (!process.env.GEMINI_API_KEY) {
        res.status(503).json({
          error:
            'Chưa cấu hình GEMINI_API_KEY trên máy chủ. Bạn vẫn có thể sử dụng bảng màu ghi chú và kéo thả hình vẽ mẫu có sẵn trong bong bóng chat.',
        });
        return;
      }

      const systemInstruction = [
        'Bạn là Trợ lý Gia sư AI thân thiện, chuyên nghiệp trên ứng dụng Bảng Phấn Thông Minh dành cho giáo viên và học sinh Việt Nam.',
        'Nhiệm vụ: Giải thích bài toán hoặc kiến thức theo từng bước ngắn gọn, dễ hiểu, chính xác bằng tiếng Việt.',
        'Khi bài toán liên quan đến hình học, đồ thị hàm số, phân số, góc, hoặc công thức quan trọng, HÃY tạo kèm 1-2 sơ đồ trong mảng diagrams với kind và params chuẩn xác để học sinh kéo thả ra bảng.',
        'Quy ước params:',
        '- triangle: a, b, c (độ dài 3 cạnh hợp lệ), labelA, labelB, labelC, rightAngle (true nếu vuông).',
        '- circle: radiusLabel (ví dụ "R = 5 cm"), centerLabel (ví dụ "O").',
        '- coordinate_graph: expression (ví dụ "x^2 - 2*x - 3", "2*x + 1", "sin(x)"), xMin, xMax, yMin, yMax.',
        '- rectangle: widthLabel, heightLabel.',
        '- fraction_bar: numerator, denominator.',
        '- angle: degrees (số đo góc từ 10 đến 180).',
        '- formula_card: formula, note.',
        `Nền bảng hiện tại: ${boardTheme || 'green'}.`,
      ].join('\n');

      const recentHistory = Array.isArray(history)
        ? history
            .slice(-6)
            .map((h) => `${h.role === 'user' ? 'Học sinh' : 'Gia sư'}: ${h.text}`)
            .join('\n')
        : '';

      const promptText = recentHistory
        ? `Ngữ cảnh hội thoại gần đây:\n${recentHistory}\n\nCâu hỏi mới: ${question.trim()}`
        : question.trim();

      const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];

      if (boardImageBase64 && typeof boardImageBase64 === 'string') {
        const cleanedBase64 = boardImageBase64.replace(/^data:image\/\w+;base64,/, '');
        if (cleanedBase64.length > 0 && cleanedBase64.length < 5_000_000) {
          parts.push({
            inlineData: {
              mimeType: 'image/png',
              data: cleanedBase64,
            },
          });
        }
      }

      parts.push({ text: promptText });

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: { parts },
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: solveResponseSchema,
        },
      });

      const rawText = (response.text ?? '{}').trim();
      const parsed = JSON.parse(rawText);
      res.json(parsed);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Lỗi kết nối AI';
      console.error('Error in /api/ai/solve:', err);
      res.status(500).json({ error: `Không thể giải bài lúc này: ${message}` });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Smart Chalkboard server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
