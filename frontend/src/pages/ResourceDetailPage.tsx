import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { 
  ChevronLeft, Bot, BookOpen, 
  Zap, Play, Download, Upload, Plus, File, Camera, Send,
  Trash2, Edit3, Copy, Check, Network, RefreshCw, Loader2, X
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import ForceGraph2D from 'react-force-graph-2d';

interface ChatMessage {
  role: 'user' | 'ai';
  text: string;
  image?: string;
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
  const chatEndRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [graphData, setGraphData] = useState<{nodes: any[], links: any[]}>({ nodes: [], links: [] });
  const [selectedNode, setSelectedNode] = useState<any>(null);
  const fgRef = useRef<any>(null);

  const isTeacher = localStorage.getItem('role') === 'teacher';

  const fetchData = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`/api/textbook/content/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setData(res.data.data);

      const historyRes = await axios.get(`/api/ai/history/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (historyRes.data.data) {
        setChatHistory(historyRes.data.data.map((m: any) => ({
          role: m.role === 'assistant' ? 'ai' : 'user',
          text: m.content
        })));
      }
    } catch (err) { 
      if (axios.isAxiosError(err) && err.response?.status === 403) {
        alert('权限不足');
        navigate('/dashboard');
      }
    } finally { setLoading(false); }
  };

  const fetchGraph = async () => {
    setGraphLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`/api/textbook/graph/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.data.data && res.data.data.nodes && res.data.data.nodes.length > 0) {
        const raw = res.data.data;
        setGraphData({
          nodes: raw.nodes.map((n: any) => ({ id: n.id, name: n.label, ...n.props })),
          links: (raw.links || []).map((l: any) => ({ source: l.source, target: l.target, type: l.type }))
        });
      } else {
        setGraphData({ nodes: [], links: [] });
      }
    } catch (err) { console.error(err); } finally { setGraphLoading(false); }
  };

  useEffect(() => { fetchData(); }, [id]);
  useEffect(() => { if (activeTab === 'graph') fetchGraph(); }, [activeTab, id]);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatHistory]);

  // 配置力导向参数：增加排斥力和硬碰撞
  useEffect(() => {
    if (fgRef.current) {
      fgRef.current.d3Force('charge').strength(-1200); // 更强的排斥
      fgRef.current.d3Force('link').distance(250);    // 更长的距离
      // 增加碰撞力，防止重叠
      // fgRef.current.d3Force('collide', require('d3-force').forceCollide(100)); 
      // 注意：直接操作 d3Force 时，半径设定为 100 左右
    }
  }, [graphData]);

  const handleResourceUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) return;
    const formData = new FormData();
    formData.append('title', uploadForm.title);
    formData.append('description', uploadForm.description);
    formData.append('file', selectedFile);
    try {
      const token = localStorage.getItem('token');
      await axios.post(`/api/textbook/content/${id}/resource`, formData, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' }
      });
      setShowUploadModal(false);
      setUploadForm({ title: '', description: '' });
      setSelectedFile(null);
      fetchData();
    } catch (err) { alert('上传失败'); }
  };

  const deleteResource = async (resourceId: number, title: string) => {
    if (!window.confirm(`确定要删除资源《${title}》吗？`)) return;
    try {
      const token = localStorage.getItem('token');
      await axios.delete(`/api/textbook/resource/${resourceId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchData();
    } catch (err) { alert('删除失败'); }
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
        setChatHistory(prev => [...prev, { role: 'ai', text: '已捕获视频画面，请描述您的问题：' }]);
      } catch (err) { alert('截图失败'); }
    }
  };

  const truncateHistory = async (index: number) => {
    try {
      const token = localStorage.getItem('token');
      await axios.get(`/api/ai/truncate/${id}?index=${index}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setChatHistory(prev => prev.slice(0, index));
      return true;
    } catch (err) { alert('操作失败'); return false; }
  };

  const askAIWithPrompt = async (q: string) => {
    performAskAI(q);
  };

  const performAskAI = async (q: string) => {
    setIsAsking(true);
    const newUserMsg: ChatMessage = { role: 'user', text: q };
    setChatHistory(prev => [...prev, newUserMsg, { role: 'ai', text: '' }]);
    setQuestion('');
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/ai/ask', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ textbook_id: parseInt(id!), question: q })
      });
      if (!response.ok) throw new Error('AI 服务异常');
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let fullText = '';
      let buffer = '';
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          let updated = false;
          for (const line of lines) {
            if (line.startsWith('data:')) {
              let content = line.substring(5);
              if (content.trim() === '[DONE]') continue;
              if (content.startsWith(' ')) content = content.substring(1);
              fullText += content;
              if (content.length === 0) fullText += "\n";
              updated = true;
            }
          }
          if (updated) {
            setChatHistory(prev => {
              const next = [...prev];
              next[next.length - 1] = { ...next[next.length - 1], text: fullText };
              return next;
            });
          }
        }
      }
    } catch (err: any) {
      setChatHistory(prev => {
        const next = [...prev];
        next[next.length - 1] = { ...next[next.length - 1], text: '抱歉，对话发生错误。' };
        return next;
      });
    } finally { setIsAsking(false); }
  };

  const askAI = () => {
    if (!question && !pendingImage) return;
    performAskAI(question);
  };

  const wrapText = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number) => {
    const words = text.split('');
    let line = '';
    const lines = [];
    for (let n = 0; n < words.length; n++) {
      const testLine = line + words[n];
      const metrics = ctx.measureText(testLine);
      const testWidth = metrics.width;
      if (testWidth > maxWidth && n > 0) {
        lines.push(line);
        line = words[n];
      } else {
        line = testLine;
      }
    }
    lines.push(line);
    return lines;
  };

  const pdfUrl = data?.metadata?.file_path ? `http://localhost:8080/${data.metadata.file_path}` : null;
  const videos = data?.resources?.filter((r: any) => r.type === 'video') || [];
  const files = data?.resources?.filter((r: any) => r.type === 'file') || [];

  return (
    <div className="h-screen flex flex-col bg-white overflow-hidden text-slate-900 font-sans">
      <header className="h-16 border-b border-slate-200 flex items-center justify-between px-6 shrink-0 bg-white z-10 shadow-sm">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/dashboard')} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-500"><ChevronLeft size={24} /></button>
          <div className="h-6 w-px bg-slate-200 mx-2" />
          <div className="flex items-center gap-2">
            <BookOpen className="text-primary" size={20} />
            <h1 className="font-bold text-slate-800 truncate max-w-[200px]">{data?.metadata?.title || '正在加载'}</h1>
          </div>
        </div>
        <nav className="flex bg-slate-100 p-1 rounded-xl">
          <TabButton active={activeTab === 'reader'} onClick={() => setActiveTab('reader')} label="教材阅读" />
          <TabButton active={activeTab === 'parsed'} onClick={() => setActiveTab('parsed')} label="AI 解析文稿" />
          <TabButton active={activeTab === 'graph'} onClick={() => setActiveTab('graph')} label="知识图谱" icon={<Network size={14}/>} />
          <TabButton active={activeTab === 'videos'} onClick={() => setActiveTab('videos')} label={`视频 (${videos.length})`} />
          <TabButton active={activeTab === 'files'} onClick={() => setActiveTab('files')} label={`资料 (${files.length})`} />
        </nav>
        {isTeacher && <button onClick={() => setShowUploadModal(true)} className="bg-primary hover:bg-primary-dark text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all shadow-sm"><Plus size={14}/> 上传资源</button>}
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
                {data?.content?.chapters?.map((ch: any, i: number) => (
                  <div key={i} className="mb-10 text-slate-900">
                    <h2 className="text-2xl font-black text-slate-800 mb-6 flex items-center gap-3 text-slate-900"><span className="w-1.5 h-8 bg-primary rounded-full" />{ch.title}</h2>
                    {ch.sections?.map((sec: any, si: number) => (
                      <div key={si} className="mb-8 bg-white p-8 rounded-3xl border border-slate-100 shadow-sm text-slate-900 text-inherit"><h3 className="text-lg font-bold text-slate-700 mb-4">{sec.title}</h3><div className="whitespace-pre-wrap text-sm text-slate-700">{sec.content}</div></div>
                    ))}
                  </div>
                ))}
              </div>
            )}
            {activeTab === 'graph' && (
              <div className="h-full w-full bg-[#0f172a] relative overflow-hidden">
                <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(#3b82f6 0.5px, transparent 0.5px)', backgroundSize: '30px 30px' }}></div>
                
                {graphData.nodes.length > 0 ? (
                  <ForceGraph2D
                    ref={fgRef}
                    graphData={graphData}
                    nodeLabel="name"
                    linkColor={() => '#3b82f666'}
                    linkDirectionalArrowLength={6}
                    linkDirectionalArrowRelPos={1}
                    linkCurvature={0.2}
                    nodeCanvasObject={(node: any, ctx, globalScale) => {
                      const label = node.name;
                      const fontSize = 14/globalScale;
                      ctx.font = `bold ${fontSize}px "Inter", sans-serif`;
                      
                      const cardWidth = 160;
                      const lines = wrapText(ctx, label, cardWidth - 30);
                      const lineHeight = fontSize * 1.4;
                      const cardHeight = lines.length * lineHeight + 30;

                      ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
                      ctx.shadowBlur = 15 / globalScale;
                      ctx.shadowOffsetY = 5 / globalScale;

                      const isSelected = node.id === selectedNode?.id;
                      ctx.fillStyle = isSelected ? '#1e293b' : '#ffffff';
                      
                      const x = node.x - cardWidth / 2;
                      const y = node.y - cardHeight / 2;
                      
                      const r = 12 / globalScale;
                      ctx.beginPath();
                      ctx.moveTo(x + r, y); ctx.lineTo(x + cardWidth - r, y);
                      ctx.quadraticCurveTo(x + cardWidth, y, x + cardWidth, y + r);
                      ctx.lineTo(x + cardWidth, y + cardHeight - r);
                      ctx.quadraticCurveTo(x + cardWidth, y + cardHeight, x + cardWidth - r, y + cardHeight);
                      ctx.lineTo(x + r, y + cardHeight);
                      ctx.quadraticCurveTo(x, y + cardHeight, x, y + cardHeight - r);
                      ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
                      ctx.closePath(); ctx.fill();

                      ctx.shadowBlur = 0;
                      ctx.fillStyle = '#3b82f6';
                      ctx.fillRect(x, y + r, 6 / globalScale, cardHeight - 2 * r);

                      ctx.textAlign = 'center';
                      ctx.textBaseline = 'middle';
                      ctx.fillStyle = isSelected ? '#ffffff' : '#1e293b';
                      lines.forEach((line, i) => {
                        const lineY = y + 15 + (i + 0.5) * lineHeight;
                        ctx.fillText(line, node.x, lineY);
                      });

                      // 记录尺寸供 Pointer 区域绘制使用
                      node.__bckgDimensions = [cardWidth, cardHeight];
                    }}
                    nodePointerAreaPaint={(node: any, color, ctx) => {
                      // 关键修复：扩大点击区域至整张卡片
                      const [w, h] = node.__bckgDimensions || [160, 40];
                      ctx.fillStyle = color;
                      ctx.fillRect(node.x - w / 2, node.y - h / 2, w, h);
                    }}
                    onNodeClick={(node: any) => setSelectedNode(node)}
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-4 relative z-10">
                    {graphLoading ? <Loader2 className="animate-spin text-primary" size={48} /> : <Network size={48} className="opacity-20" />}
                    <p className="font-bold uppercase tracking-widest text-sm">{graphLoading ? 'AI 正在构建知识网络...' : '暂无图谱数据'}</p>
                    {!graphLoading && <button onClick={fetchGraph} className="flex items-center gap-2 px-6 py-3 bg-white/5 hover:bg-white/10 text-white rounded-2xl transition-all font-bold text-xs border border-white/10"><RefreshCw size={14} /> 刷新图谱</button>}
                  </div>
                )}

                {selectedNode && (
                  <div className="absolute top-6 right-6 w-[340px] bg-[#1e293b]/95 backdrop-blur-2xl border border-white/10 shadow-2xl rounded-[2.5rem] p-8 animate-in slide-in-from-right-4 duration-300 z-20 text-white">
                    <button onClick={() => setSelectedNode(null)} className="absolute top-6 right-6 text-white/40 hover:text-white"><X size={20}/></button>
                    <div className="flex items-center gap-3 mb-6">
                      <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-500/20"><Zap size={20}/></div>
                      <h3 className="text-lg font-bold leading-tight">{selectedNode.name}</h3>
                    </div>
                    <div className="bg-white/5 rounded-2xl p-6 mb-8 border border-white/5">
                      <p className="text-sm text-slate-300 leading-relaxed font-medium">{selectedNode.description || '暂无详细描述内容'}</p>
                    </div>
                    <button 
                      onClick={() => {
                        askAIWithPrompt(`我想深入学习一下“${selectedNode.name}”这个知识点，请结合教材内容给我讲解一下。`);
                        setSelectedNode(null);
                      }}
                      className="w-full bg-primary hover:bg-primary-dark text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20 transition-all active:scale-95 text-inherit"
                    >
                      <Bot size={18}/> 发起 AI 深入解析
                    </button>
                  </div>
                )}

                <div className="absolute bottom-8 left-8 bg-white/5 backdrop-blur-md p-5 rounded-3xl border border-white/10 text-white/80 pointer-events-none">
                  <h4 className="font-bold text-xs mb-1 flex items-center gap-2 text-white"><Network size={14}/> 知识逻辑图谱</h4>
                  <p className="text-[10px] opacity-60 font-medium">全卡片响应式点击 · 增强物理防重叠布局</p>
                </div>
              </div>
            )}
            {activeTab === 'videos' && (
              <div className="p-10 grid grid-cols-1 gap-8 max-w-5xl mx-auto">
                {videos.map((v: any) => (
                  <div key={v.id} className="bg-white rounded-3xl overflow-hidden border border-slate-200 shadow-sm video-card group">
                    <div className="aspect-video bg-black relative">
                      <video crossOrigin="anonymous" src={`http://localhost:8080/${v.file_path}`} controls className="w-full h-full" />
                      {isTeacher && <button onClick={() => deleteResource(v.id, v.title)} className="absolute top-4 right-4 bg-white/90 hover:bg-red-500 hover:text-white text-red-500 p-2 rounded-xl shadow-xl transition-all"><Trash2 size={18}/></button>}
                      <button onClick={takeScreenshot} className="absolute right-4 bottom-16 bg-white hover:bg-primary hover:text-white text-primary p-3 rounded-full shadow-2xl opacity-0 group-hover:opacity-100 transition-all flex items-center gap-2 font-bold text-xs"><Camera size={18} /> 截图提问</button>
                    </div>
                    <div className="p-6"><h3 className="text-xl font-bold text-slate-800 mb-2">{v.title}</h3><p className="text-slate-500 text-sm">{v.description || '暂无描述'}</p></div>
                  </div>
                ))}
              </div>
            )}
            {activeTab === 'files' && (
              <div className="p-10 max-w-4xl mx-auto space-y-4">
                {files.map((f: any) => (
                  <div key={f.id} className="bg-white p-6 rounded-2xl border border-slate-200 flex items-center justify-between hover:border-primary group transition-colors">
                    <div className="flex items-center gap-4"><div className="p-3 bg-slate-50 rounded-xl text-slate-400 group-hover:text-primary transition-colors"><File size={24}/></div><div><h4 className="font-bold text-slate-800">{f.title}</h4><p className="text-xs text-slate-400 font-bold uppercase">{f.ext} • {(f.size / 1024 / 1024).toFixed(2)} MB</p></div></div>
                    <div className="flex gap-2">
                      <a href={`http://localhost:8080/${f.file_path}`} download className="p-3 bg-slate-50 rounded-xl text-slate-400 hover:bg-primary hover:text-white transition-all"><Download size={20}/></a>
                      {isTeacher && <button onClick={() => deleteResource(f.id, f.title)} className="p-3 bg-slate-50 rounded-xl text-slate-400 hover:bg-red-500 hover:text-white transition-all"><Trash2 size={20}/></button>}
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
              <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center text-white shadow-lg"><Bot size={22} /></div>
              <div><h2 className="font-bold text-slate-800">AI 学习助理</h2><div className="flex items-center gap-1.5 font-bold text-[10px] text-slate-400 uppercase tracking-widest"><span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"/>Streaming Active</div></div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-8 bg-slate-50/20 scroll-smooth">
            {chatHistory.length === 0 && <div className="bg-primary/5 p-5 rounded-2xl border border-primary/10 text-sm text-slate-600 leading-relaxed font-medium text-center">👋 你好！我是你的 AI 助理。你可以针对教材提问，或者针对视频截图提问。</div>}
            {chatHistory.map((msg, idx) => (
              <div key={idx} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} group`}>
                <div className={`max-w-[95%] rounded-3xl px-5 py-4 shadow-sm text-sm leading-relaxed relative ${msg.role === 'user' ? 'bg-primary text-white rounded-tr-none' : 'bg-white border border-slate-100 text-slate-800 rounded-tl-none'}`}>
                  {msg.image && <img src={msg.image} className="rounded-2xl mb-3 border border-white/20 w-full aspect-video object-cover" alt="shot" />}
                  <div className="text-inherit">
                    {msg.role === 'ai' ? (
                      <div className="markdown-body text-slate-800">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.text || "正在思考..."}</ReactMarkdown>
                      </div>
                    ) : <div className="whitespace-pre-wrap">{msg.text}</div>}
                  </div>
                </div>
                <div className={`mt-1 flex items-center gap-3 px-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200`}>
                  {msg.role === 'user' ? (
                    <>
                      <button onClick={() => { setEditingIdx(idx); setQuestion(msg.text); }} className="text-[10px] flex items-center gap-1 text-slate-400 hover:text-primary transition-colors font-bold uppercase"><Edit3 size={12}/> 编辑</button>
                      <button onClick={async () => { if(window.confirm('确定删除吗？')) await truncateHistory(idx); }} className="text-[10px] flex items-center gap-1 text-slate-400 hover:text-red-500 transition-colors font-bold uppercase"><Trash2 size={12}/> 删除</button>
                    </>
                  ) : (
                    <button onClick={() => { navigator.clipboard.writeText(msg.text); setCopiedIdx(idx); setTimeout(() => setCopiedIdx(null), 2000); }} className="text-[10px] flex items-center gap-1 text-slate-400 hover:text-primary transition-colors font-bold uppercase">
                      {copiedIdx === idx ? <><Check size={12}/> 已复制</> : <><Copy size={12}/> 复制原文</>}
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
                <span className="text-[10px] font-bold text-primary uppercase flex items-center gap-2"><Edit3 size={12}/> 正在编辑第 {editingIdx + 1} 条消息...</span>
                <button onClick={() => { setEditingIdx(null); setQuestion(''); }} className="text-[10px] font-bold text-slate-400 hover:text-slate-600">取消</button>
              </div>
            )}
            <div className="relative">
              <textarea placeholder={pendingImage ? "描述截图的问题..." : "针对课程提问..."} className="w-full bg-slate-50 border border-slate-200 rounded-3xl p-5 pr-16 text-sm outline-none focus:ring-2 focus:ring-primary h-28 resize-none shadow-inner text-slate-900" value={question} onChange={e => setQuestion(e.target.value)} onKeyDown={e => { if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); askAI(); } }}/>
              <button onClick={askAI} disabled={isAsking || (!question && !pendingImage)} className="absolute right-3 bottom-3 p-3.5 bg-primary text-white rounded-2xl shadow-xl disabled:bg-slate-200 transition-all active:scale-95 text-inherit"><Send size={22} /></button>
            </div>
          </div>
        </div>
      </div>

      {showUploadModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-[2.5rem] w-full max-w-lg p-10 shadow-2xl animate-in zoom-in-95 duration-200">
            <h3 className="text-2xl font-bold text-slate-800 mb-8 text-inherit">上传附属资源</h3>
            <form onSubmit={handleResourceUpload} className="space-y-6">
              <div className="space-y-2"><label className="text-sm font-bold text-slate-700 ml-1 text-inherit">资源名称</label><input className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-primary text-slate-900" value={uploadForm.title} onChange={e => setUploadForm({...uploadForm, title: e.target.value})} required /></div>
              <div className="space-y-2"><label className="text-sm font-bold text-slate-700 ml-1 text-inherit">简要描述</label><textarea className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl outline-none h-24 resize-none text-slate-900" value={uploadForm.description} onChange={e => setUploadForm({...uploadForm, description: e.target.value})}/></div>
              <div className="border-2 border-dashed border-slate-200 rounded-[2rem] p-10 flex flex-col items-center justify-center bg-slate-50 relative hover:border-primary transition-colors cursor-pointer text-inherit"><input type="file" className="absolute inset-0 opacity-0 cursor-pointer" onChange={e => setSelectedFile(e.target.files?.[0] || null)} required/><Plus size={32} className="text-slate-300 mb-2"/><span className="text-slate-500 text-sm">选择文件</span></div>
              <div className="flex gap-4 mt-8"><button type="button" onClick={() => setShowUploadModal(false)} className="flex-1 py-4 border rounded-2xl font-bold text-slate-500 text-inherit">取消</button><button type="submit" className="flex-1 py-4 bg-primary text-white rounded-2xl font-bold hover:bg-primary-dark shadow-lg shadow-blue-100 transition-all text-inherit">确认上传</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

const TabButton = ({ active, onClick, label, icon }: any) => (
  <button onClick={onClick} className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${active ? 'bg-white text-primary shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>{icon}{label}</button>
);

export default ResourceDetailPage;
