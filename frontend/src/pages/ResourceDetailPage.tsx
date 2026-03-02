import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { 
  ChevronLeft, FileText, MessageSquare, Bot, BookOpen, 
  Zap, Play, Info, Download, Upload, Plus, File, Camera, Send, User
} from 'lucide-react';

interface ChatMessage {
  role: 'user' | 'ai';
  text: string;
  image?: string;
}

const ResourceDetailPage: React.FC = () => {
  const { type, id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'reader' | 'parsed' | 'videos' | 'files'>('reader');
  const [loading, setLoading] = useState(true);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadForm, setUploadForm] = useState({ title: '', description: '' });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  
  // AI Agent States
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
    } catch (err) { console.error('Failed to fetch content'); } finally { setLoading(false); }
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

  // --- AI Agent Logic ---
  
  const takeScreenshot = (e: React.MouseEvent) => {
    // Find the video element in the same card
    const card = (e.currentTarget as HTMLElement).closest('.video-card');
    const video = card?.querySelector('video');
    
    if (video && canvasRef.current) {
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      try {
        ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);
        // 使用 jpeg 格式并设置质量为 0.5，显著减小 Base64 体积
        const base64 = canvas.toDataURL('image/jpeg', 0.5);
        setPendingImage(base64);
        setChatHistory(prev => [...prev, { role: 'ai', text: '已捕获视频画面，请描述您的问题：' }]);
      } catch (err) {
        console.error('Screenshot failed:', err);
        alert('由于浏览器安全限制（跨域），无法截取该视频画面。');
      }
    } else {
      console.log("Video element not found");
    }
  };

  const askAI = async () => {
    if (!question && !pendingImage) return;
    setIsAsking(true);
    
    const newUserMsg: ChatMessage = { role: 'user', text: question || "分析这张截图内容", image: pendingImage || undefined };
    setChatHistory(prev => [...prev, newUserMsg]);
    const currentQuestion = question;
    const currentImage = pendingImage;
    
    setQuestion('');
    setPendingImage(null);

    try {
      const token = localStorage.getItem('token');
      const res = await axios.post(`/api/ai/ask`, {
        textbook_id: parseInt(id!),
        question: currentQuestion || "分析这张图片中的知识点",
        image_base64: currentImage
      }, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 180000 // 增加前端超时时间到 3 分钟
      });
      
      setChatHistory(prev => [...prev, { role: 'ai', text: res.data.answer }]);
    } catch (err: any) {
      const errMsg = err.response?.data?.error || 'AI 助手暂时无法响应';
      setChatHistory(prev => [...prev, { role: 'ai', text: `抱歉，出现错误：${errMsg}` }]);
    } finally {
      setIsAsking(false);
    }
  };

  const pdfUrl = data?.metadata?.file_path ? `http://localhost:8080/${data.metadata.file_path}` : '';
  const videos = data?.resources?.filter((r: any) => r.type === 'video') || [];
  const files = data?.resources?.filter((r: any) => r.type === 'file') || [];

  return (
    <div className="h-screen flex flex-col bg-white">
      <header className="h-16 border-b border-slate-200 flex items-center justify-between px-6 shrink-0 bg-white z-10 shadow-sm">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/dashboard')} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-500"><ChevronLeft size={24} /></button>
          <div className="h-6 w-px bg-slate-200 mx-2" />
          <div className="flex items-center gap-2">
            <BookOpen className="text-primary" size={20} />
            <h1 className="font-bold text-slate-800 truncate max-w-[200px]">{data?.metadata?.title || '加载中...'}</h1>
          </div>
        </div>
        <nav className="flex bg-slate-100 p-1 rounded-xl">
          <TabButton active={activeTab === 'reader'} onClick={() => setActiveTab('reader')} label="教材阅读" />
          <TabButton active={activeTab === 'parsed'} onClick={() => setActiveTab('parsed')} label="AI 解析文稿" />
          <TabButton active={activeTab === 'videos'} onClick={() => setActiveTab('videos')} label={`教学视频 (${videos.length})`} />
          <TabButton active={activeTab === 'files'} onClick={() => setActiveTab('files')} label={`附属资料 (${files.length})`} />
        </nav>
        {isTeacher && (
          <button onClick={() => setShowUploadModal(true)} className="bg-primary hover:bg-primary-dark text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 shadow-sm transition-all">
            <Plus size={14}/> 上传资源
          </button>
        )}
      </header>

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 overflow-hidden relative border-r border-slate-200 bg-slate-50">
          <canvas ref={canvasRef} className="hidden" />
          {loading ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-300 gap-4"><div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" /><p>正在连接知识库...</p></div>
          ) : (
            <div className="h-full overflow-y-auto">
              {activeTab === 'reader' && (
                <div className="h-full w-full p-6"><iframe src={pdfUrl} className="w-full h-full rounded-xl shadow-2xl border border-slate-200 bg-white" title="PDF" /></div>
              )}
              {activeTab === 'parsed' && (
                <div className="p-12 max-w-4xl mx-auto">
                  {data?.content?.chapters?.map((chapter: any, idx: number) => (
                    <div key={idx} className="mb-10">
                      <h2 className="text-2xl font-black text-slate-800 mb-6 flex items-center gap-3"><span className="w-1.5 h-8 bg-primary rounded-full" />{chapter.title}</h2>
                      {chapter.sections?.map((section: any, sIdx: number) => (
                        <div key={sIdx} className="mb-8 bg-white p-8 rounded-3xl border border-slate-100 shadow-sm">
                          <h3 className="text-lg font-bold text-slate-700 mb-4">{section.title}</h3>
                          <div className="text-slate-600 leading-relaxed whitespace-pre-wrap text-sm">{section.content}</div>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
              {activeTab === 'videos' && (
                <div className="p-10 grid grid-cols-1 gap-8 max-w-5xl mx-auto">
                  {videos.length > 0 ? videos.map((v: any) => (
                    <div key={v.id} className="bg-white rounded-3xl overflow-hidden border border-slate-200 shadow-sm video-card">
                      <div className="aspect-video bg-black relative group">
                        <video crossOrigin="anonymous" src={`http://localhost:8080/${v.file_path}`} controls className="w-full h-full" />
                        <button 
                          onClick={takeScreenshot}
                          className="absolute right-4 bottom-16 bg-white hover:bg-primary hover:text-white text-primary p-3 rounded-full shadow-2xl opacity-0 group-hover:opacity-100 transition-all z-20 flex items-center gap-2 font-bold text-xs"
                        >
                          <Camera size={18} /> 截图提问
                        </button>
                      </div>
                      <div className="p-6">
                        <h3 className="text-xl font-bold text-slate-800 mb-2">{v.title}</h3>
                        <p className="text-slate-500 text-sm">{v.description || '暂无描述'}</p>
                      </div>
                    </div>
                  )) : <EmptyState icon={<Play size={48}/>} text="暂无视频课件" />}
                </div>
              )}
              {activeTab === 'files' && (
                <div className="p-10 max-w-4xl mx-auto space-y-4">
                  {files.length > 0 ? files.map((f: any) => (
                    <div key={f.id} className="bg-white p-6 rounded-2xl border border-slate-200 flex items-center justify-between hover:border-primary transition-colors group">
                      <div className="flex items-center gap-4">
                        <div className="p-3 bg-slate-50 rounded-xl text-slate-400 group-hover:bg-blue-50 group-hover:text-primary transition-colors"><File size={24}/></div>
                        <div><h4 className="font-bold text-slate-800">{f.title}</h4><p className="text-xs text-slate-400 uppercase font-bold">{f.ext} • {(f.size / 1024 / 1024).toFixed(2)} MB</p></div>
                      </div>
                      <a href={`http://localhost:8080/${f.file_path}`} download className="p-3 bg-slate-50 rounded-xl text-slate-400 hover:bg-primary hover:text-white transition-all"><Download size={20}/></a>
                    </div>
                  )) : <EmptyState icon={<File size={48}/>} text="暂无附属资料" />}
                </div>
              )}
            </div>
          )}
        </div>

        {/* AI Sidebar */}
        <div className="w-[450px] flex flex-col bg-white">
          <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-100"><Bot size={22} /></div>
              <div>
                <h2 className="font-bold text-slate-800">AI 教学助理</h2>
                <div className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"/><span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Multi-Modal Agent</span></div>
              </div>
            </div>
            <Zap size={18} className="text-amber-400 fill-amber-400" />
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50/20">
            {chatHistory.length === 0 && (
              <div className="bg-primary/5 p-5 rounded-2xl border border-primary/10">
                <p className="text-sm text-slate-600 leading-relaxed font-medium text-center">
                  👋 你好！我是你的 AI 学习助理。你可以针对教材提问，或者在播放视频时点击“截图提问”，我将为你深入分析。
                </p>
              </div>
            )}
            
            {chatHistory.map((msg, idx) => (
              <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[90%] rounded-3xl px-5 py-4 shadow-sm text-sm leading-relaxed ${msg.role === 'user' ? 'bg-primary text-white rounded-tr-none' : 'bg-white border border-slate-100 text-slate-700 rounded-tl-none'}`}>
                  {msg.image && <img src={msg.image} className="rounded-2xl mb-3 border border-white/20 w-full aspect-video object-cover" alt="screenshot" />}
                  <div className="whitespace-pre-wrap">{msg.text}</div>
                </div>
              </div>
            ))}
            {isAsking && (
              <div className="flex justify-start">
                <div className="bg-white border border-slate-100 rounded-3xl rounded-tl-none px-5 py-4 shadow-sm flex items-center gap-3 text-slate-400">
                  <div className="flex gap-1">
                    <div className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce" />
                    <div className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce [animation-delay:-0.15s]" />
                    <div className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce [animation-delay:-0.3s]" />
                  </div>
                  <span className="text-xs font-bold uppercase">AI 正在思考...</span>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          <div className="p-6 border-t border-slate-100 space-y-4 shadow-[0_-10px_20px_-15px_rgba(0,0,0,0.05)]">
            {pendingImage && (
              <div className="relative w-32 aspect-video group ml-2">
                <img src={pendingImage} className="w-full h-full rounded-xl border-2 border-primary shadow-xl object-cover" alt="pending" />
                <button onClick={() => setPendingImage(null)} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1.5 shadow-lg hover:scale-110 transition-all"><Plus className="rotate-45" size={14}/></button>
              </div>
            )}
            <div className="relative">
              <textarea 
                placeholder={pendingImage ? "请描述关于这张截图的问题..." : "针对本课程提问..."}
                className="w-full bg-slate-50 border border-slate-200 rounded-[1.5rem] p-5 pr-16 text-sm outline-none focus:ring-2 focus:ring-primary h-28 resize-none transition-all shadow-inner"
                value={question}
                onChange={e => setQuestion(e.target.value)}
                onKeyDown={e => { if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); askAI(); } }}
              />
              <button 
                onClick={askAI}
                disabled={isAsking || (!question && !pendingImage)}
                className="absolute right-3 bottom-3 p-3.5 bg-primary text-white rounded-2xl shadow-xl shadow-blue-200 disabled:bg-slate-200 disabled:shadow-none transition-all active:scale-90"
              >
                <Send size={22} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Upload Modal (Simplified) */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-[2.5rem] w-full max-w-lg p-10 shadow-2xl">
            <h3 className="text-2xl font-bold text-slate-800 mb-8">上传附属资源</h3>
            <form onSubmit={handleResourceUpload} className="space-y-6">
              <div className="space-y-2"><label className="text-sm font-bold text-slate-700 ml-1">资源名称</label><input className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-primary" value={uploadForm.title} onChange={e => setUploadForm({...uploadForm, title: e.target.value})} required /></div>
              <div className="space-y-2"><label className="text-sm font-bold text-slate-700 ml-1">简要描述</label><textarea className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl outline-none h-24 resize-none" value={uploadForm.description} onChange={e => setUploadForm({...uploadForm, description: e.target.value})}/></div>
              <div className="border-2 border-dashed border-slate-200 rounded-[2rem] p-10 flex flex-col items-center justify-center bg-slate-50 relative hover:border-primary transition-colors cursor-pointer">
                <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" onChange={e => setSelectedFile(e.target.files?.[0] || null)} required/>
                <div className="bg-white p-4 rounded-2xl shadow-sm mb-3 text-slate-300 group-hover:text-primary transition-colors"><Upload size={32}/></div>
                <span className="text-slate-500 text-sm font-medium">{selectedFile ? selectedFile.name : '拖拽或选择视频 / 文档'}</span>
              </div>
              <div className="flex gap-4 mt-8">
                <button type="button" onClick={() => setShowUploadModal(false)} className="flex-1 py-4 border border-slate-200 rounded-2xl font-bold text-slate-500 hover:bg-slate-50 transition-all">取消</button>
                <button type="submit" className="flex-1 py-4 bg-primary text-white rounded-2xl font-bold hover:bg-primary-dark shadow-lg shadow-blue-100 transition-all">确认上传</button>
              </div>
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

const EmptyState = ({ icon, text }: any) => (
  <div className="flex flex-col items-center justify-center py-32 text-slate-200 italic">{icon}<p className="mt-4 font-bold uppercase tracking-widest text-xs">{text}</p></div>
);

export default ResourceDetailPage;