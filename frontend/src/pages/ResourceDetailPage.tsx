import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { 
  ChevronLeft, FileText, MessageSquare, Bot, BookOpen, 
  Zap, Play, Info, Download, Upload, Plus, File, Trash2 
} from 'lucide-react';

const ResourceDetailPage: React.FC = () => {
  const { type, id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'reader' | 'parsed' | 'videos' | 'files'>('reader');
  const [loading, setLoading] = useState(true);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadForm, setUploadForm] = useState({ title: '', description: '' });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const isTeacher = localStorage.getItem('role') === 'teacher';

  const fetchData = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`/api/textbook/content/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setData(res.data.data);
    } catch (err) {
      console.error('Failed to fetch content');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [id]);

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

  const pdfUrl = data?.metadata?.file_path ? `http://localhost:8080/${data.metadata.file_path}` : '';
  const videos = data?.resources?.filter((r: any) => r.type === 'video') || [];
  const files = data?.resources?.filter((r: any) => r.type === 'file') || [];

  return (
    <div className="h-screen flex flex-col bg-white">
      {/* Header */}
      <header className="h-16 border-b border-slate-200 flex items-center justify-between px-6 shrink-0 bg-white z-10">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/dashboard')} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-500"><ChevronLeft size={24} /></button>
          <div className="h-6 w-px bg-slate-200 mx-2" />
          <div className="flex items-center gap-2">
            <BookOpen className="text-primary" size={20} />
            <h1 className="font-bold text-slate-800">{data?.metadata?.title || '加载中...'}</h1>
          </div>
        </div>

        <nav className="flex bg-slate-100 p-1 rounded-xl">
          <TabButton active={activeTab === 'reader'} onClick={() => setActiveTab('reader')} label="教材阅读" />
          <TabButton active={activeTab === 'parsed'} onClick={() => setActiveTab('parsed')} label="AI 解析文稿" />
          <TabButton active={activeTab === 'videos'} onClick={() => setActiveTab('videos')} label={`教学视频 (${videos.length})`} />
          <TabButton active={activeTab === 'files'} onClick={() => setActiveTab('files')} label={`附属资料 (${files.length})`} />
        </nav>

        {isTeacher && (
          <button onClick={() => setShowUploadModal(true)} className="bg-primary hover:bg-primary-dark text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all">
            <Plus size={14}/> 上传附属资源
          </button>
        )}
      </header>

      {/* Main */}
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 overflow-hidden relative border-r border-slate-200 bg-slate-50">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-300 gap-4"><div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" /><p>加载中...</p></div>
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
                    <div key={v.id} className="bg-white rounded-3xl overflow-hidden border border-slate-200 shadow-sm">
                      <div className="aspect-video bg-black"><video src={`http://localhost:8080/${v.file_path}`} controls className="w-full h-full" /></div>
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
        <div className="w-[400px] flex flex-col bg-white">
          <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <div className="flex items-center gap-2"><div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center text-white"><Bot size={18} /></div><h2 className="font-bold text-slate-800 text-sm">AI 教学助理</h2></div>
            <Zap size={18} className="text-amber-400 fill-amber-400" />
          </div>
          <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-50/20">
            <div className="bg-primary/5 p-4 rounded-2xl border border-primary/10"><p className="text-xs text-slate-600 leading-relaxed">你好！我是你的 AI 助理。你可以针对教材内容或关联视频向我提问。</p></div>
          </div>
          <div className="p-6 border-t border-slate-100">
            <div className="relative"><textarea placeholder="针对本课程提问..." className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 pr-12 text-sm outline-none resize-none h-24" disabled/><button className="absolute right-3 bottom-3 p-2 bg-slate-100 text-white rounded-xl"><Bot size={20} /></button></div>
          </div>
        </div>
      </div>

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl w-full max-w-lg p-10 shadow-2xl animate-in zoom-in duration-200">
            <h3 className="text-2xl font-bold text-slate-800 mb-8">上传资源 (视频或文件)</h3>
            <form onSubmit={handleResourceUpload} className="space-y-6">
              <div className="space-y-2"><label className="text-sm font-bold text-slate-700">资源名称</label><input className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none" value={uploadForm.title} onChange={e => setUploadForm({...uploadForm, title: e.target.value})} required /></div>
              <div className="space-y-2"><label className="text-sm font-bold text-slate-700">简要描述</label><textarea className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none h-20" value={uploadForm.description} onChange={e => setUploadForm({...uploadForm, description: e.target.value})}/></div>
              <div className="border-2 border-dashed border-slate-200 rounded-2xl p-8 flex flex-col items-center justify-center bg-slate-50 relative">
                <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" onChange={e => setSelectedFile(e.target.files?.[0] || null)} required/>
                <Upload className="text-slate-300 mb-2" size={32}/><span className="text-slate-500 text-sm">{selectedFile ? selectedFile.name : '选择视频 (MP4) 或学习资料 (ZIP/PPT...)'}</span>
              </div>
              <div className="flex gap-4 mt-8">
                <button type="button" onClick={() => setShowUploadModal(false)} className="flex-1 py-3 border rounded-xl font-bold text-slate-500">取消</button>
                <button type="submit" className="flex-1 py-3 bg-primary text-white rounded-xl font-bold hover:bg-primary-dark">确认上传</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

const TabButton = ({ active, onClick, label }: any) => (
  <button onClick={onClick} className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${active ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>{label}</button>
);

const EmptyState = ({ icon, text }: any) => (
  <div className="flex flex-col items-center justify-center py-20 text-slate-300 italic">{icon}<p className="mt-4 font-medium">{text}</p></div>
);

export default ResourceDetailPage;