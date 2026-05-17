import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  ArrowLeft,
  BookOpen,
  Bot,
  Check,
  Copy,
  Download,
  FileText,
  Link2,
  Loader2,
  Network,
  PlayCircle,
  Plus,
  Send,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';

interface ChatMessage {
  role: 'user' | 'ai';
  text: string;
}

const KnowledgePointDetailPage: React.FC = () => {
  const { id, knowledgePointId } = useParams();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadForm, setUploadForm] = useState({ title: '', description: '' });
  const [showAgent, setShowAgent] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [question, setQuestion] = useState('');
  const [isAsking, setIsAsking] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const isTeacher = localStorage.getItem('role') === 'teacher';

  const fetchHistory = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`/api/ai/history/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setChatHistory(
        (res.data.data || []).map((message: any) => ({
          role: message.role === 'assistant' ? 'ai' : 'user',
          text: message.content,
        }))
      );
    } catch (err) {
      console.error('history fetch failed', err);
    }
  };

  const fetchDetail = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const [detailRes, historyRes] = await Promise.all([
        axios.get(`/api/textbook/content/${id}/knowledge/${knowledgePointId}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        axios.get(`/api/ai/history/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      setDetail(detailRes.data.data);
      setChatHistory(
        (historyRes.data.data || []).map((message: any) => ({
          role: message.role === 'assistant' ? 'ai' : 'user',
          text: message.content,
        }))
      );
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 403) {
        alert('权限不足');
        navigate('/dashboard');
        return;
      }
      alert('知识点详情加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDetail();
  }, [id, knowledgePointId]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, showAgent]);

  const handleUpload = async (e: React.FormEvent) => {
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
      await axios.post(`/api/textbook/content/${id}/knowledge/${knowledgePointId}/resource`, formData, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' },
      });
      setShowUploadModal(false);
      setSelectedFile(null);
      setUploadForm({ title: '', description: '' });
      fetchDetail();
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
      fetchDetail();
    } catch (err) {
      alert('删除失败');
    }
  };

  const jumpToKnowledgePoint = (targetId: number) => {
    navigate(`/resource/textbook/${id}/knowledge/${targetId}`);
  };

  const askKnowledgePointAgent = async () => {
    if (!question.trim()) {
      return;
    }

    const prompt = question.trim();
    setIsAsking(true);
    setChatHistory((prev) => [...prev, { role: 'user', text: prompt }, { role: 'ai', text: '' }]);
    setQuestion('');

    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/ai/ask', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          textbook_id: Number(id),
          knowledge_point_id: Number(knowledgePointId),
          question: prompt,
        }),
      });

      if (!response.ok) {
        throw new Error('AI 服务异常');
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullText = '';

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
            if (!line.startsWith('data:')) {
              continue;
            }
            let content = line.slice(5);
            if (content.trim() === '[DONE]') {
              continue;
            }
            if (content.startsWith(' ')) {
              content = content.slice(1);
            }
            fullText += content;
            if (content.length === 0) {
              fullText += '\n';
            }
            updated = true;
          }

          if (updated) {
            setChatHistory((prev) => {
              const next = [...prev];
              next[next.length - 1] = { role: 'ai', text: fullText };
              return next;
            });
          }
        }
      }

      fetchHistory();
    } catch (err) {
      setChatHistory((prev) => {
        const next = [...prev];
        next[next.length - 1] = { role: 'ai', text: '抱歉，知识点学习助手暂时不可用。' };
        return next;
      });
    } finally {
      setIsAsking(false);
    }
  };

  const videos = detail?.resources?.filter((resource: any) => resource.type === 'video') || [];
  const files = detail?.resources?.filter((resource: any) => resource.type === 'file') || [];
  const assetUrl = (filePath?: string) => (filePath ? `/${filePath.replace(/^\/+/, '')}` : '');

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex items-center gap-3 text-slate-500 font-semibold">
          <Loader2 className="animate-spin text-primary" size={22} />
          正在加载知识点详情...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(186,230,253,0.5),_transparent_35%),linear-gradient(180deg,_#f8fbff_0%,_#f8fafc_100%)] text-slate-900">
      <header className="sticky top-0 z-20 border-b border-white/70 backdrop-blur bg-white/80">
        <div className="max-w-7xl mx-auto px-6 py-5 flex items-center justify-between gap-6">
          <div className="flex items-center gap-4 min-w-0">
            <button
              onClick={() => navigate(`/resource/textbook/${id}`)}
              className="w-11 h-11 rounded-2xl border border-slate-200 bg-white text-slate-600 hover:text-primary hover:border-sky-200 transition-all flex items-center justify-center shrink-0"
            >
              <ArrowLeft size={20} />
            </button>
            <div className="min-w-0">
              <div className="text-xs uppercase tracking-[0.28em] font-black text-sky-600 mb-1">Knowledge Point</div>
              <h1 className="text-2xl font-black text-slate-900 truncate">{detail?.name}</h1>
              <p className="text-sm text-slate-500 truncate flex items-center gap-2 mt-1">
                <BookOpen size={15} />
                {detail?.textbook_title}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowAgent(true)}
              className="px-4 py-2.5 rounded-2xl border border-sky-200 text-primary bg-sky-50 hover:bg-sky-100 transition-all font-semibold flex items-center gap-2"
            >
              <Bot size={16} />
              知识点学习助手
            </button>
            <button
              onClick={() => navigate(`/resource/textbook/${id}`)}
              className="px-4 py-2.5 rounded-2xl border border-slate-200 bg-white text-slate-600 hover:text-primary hover:border-sky-200 transition-all font-semibold"
            >
              返回教材详情
            </button>
            {isTeacher && (
              <button
                onClick={() => setShowUploadModal(true)}
                className="px-4 py-2.5 rounded-2xl bg-primary text-white font-semibold shadow-lg shadow-blue-100 hover:bg-primary-dark transition-all flex items-center gap-2"
              >
                <Plus size={16} />
                上传知识点资源
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-10">
        <section className="grid grid-cols-1 xl:grid-cols-[1.5fr_0.9fr] gap-8">
          <div className="space-y-8">
            <div className="bg-white/90 backdrop-blur rounded-[2rem] border border-white shadow-[0_18px_50px_rgba(15,23,42,0.06)] p-8">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-11 h-11 rounded-2xl bg-sky-100 text-sky-700 flex items-center justify-center">
                  <Sparkles size={20} />
                </div>
                <div>
                  <h2 className="text-xl font-black text-slate-900">知识点总结</h2>
                  <p className="text-sm text-slate-500">这里展示预生成的知识点学习摘要，学生和教师都可查看。</p>
                </div>
              </div>
              <div className="rounded-[1.5rem] bg-slate-50 border border-slate-100 p-6 text-[15px] leading-8 text-slate-700 whitespace-pre-wrap">
                {detail?.summary || '暂无知识点总结内容'}
              </div>
            </div>

            <div className="bg-white/90 backdrop-blur rounded-[2rem] border border-white shadow-[0_18px_50px_rgba(15,23,42,0.06)] p-8">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-11 h-11 rounded-2xl bg-violet-100 text-violet-700 flex items-center justify-center">
                  <FileText size={20} />
                </div>
                <div>
                  <h2 className="text-xl font-black text-slate-900">来源片段</h2>
                  <p className="text-sm text-slate-500">帮助学生快速理解这个知识点在教材中的上下文。</p>
                </div>
              </div>
              <div className="space-y-4">
                {detail?.source_snippets?.length ? (
                  detail.source_snippets.map((snippet: string, index: number) => (
                    <div key={index} className="rounded-[1.5rem] border border-slate-100 bg-slate-50 p-5 text-sm leading-7 text-slate-600">
                      {snippet}
                    </div>
                  ))
                ) : (
                  <div className="rounded-[1.5rem] border border-dashed border-slate-200 bg-slate-50/80 p-6 text-sm text-slate-400">暂无来源片段。</div>
                )}
              </div>
            </div>

            <div className="bg-white/90 backdrop-blur rounded-[2rem] border border-white shadow-[0_18px_50px_rgba(15,23,42,0.06)] p-8">
              <div className="flex items-center justify-between gap-4 mb-5">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
                    <Upload size={20} />
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-slate-900">知识点专属资源</h2>
                    <p className="text-sm text-slate-500">教师可上传针对该知识点的视频和资料，学生可直接查看。</p>
                  </div>
                </div>
                {isTeacher && (
                  <button
                    onClick={() => setShowUploadModal(true)}
                    className="px-4 py-2.5 rounded-2xl border border-sky-200 text-primary bg-sky-50 hover:bg-sky-100 transition-all font-semibold flex items-center gap-2"
                  >
                    <Plus size={16} />
                    新增资源
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <div className="rounded-[1.75rem] border border-slate-100 bg-slate-50/70 p-5">
                  <div className="flex items-center gap-2 font-black text-slate-800 mb-4">
                    <PlayCircle size={18} className="text-primary" />
                    讲解视频
                  </div>
                  <div className="space-y-4">
                    {videos.length ? (
                      videos.map((video: any) => (
                        <div key={video.id} className="rounded-[1.25rem] overflow-hidden border border-slate-200 bg-white shadow-sm">
                          <video src={assetUrl(video.file_path)} controls className="w-full aspect-video bg-black" />
                          <div className="p-4">
                            <div className="flex items-start justify-between gap-4">
                              <div>
                                <h3 className="font-bold text-slate-800">{video.title}</h3>
                                <p className="text-sm text-slate-500 mt-1">{video.description || '暂无描述'}</p>
                              </div>
                              {isTeacher && (
                                <button
                                  onClick={() => deleteResource(video.id, video.title)}
                                  className="p-2 rounded-xl text-slate-300 hover:text-red-500 hover:bg-red-50 transition-all"
                                >
                                  <Trash2 size={18} />
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <EmptyResource text="当前知识点还没有专属视频。" />
                    )}
                  </div>
                </div>

                <div className="rounded-[1.75rem] border border-slate-100 bg-slate-50/70 p-5">
                  <div className="flex items-center gap-2 font-black text-slate-800 mb-4">
                    <Download size={18} className="text-primary" />
                    补充资料
                  </div>
                  <div className="space-y-3">
                    {files.length ? (
                      files.map((file: any) => (
                        <div key={file.id} className="rounded-[1.25rem] border border-slate-200 bg-white p-4 shadow-sm flex items-center justify-between gap-4">
                          <div className="min-w-0">
                            <h3 className="font-bold text-slate-800 truncate">{file.title}</h3>
                            <p className="text-sm text-slate-500 mt-1 truncate">{file.description || '暂无描述'}</p>
                            <p className="text-xs font-bold text-slate-300 uppercase mt-2">
                              {file.ext} • {(file.size / 1024 / 1024).toFixed(2)} MB
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <a
                              href={assetUrl(file.file_path)}
                              download
                              className="p-3 rounded-xl bg-slate-50 text-slate-500 hover:bg-primary hover:text-white transition-all"
                            >
                              <Download size={18} />
                            </a>
                            {isTeacher && (
                              <button
                                onClick={() => deleteResource(file.id, file.title)}
                                className="p-3 rounded-xl bg-slate-50 text-slate-400 hover:bg-red-500 hover:text-white transition-all"
                              >
                                <Trash2 size={18} />
                              </button>
                            )}
                          </div>
                        </div>
                      ))
                    ) : (
                      <EmptyResource text="当前知识点还没有专属资料。" />
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <aside className="space-y-8">
            <RelationCard
              icon={<Link2 size={18} />}
              title="前置知识点"
              description="建议先掌握这些内容，再回到当前知识点。"
              items={detail?.prerequisites || []}
              onJump={jumpToKnowledgePoint}
              emptyText="当前没有记录前置知识点。"
            />
            <RelationCard
              icon={<Network size={18} />}
              title="后续延伸知识点"
              description="掌握当前内容后，可以继续学习这些相关知识点。"
              items={detail?.successors || []}
              onJump={jumpToKnowledgePoint}
              emptyText="当前没有记录后续知识点。"
            />
          </aside>
        </section>
      </main>

      {showAgent && (
        <div className="fixed inset-0 z-50 bg-slate-900/30 backdrop-blur-sm">
          <div className="absolute inset-y-0 right-0 w-full max-w-[460px] bg-white border-l border-slate-200 shadow-2xl flex flex-col">
            <div className="p-6 border-b border-slate-100 flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-primary font-bold">
                  <Bot size={18} />
                  知识点学习助手
                </div>
                <p className="text-sm text-slate-500 mt-2 leading-6">
                  当前对话会带上“{detail?.name}”的总结、来源片段和前后知识点作为上下文。
                </p>
              </div>
              <button onClick={() => setShowAgent(false)} className="w-10 h-10 rounded-2xl border border-slate-200 text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50/60">
              {chatHistory.length === 0 && (
                <div className="rounded-[1.5rem] border border-sky-100 bg-sky-50/80 p-5 text-sm text-slate-600 leading-7">
                  你可以问我这个知识点的定义、易错点、应用场景，或者让助手帮你规划下一步学习。
                </div>
              )}
              {chatHistory.map((message, index) => (
                <div key={index} className={`flex flex-col ${message.role === 'user' ? 'items-end' : 'items-start'} group`}>
                  <div
                    className={`max-w-[92%] rounded-[1.5rem] px-4 py-3 text-sm leading-7 shadow-sm ${
                      message.role === 'user' ? 'bg-primary text-white rounded-tr-sm' : 'bg-white border border-slate-100 text-slate-800 rounded-tl-sm'
                    }`}
                  >
                    {message.role === 'ai' ? (
                      <div className="markdown-body text-slate-800">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.text || '正在思考...'}</ReactMarkdown>
                      </div>
                    ) : (
                      <div className="whitespace-pre-wrap">{message.text}</div>
                    )}
                  </div>
                  {message.role === 'ai' && (
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(message.text);
                        setCopiedIdx(index);
                        setTimeout(() => setCopiedIdx(null), 2000);
                      }}
                      className="mt-2 text-[10px] uppercase font-bold tracking-wider text-slate-400 hover:text-primary transition-colors"
                    >
                      {copiedIdx === index ? (
                        <span className="inline-flex items-center gap-1">
                          <Check size={12} />
                          已复制
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1">
                          <Copy size={12} />
                          复制回答
                        </span>
                      )}
                    </button>
                  )}
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>

            <div className="p-5 border-t border-slate-100 bg-white">
              <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 px-4 py-3 mb-4 text-xs text-slate-500 leading-6">
                当前复用的是本教材的聊天历史，但回答会额外聚焦在知识点“{detail?.name}”上。
              </div>
              <div className="relative">
                <textarea
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="继续追问这个知识点..."
                  className="w-full h-28 rounded-[1.75rem] bg-slate-50 border border-slate-200 pl-5 pr-16 py-4 text-sm text-slate-700 outline-none resize-none focus:ring-2 focus:ring-primary"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      askKnowledgePointAgent();
                    }
                  }}
                />
                <button
                  onClick={askKnowledgePointAgent}
                  disabled={isAsking || !question.trim()}
                  className="absolute right-3 bottom-3 w-12 h-12 rounded-2xl bg-primary text-white disabled:bg-slate-200 flex items-center justify-center shadow-lg transition-all"
                >
                  {isAsking ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showUploadModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-[2.5rem] w-full max-w-lg p-10 shadow-2xl">
            <h3 className="text-2xl font-bold text-slate-800 mb-8">上传知识点专属资源</h3>
            <form onSubmit={handleUpload} className="space-y-6">
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
                <button type="button" onClick={() => setShowUploadModal(false)} className="flex-1 py-4 border border-slate-200 rounded-2xl font-bold text-slate-500">
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

const RelationCard = ({ icon, title, description, items, onJump, emptyText }: any) => (
  <div className="bg-white/90 backdrop-blur rounded-[2rem] border border-white shadow-[0_18px_50px_rgba(15,23,42,0.06)] p-6">
    <div className="flex items-center gap-3 mb-3">
      <div className="w-10 h-10 rounded-2xl bg-sky-100 text-sky-700 flex items-center justify-center">{icon}</div>
      <div>
        <h2 className="text-lg font-black text-slate-900">{title}</h2>
        <p className="text-sm text-slate-500">{description}</p>
      </div>
    </div>
    <div className="space-y-3 mt-5">
      {items.length ? (
        items.map((item: any) => (
          <button
            key={item.id}
            onClick={() => onJump(item.id)}
            className="w-full text-left rounded-[1.4rem] border border-slate-100 bg-slate-50 hover:bg-sky-50 hover:border-sky-200 transition-all p-4"
          >
            <div className="font-bold text-slate-800">{item.name}</div>
            <div className="text-sm text-slate-500 mt-2 line-clamp-3">{item.summary || '暂无摘要'}</div>
          </button>
        ))
      ) : (
        <div className="rounded-[1.4rem] border border-dashed border-slate-200 bg-slate-50/80 p-5 text-sm text-slate-400">{emptyText}</div>
      )}
    </div>
  </div>
);

const EmptyResource = ({ text }: { text: string }) => (
  <div className="rounded-[1.25rem] border border-dashed border-slate-200 bg-white/70 p-5 text-sm text-slate-400">{text}</div>
);

export default KnowledgePointDetailPage;
