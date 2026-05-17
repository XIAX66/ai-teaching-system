import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import {
  Bot,
  BookOpen,
  Camera,
  Check,
  ChevronLeft,
  Copy,
  Download,
  Edit3,
  File,
  Loader2,
  Network,
  Plus,
  RefreshCw,
  Send,
  Trash2,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import ForceGraph2D from 'react-force-graph-2d';

interface ChatMessage {
  role: 'user' | 'ai';
  text: string;
  image?: string;
}

interface GraphNodeData {
  id: string;
  name: string;
  summary?: string;
  [key: string]: any;
}

interface GraphLinkData {
  source: string;
  target: string;
  type: string;
}

const ResourceDetailPage: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'reader' | 'parsed' | 'videos' | 'files' | 'graph'>('reader');
  const [loading, setLoading] = useState(true);
  const [graphLoading, setGraphLoading] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadForm, setUploadForm] = useState({ title: '', description: '' });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [question, setQuestion] = useState('');
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [isAsking, setIsAsking] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [graphData, setGraphData] = useState<{ nodes: GraphNodeData[]; links: GraphLinkData[] }>({ nodes: [], links: [] });
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fgRef = useRef<any>(null);

  const isTeacher = localStorage.getItem('role') === 'teacher';

  const fetchData = async () => {
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      const [contentRes, historyRes] = await Promise.all([
        axios.get(`/api/textbook/content/${id}`, { headers }),
        axios.get(`/api/ai/history/${id}`, { headers }),
      ]);

      setData(contentRes.data.data);
      if (historyRes.data.data) {
        setChatHistory(
          historyRes.data.data.map((message: any) => ({
            role: message.role === 'assistant' ? 'ai' : 'user',
            text: message.content,
          }))
        );
      }
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 403) {
        alert('权限不足');
        navigate('/dashboard');
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchGraph = async () => {
    setGraphLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`/api/textbook/graph/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.data.data?.nodes?.length) {
        setGraphData({
          nodes: res.data.data.nodes.map((node: any) => ({
            id: String(node.id),
            name: node.label,
            summary: node.props?.summary,
            ...node.props,
          })),
          links: (res.data.data.links || []).map((link: any) => ({
            source: String(link.source),
            target: String(link.target),
            type: link.type,
          })),
        });
      } else {
        setGraphData({ nodes: [], links: [] });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setGraphLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [id]);

  useEffect(() => {
    if (activeTab === 'graph') {
      fetchGraph();
    }
  }, [activeTab, id]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory]);

  useEffect(() => {
    if (fgRef.current) {
      fgRef.current.d3Force('charge').strength(-820);
      fgRef.current.d3Force('link').distance(180);
    }
  }, [graphData]);

  const handleResourceUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      return;
    }

    const formData = new FormData();
    formData.append('title', uploadForm.title);
    formData.append('description', uploadForm.description);
    formData.append('file', selectedFile);

    try {
      const token = localStorage.getItem('token');
      await axios.post(`/api/textbook/content/${id}/resource`, formData, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' },
      });
      setShowUploadModal(false);
      setUploadForm({ title: '', description: '' });
      setSelectedFile(null);
      fetchData();
    } catch (err) {
      alert('上传失败');
    }
  };

  const deleteResource = async (resourceId: number, title: string) => {
    if (!window.confirm(`确定要删除资源《${title}》吗？`)) {
      return;
    }
    try {
      const token = localStorage.getItem('token');
      await axios.delete(`/api/textbook/resource/${resourceId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      fetchData();
    } catch (err) {
      alert('删除失败');
    }
  };

  const takeScreenshot = (e: React.MouseEvent) => {
    const card = (e.currentTarget as HTMLElement).closest('.video-card');
    const video = card?.querySelector('video');
    if (video && canvasRef.current) {
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      try {
        ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);
        const base64 = canvas.toDataURL('image/jpeg', 0.5);
        setPendingImage(base64);
        setChatHistory((prev) => [...prev, { role: 'ai', text: '已捕获视频画面，请描述您的问题：' }]);
      } catch (err) {
        alert('截图失败');
      }
    }
  };

  const truncateHistory = async (index: number) => {
    try {
      const token = localStorage.getItem('token');
      await axios.get(`/api/ai/truncate/${id}?index=${index}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setChatHistory((prev) => prev.slice(0, index));
      return true;
    } catch (err) {
      alert('操作失败');
      return false;
    }
  };

  const performAskAI = async (q: string) => {
    setIsAsking(true);
    const newUserMsg: ChatMessage = { role: 'user', text: q };
    setChatHistory((prev) => [...prev, newUserMsg, { role: 'ai', text: '' }]);
    setQuestion('');
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/ai/ask', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ textbook_id: parseInt(id!, 10), question: q }),
      });
      if (!response.ok) {
        throw new Error('AI 服务异常');
      }
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let fullText = '';
      let buffer = '';

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          let updated = false;
          for (const line of lines) {
            if (line.startsWith('data:')) {
              let content = line.substring(5);
              if (content.trim() === '[DONE]') {
                continue;
              }
              if (content.startsWith(' ')) {
                content = content.substring(1);
              }
              fullText += content;
              if (content.length === 0) {
                fullText += '\n';
              }
              updated = true;
            }
          }
          if (updated) {
            setChatHistory((prev) => {
              const next = [...prev];
              next[next.length - 1] = { ...next[next.length - 1], text: fullText };
              return next;
            });
          }
        }
      }
    } catch (err) {
      setChatHistory((prev) => {
        const next = [...prev];
        next[next.length - 1] = { ...next[next.length - 1], text: '抱歉，对话发生错误。' };
        return next;
      });
    } finally {
      setIsAsking(false);
    }
  };

  const askAI = () => {
    if (!question && !pendingImage) {
      return;
    }
    performAskAI(question);
  };

  const wrapText = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number) => {
    const chars = text.split('');
    let line = '';
    const lines = [];
    for (let i = 0; i < chars.length; i += 1) {
      const testLine = line + chars[i];
      if (ctx.measureText(testLine).width > maxWidth && i > 0) {
        lines.push(line);
        line = chars[i];
      } else {
        line = testLine;
      }
    }
    lines.push(line);
    return lines;
  };

  const assetUrl = (filePath?: string) => (filePath ? `/${filePath.replace(/^\/+/, '')}` : '');
  const pdfUrl = assetUrl(data?.metadata?.file_path);
  const videos = data?.resources?.filter((resource: any) => resource.type === 'video') || [];
  const files = data?.resources?.filter((resource: any) => resource.type === 'file') || [];

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex items-center gap-3 text-slate-500 font-semibold">
          <Loader2 className="animate-spin text-primary" size={22} />
          正在加载教材详情...
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-white overflow-hidden text-slate-900">
      <header className="h-16 border-b border-slate-200 flex items-center justify-between px-6 shrink-0 bg-white z-10 shadow-sm">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/dashboard')}
            className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-500"
          >
            <ChevronLeft size={24} />
          </button>
          <div className="h-6 w-px bg-slate-200 mx-2" />
          <div className="flex items-center gap-2">
            <BookOpen className="text-primary" size={20} />
            <h1 className="font-bold text-slate-800 truncate max-w-[220px]">{data?.metadata?.title || '教材详情'}</h1>
          </div>
        </div>
        <nav className="flex bg-slate-100 p-1 rounded-xl">
          <TabButton active={activeTab === 'reader'} onClick={() => setActiveTab('reader')} label="教材阅读" />
          <TabButton active={activeTab === 'parsed'} onClick={() => setActiveTab('parsed')} label="AI 解析文稿" />
          <TabButton active={activeTab === 'graph'} onClick={() => setActiveTab('graph')} label="知识图谱" icon={<Network size={14} />} />
          <TabButton active={activeTab === 'videos'} onClick={() => setActiveTab('videos')} label={`视频 (${videos.length})`} />
          <TabButton active={activeTab === 'files'} onClick={() => setActiveTab('files')} label={`资料 (${files.length})`} />
        </nav>
        {isTeacher && (
          <button
            onClick={() => setShowUploadModal(true)}
            className="bg-primary hover:bg-primary-dark text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all shadow-sm"
          >
            <Plus size={14} />
            上传教材资源
          </button>
        )}
      </header>

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 overflow-hidden relative bg-slate-50 border-r border-slate-200">
          <canvas ref={canvasRef} className="hidden" />
          <div className="h-full overflow-y-auto">
            {activeTab === 'reader' && (
              <div className="h-full p-6">
                {pdfUrl ? (
                  <iframe src={pdfUrl} className="w-full h-full rounded-xl shadow-2xl border bg-white" title="PDF" />
                ) : (
                  <div className="flex items-center justify-center h-full text-slate-400 font-medium">正在准备教材文件...</div>
                )}
              </div>
            )}

            {activeTab === 'parsed' && (
              <div className="p-12 max-w-4xl mx-auto">
                {data?.content?.chapters?.map((chapter: any, chapterIndex: number) => (
                  <div key={chapterIndex} className="mb-10 text-slate-900">
                    <h2 className="text-2xl font-black text-slate-800 mb-6 flex items-center gap-3">
                      <span className="w-1.5 h-8 bg-primary rounded-full" />
                      {chapter.title}
                    </h2>
                    {chapter.sections?.map((section: any, sectionIndex: number) => (
                      <div key={sectionIndex} className="mb-8 bg-white p-8 rounded-3xl border border-slate-100 shadow-sm text-slate-900">
                        <h3 className="text-lg font-bold text-slate-700 mb-4">{section.title}</h3>
                        <div className="whitespace-pre-wrap text-sm text-slate-700">{section.content}</div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}

            {activeTab === 'graph' && (
              <div className="h-full w-full relative overflow-hidden bg-gradient-to-br from-sky-50 via-white to-slate-100">
                <div
                  className="absolute inset-0 opacity-70"
                  style={{
                    backgroundImage:
                      'radial-gradient(circle at 1px 1px, rgba(14,165,233,0.14) 1px, transparent 0)',
                    backgroundSize: '26px 26px',
                  }}
                />

                {graphData.nodes.length > 0 ? (
                  <>
                    <ForceGraph2D
                      ref={fgRef}
                      graphData={graphData}
                      linkColor={() => '#94a3b8'}
                      linkWidth={1.2}
                      nodeLabel={(node: any) => node.name}
                      linkDirectionalArrowLength={5}
                      linkDirectionalArrowRelPos={1}
                      linkCurvature={0.16}
                      onNodeHover={(node: any) => {
                        setHoveredNodeId(node ? String(node.id) : null);
                        document.body.style.cursor = node ? 'pointer' : 'default';
                      }}
                      onNodeClick={(node: any) => navigate(`/resource/textbook/${id}/knowledge/${node.id}`)}
                      nodeCanvasObject={(node: any, ctx, globalScale) => {
                        const label = String(node.name || '');
                        const isHovered = hoveredNodeId === String(node.id);
                        const mode = globalScale < 0.45 ? 'far' : globalScale < 0.95 ? 'mid' : 'near';
                        const cardWidthPx = mode === 'near' ? 168 : mode === 'mid' ? 110 : 20;
                        const cardHeightPx = mode === 'near' ? 56 : mode === 'mid' ? 32 : 20;
                        const fontSizePx = mode === 'near' ? 13 : mode === 'mid' ? 10 : 0;
                        const cardWidth = cardWidthPx / globalScale;
                        const cardHeight = cardHeightPx / globalScale;
                        const x = alignToPixel(node.x - cardWidth / 2, globalScale);
                        const y = alignToPixel(node.y - cardHeight / 2, globalScale);

                        ctx.save();
                        ctx.shadowColor = 'transparent';

                        if (mode === 'far') {
                          ctx.beginPath();
                          ctx.fillStyle = isHovered ? '#2563eb' : '#38bdf8';
                          ctx.arc(node.x, node.y, (isHovered ? 8 : 6) / globalScale, 0, 2 * Math.PI);
                          ctx.fill();
                          node.__bckgDimensions = [24 / globalScale, 24 / globalScale];
                          ctx.restore();
                          return;
                        }

                        ctx.fillStyle = '#ffffff';
                        roundRect(ctx, x, y, cardWidth, cardHeight, (mode === 'near' ? 16 : 999) / globalScale);
                        ctx.fill();

                        ctx.lineWidth = (isHovered ? 2 : 1) / globalScale;
                        ctx.strokeStyle = isHovered ? '#2563eb' : '#dbeafe';
                        roundRect(ctx, x, y, cardWidth, cardHeight, (mode === 'near' ? 16 : 999) / globalScale);
                        ctx.stroke();

                        ctx.fillStyle = isHovered ? '#2563eb' : '#0ea5e9';
                        if (mode === 'near') {
                          roundRect(ctx, x + 10 / globalScale, y + 10 / globalScale, 8 / globalScale, cardHeight - 20 / globalScale, 999);
                          ctx.fill();
                        } else {
                          ctx.beginPath();
                          ctx.arc(x + 14 / globalScale, node.y, 4 / globalScale, 0, 2 * Math.PI);
                          ctx.fill();
                        }

                        ctx.textAlign = mode === 'near' ? 'center' : 'left';
                        ctx.textBaseline = 'middle';
                        ctx.fillStyle = '#0f172a';
                        ctx.font = `600 ${fontSizePx / globalScale}px sans-serif`;

                        if (mode === 'near') {
                          const lines = wrapText(ctx, label, (cardWidthPx - 28) / globalScale);
                          const lineHeight = (fontSizePx * 1.35) / globalScale;
                          lines.slice(0, 3).forEach((line, index) => {
                            ctx.fillText(line, node.x + 6 / globalScale, y + 14 / globalScale + (index + 0.8) * lineHeight);
                          });
                        } else {
                          ctx.fillText(truncateLabel(label, 10), x + 24 / globalScale, node.y + 0.5 / globalScale);
                        }

                        node.__bckgDimensions = [cardWidth, cardHeight];
                        ctx.restore();
                      }}
                      nodePointerAreaPaint={(node: any, color, ctx) => {
                        const [w, h] = node.__bckgDimensions || [168, 54];
                        ctx.fillStyle = color;
                        ctx.fillRect(node.x - w / 2, node.y - h / 2, w, h);
                      }}
                    />

                    <div className="absolute top-6 left-6 bg-white/90 backdrop-blur p-5 rounded-3xl border border-sky-100 shadow-lg z-10 max-w-sm">
                      <div className="flex items-center gap-2 text-sky-700 font-bold text-sm">
                        <Network size={16} />
                        知识图谱
                      </div>
                      <p className="text-sm text-slate-600 mt-2 leading-6">
                        点击任意知识点卡片会进入独立详情页，查看总结、前置关系，以及该知识点专属的视频和资料。
                      </p>
                    </div>

                    <button
                      onClick={fetchGraph}
                      className="absolute top-6 right-6 flex items-center gap-2 px-4 py-2.5 bg-white text-slate-700 rounded-2xl border border-slate-200 shadow-sm hover:border-sky-200 hover:text-primary transition-all z-10"
                    >
                      <RefreshCw size={15} />
                      刷新图谱
                    </button>
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-4 relative z-10">
                    {graphLoading ? <Loader2 className="animate-spin text-primary" size={48} /> : <Network size={48} className="opacity-20" />}
                    <p className="font-bold tracking-wide text-sm">{graphLoading ? 'AI 正在构建知识网络...' : '暂无图谱数据'}</p>
                    {!graphLoading && (
                      <button
                        onClick={fetchGraph}
                        className="flex items-center gap-2 px-6 py-3 bg-white hover:bg-sky-50 text-slate-700 rounded-2xl transition-all font-bold text-xs border border-slate-200"
                      >
                        <RefreshCw size={14} />
                        重新加载
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'videos' && (
              <div className="p-10 grid grid-cols-1 gap-8 max-w-5xl mx-auto">
                {videos.map((video: any) => (
                  <div key={video.id} className="bg-white rounded-3xl overflow-hidden border border-slate-200 shadow-sm video-card group">
                    <div className="aspect-video bg-black relative">
                      <video crossOrigin="anonymous" src={assetUrl(video.file_path)} controls className="w-full h-full" />
                      {isTeacher && (
                        <button
                          onClick={() => deleteResource(video.id, video.title)}
                          className="absolute top-4 right-4 bg-white/90 hover:bg-red-500 hover:text-white text-red-500 p-2 rounded-xl shadow-xl transition-all"
                        >
                          <Trash2 size={18} />
                        </button>
                      )}
                      <button
                        onClick={takeScreenshot}
                        className="absolute right-4 bottom-16 bg-white hover:bg-primary hover:text-white text-primary p-3 rounded-full shadow-2xl opacity-0 group-hover:opacity-100 transition-all flex items-center gap-2 font-bold text-xs"
                      >
                        <Camera size={18} />
                        截图提问
                      </button>
                    </div>
                    <div className="p-6">
                      <h3 className="text-xl font-bold text-slate-800 mb-2">{video.title}</h3>
                      <p className="text-slate-500 text-sm">{video.description || '暂无描述'}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {activeTab === 'files' && (
              <div className="p-10 max-w-4xl mx-auto space-y-4">
                {files.map((file: any) => (
                  <div key={file.id} className="bg-white p-6 rounded-2xl border border-slate-200 flex items-center justify-between hover:border-primary group transition-colors">
                    <div className="flex items-center gap-4">
                      <div className="p-3 bg-slate-50 rounded-xl text-slate-400 group-hover:text-primary transition-colors">
                        <File size={24} />
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-800">{file.title}</h4>
                        <p className="text-xs text-slate-400 font-bold uppercase">
                          {file.ext} • {(file.size / 1024 / 1024).toFixed(2)} MB
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <a
                        href={assetUrl(file.file_path)}
                        download
                        className="p-3 bg-slate-50 rounded-xl text-slate-400 hover:bg-primary hover:text-white transition-all"
                      >
                        <Download size={20} />
                      </a>
                      {isTeacher && (
                        <button
                          onClick={() => deleteResource(file.id, file.title)}
                          className="p-3 bg-slate-50 rounded-xl text-slate-400 hover:bg-red-500 hover:text-white transition-all"
                        >
                          <Trash2 size={20} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="w-[450px] flex flex-col bg-white border-l border-slate-200 shadow-xl">
          <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center text-white shadow-lg">
                <Bot size={22} />
              </div>
              <div>
                <h2 className="font-bold text-slate-800">AI 学习助理</h2>
                <div className="flex items-center gap-1.5 font-bold text-[10px] text-slate-400 uppercase tracking-widest">
                  <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                  Streaming Active
                </div>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-8 bg-slate-50/20 scroll-smooth">
            {chatHistory.length === 0 && (
              <div className="bg-primary/5 p-5 rounded-2xl border border-primary/10 text-sm text-slate-600 leading-relaxed font-medium text-center">
                你好，我是你的 AI 助理。你可以针对教材内容提问，或在视频里截图后继续追问。
              </div>
            )}
            {chatHistory.map((msg, idx) => (
              <div key={idx} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} group`}>
                <div
                  className={`max-w-[95%] rounded-3xl px-5 py-4 shadow-sm text-sm leading-relaxed relative ${
                    msg.role === 'user' ? 'bg-primary text-white rounded-tr-none' : 'bg-white border border-slate-100 text-slate-800 rounded-tl-none'
                  }`}
                >
                  {msg.image && <img src={msg.image} className="rounded-2xl mb-3 border border-white/20 w-full aspect-video object-cover" alt="shot" />}
                  {msg.role === 'ai' ? (
                    <div className="markdown-body text-slate-800">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.text || '正在思考...'}</ReactMarkdown>
                    </div>
                  ) : (
                    <div className="whitespace-pre-wrap">{msg.text}</div>
                  )}
                </div>
                <div className="mt-1 flex items-center gap-3 px-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                  {msg.role === 'user' ? (
                    <>
                      <button
                        onClick={() => {
                          setEditingIdx(idx);
                          setQuestion(msg.text);
                        }}
                        className="text-[10px] flex items-center gap-1 text-slate-400 hover:text-primary transition-colors font-bold uppercase"
                      >
                        <Edit3 size={12} />
                        编辑
                      </button>
                      <button
                        onClick={async () => {
                          if (window.confirm('确定删除吗？')) {
                            await truncateHistory(idx);
                          }
                        }}
                        className="text-[10px] flex items-center gap-1 text-slate-400 hover:text-red-500 transition-colors font-bold uppercase"
                      >
                        <Trash2 size={12} />
                        删除
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(msg.text);
                        setCopiedIdx(idx);
                        setTimeout(() => setCopiedIdx(null), 2000);
                      }}
                      className="text-[10px] flex items-center gap-1 text-slate-400 hover:text-primary transition-colors font-bold uppercase"
                    >
                      {copiedIdx === idx ? (
                        <>
                          <Check size={12} />
                          已复制
                        </>
                      ) : (
                        <>
                          <Copy size={12} />
                          复制原文
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          <div className="p-6 border-t border-slate-100 space-y-4 shadow-sm shrink-0">
            {editingIdx !== null && (
              <div className="flex items-center justify-between px-4 py-2 bg-primary/5 border border-primary/10 rounded-xl animate-in slide-in-from-bottom-2">
                <span className="text-[10px] font-bold text-primary uppercase flex items-center gap-2">
                  <Edit3 size={12} />
                  正在编辑第 {editingIdx + 1} 条消息...
                </span>
                <button onClick={() => { setEditingIdx(null); setQuestion(''); }} className="text-[10px] font-bold text-slate-400 hover:text-slate-600">
                  取消
                </button>
              </div>
            )}
            <div className="relative">
              <textarea
                placeholder={pendingImage ? '描述截图中的问题...' : '针对课程内容提问...'}
                className="w-full bg-slate-50 border border-slate-200 rounded-3xl p-5 pr-16 text-sm outline-none focus:ring-2 focus:ring-primary h-28 resize-none shadow-inner text-slate-900"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    askAI();
                  }
                }}
              />
              <button
                onClick={askAI}
                disabled={isAsking || (!question && !pendingImage)}
                className="absolute right-3 bottom-3 p-3.5 bg-primary text-white rounded-2xl shadow-xl disabled:bg-slate-200 transition-all active:scale-95"
              >
                <Send size={22} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {showUploadModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-[2.5rem] w-full max-w-lg p-10 shadow-2xl animate-in zoom-in-95 duration-200">
            <h3 className="text-2xl font-bold text-slate-800 mb-8">上传教材级资源</h3>
            <form onSubmit={handleResourceUpload} className="space-y-6">
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700 ml-1">资源名称</label>
                <input
                  className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-primary text-slate-900"
                  value={uploadForm.title}
                  onChange={(e) => setUploadForm({ ...uploadForm, title: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700 ml-1">简要描述</label>
                <textarea
                  className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl outline-none h-24 resize-none text-slate-900"
                  value={uploadForm.description}
                  onChange={(e) => setUploadForm({ ...uploadForm, description: e.target.value })}
                />
              </div>
              <div className="border-2 border-dashed border-slate-200 rounded-[2rem] p-10 flex flex-col items-center justify-center bg-slate-50 relative hover:border-primary transition-colors cursor-pointer">
                <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" onChange={(e) => setSelectedFile(e.target.files?.[0] || null)} required />
                <Plus size={32} className="text-slate-300 mb-2" />
                <span className="text-slate-500 text-sm">{selectedFile ? selectedFile.name : '选择文件'}</span>
              </div>
              <div className="flex gap-4 mt-8">
                <button type="button" onClick={() => setShowUploadModal(false)} className="flex-1 py-4 border rounded-2xl font-bold text-slate-500">
                  取消
                </button>
                <button type="submit" className="flex-1 py-4 bg-primary text-white rounded-2xl font-bold hover:bg-primary-dark shadow-lg shadow-blue-100 transition-all">
                  确认上传
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

const TabButton = ({ active, onClick, label, icon }: any) => (
  <button
    onClick={onClick}
    className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
      active ? 'bg-white text-primary shadow-sm' : 'text-slate-400 hover:text-slate-600'
    }`}
  >
    {icon}
    {label}
  </button>
);

const roundRect = (ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) => {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + safeRadius, y);
  ctx.lineTo(x + width - safeRadius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  ctx.lineTo(x + width, y + height - safeRadius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
  ctx.lineTo(x + safeRadius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  ctx.lineTo(x, y + safeRadius);
  ctx.quadraticCurveTo(x, y, x + safeRadius, y);
  ctx.closePath();
};

const alignToPixel = (value: number, scale: number) => Math.round(value * scale) / scale;

const truncateLabel = (value: string, maxLength: number) => {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength)}…`;
};

export default ResourceDetailPage;
