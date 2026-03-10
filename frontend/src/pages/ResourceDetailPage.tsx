import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { 
  ChevronLeft, Bot, BookOpen, 
  Zap, Play, Download, Upload, Plus, File, Camera, Send
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface ChatMessage {
  role: 'user' | 'ai';
  text: string;
  image?: string;
}

const ResourceDetailPage: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'reader' | 'parsed' | 'videos' | 'files'>('reader');
  const [loading, setLoading] = useState(true);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadForm, setUploadForm] = useState({ title: '', description: '' });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [question, setQuestion] = useState('');
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [isAsking, setIsAsking] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const isTeacher = localStorage.getItem('role') === 'teacher';

  const fetchData = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`/api/textbook/content/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setData(res.data.data);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, [id]);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatHistory]);

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

  const askAI = async () => {
    if (!question && !pendingImage) return;
    setIsAsking(true);
    
    const currentQuestion = question;
    const currentImage = pendingImage;
    const newUserMsg: ChatMessage = { role: 'user', text: currentQuestion || "分析截图", image: currentImage || undefined };
    
    setChatHistory(prev => [...prev, newUserMsg, { role: 'ai', text: '' }]);
    setQuestion('');
    setPendingImage(null);

    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/ai/ask', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ textbook_id: parseInt(id!), question: currentQuestion || "总结教材内容", image_base_64: currentImage })
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

              if (content.length === 0) {
                fullText += "\n";
              }

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

  const pdfUrl = data?.metadata?.file_path ? `http://localhost:8080/${data.metadata.file_path}` : '';
  const videos = data?.resources?.filter((r: any) => r.type === 'video') || [];
  const files = data?.resources?.filter((r: any) => r.type === 'file') || [];

  return (
    <div className="h-screen flex flex-col bg-white overflow-hidden text-slate-900">
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
          <TabButton active={activeTab === 'videos'} onClick={() => setActiveTab('videos')} label={`视频 (${videos.length})`} />
          <TabButton active={activeTab === 'files'} onClick={() => setActiveTab('files')} label={`资料 (${files.length})`} />
        </nav>
        {isTeacher && <button onClick={() => setShowUploadModal(true)} className="bg-primary hover:bg-primary-dark text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all shadow-sm"><Plus size={14}/> 上传资源</button>}
      </header>

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 overflow-hidden relative bg-slate-50 border-r border-slate-200">
          <canvas ref={canvasRef} className="hidden" />
          <div className="h-full overflow-y-auto">
            {activeTab === 'reader' && <div className="h-full p-6"><iframe src={pdfUrl} className="w-full h-full rounded-xl shadow-2xl border bg-white" title="PDF" /></div>}
            {activeTab === 'parsed' && (
              <div className="p-12 max-w-4xl mx-auto">
                {data?.content?.chapters?.map((ch: any, i: number) => (
                  <div key={i} className="mb-10 text-slate-900 text-inherit">
                    <h2 className="text-2xl font-black text-slate-800 mb-6 flex items-center gap-3 text-slate-900"><span className="w-1.5 h-8 bg-primary rounded-full" />{ch.title}</h2>
                    {ch.sections?.map((sec: any, si: number) => (
                      <div key={si} className="mb-8 bg-white p-8 rounded-3xl border border-slate-100 shadow-sm text-slate-900 text-inherit"><h3 className="text-lg font-bold text-slate-700 mb-4">{sec.title}</h3><div className="whitespace-pre-wrap text-sm text-slate-700">{sec.content}</div></div>
                    ))}
                  </div>
                ))}
              </div>
            )}
            {activeTab === 'videos' && (
              <div className="p-10 grid grid-cols-1 gap-8 max-w-5xl mx-auto">
                {videos.map((v: any) => (
                  <div key={v.id} className="bg-white rounded-3xl overflow-hidden border border-slate-200 shadow-sm video-card group">
                    <div className="aspect-video bg-black relative">
                      <video crossOrigin="anonymous" src={`http://localhost:8080/${v.file_path}`} controls className="w-full h-full" />
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
                    <a href={`http://localhost:8080/${f.file_path}`} download className="p-3 bg-slate-50 rounded-xl text-slate-400 hover:bg-primary hover:text-white transition-all"><Download size={20}/></a>
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

          <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50/20 scroll-smooth">
            {chatHistory.length === 0 && <div className="bg-primary/5 p-5 rounded-2xl border border-primary/10 text-sm text-slate-600 leading-relaxed font-medium text-center">👋 你好！我是你的 AI 助理。你可以针对教材提问，或者针对视频截图提问。</div>}
            {chatHistory.map((msg, idx) => (
              <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[95%] rounded-3xl px-5 py-4 shadow-sm text-sm leading-relaxed ${msg.role === 'user' ? 'bg-primary text-white rounded-tr-none whitespace-pre-wrap' : 'bg-white border border-slate-100 text-slate-800 rounded-tl-none'}`}>
                  {msg.image && <img src={msg.image} className="rounded-2xl mb-3 border border-white/20 w-full aspect-video object-cover" alt="shot" />}
                  <div className="text-inherit">
                    {msg.role === 'ai' ? (
                      <div className="markdown-body text-slate-800">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.text || "正在思考..."}</ReactMarkdown>
                      </div>
                    ) : <div className="text-white whitespace-pre-wrap">{msg.text}</div>}
                  </div>
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          <div className="p-6 border-t border-slate-100 space-y-4 shadow-sm shrink-0">
            {pendingImage && (
              <div className="relative w-32 aspect-video group ml-2 animate-in fade-in slide-in-from-bottom-4">
                <img src={pendingImage} className="w-full h-full rounded-xl border-2 border-primary shadow-xl object-cover" alt="pre" />
                <button onClick={() => setPendingImage(null)} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1.5 shadow-lg"><Plus className="rotate-45" size={14}/></button>
              </div>
            )}
            <div className="relative">
              <textarea 
                placeholder={pendingImage ? "描述截图的问题..." : "针对课程提问..."}
                className="w-full bg-slate-50 border border-slate-200 rounded-3xl p-5 pr-16 text-sm outline-none focus:ring-2 focus:ring-primary h-28 resize-none shadow-inner text-slate-900"
                value={question}
                onChange={e => setQuestion(e.target.value)}
                onKeyDown={e => { if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); askAI(); } }}
              />
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
              <div className="border-2 border-dashed border-slate-200 rounded-[2rem] p-10 flex flex-col items-center justify-center bg-slate-50 relative hover:border-primary transition-colors cursor-pointer text-inherit"><input type="file" className="absolute inset-0 opacity-0 cursor-pointer" onChange={e => setSelectedFile(e.target.files?.[0] || null)} required/><Plus size={32} className="text-slate-300 mb-2"/><span className="text-slate-500 text-sm">选择视频或文档</span></div>
              <div className="flex gap-4 mt-8"><button type="button" onClick={() => setShowUploadModal(false)} className="flex-1 py-4 border rounded-2xl font-bold text-slate-500 text-inherit">取消</button><button type="submit" className="flex-1 py-4 bg-primary text-white rounded-2xl font-bold hover:bg-primary-dark shadow-lg shadow-blue-100 transition-all text-inherit">确认上传</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

const TabButton = ({ active, onClick, label }: any) => (
  <button onClick={onClick} className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all ${active ? 'bg-white text-primary shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>{label}</button>
);

export default ResourceDetailPage;