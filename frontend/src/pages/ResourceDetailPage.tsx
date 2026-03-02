import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { 
  ChevronLeft, FileText, MessageSquare, Bot, BookOpen, 
  Zap, Play, Info, Download, Upload, Plus, File, Camera, Send, User
} from 'lucide-react';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface ChatMessage {
  role: 'user' | 'ai';
  text: string;
  image?: string;
}

const ResourceDetailPage: React.FC = () => {
  // ... (保持原有 hooks 不变)

  const askAI = async () => {
    if (!question && !pendingImage) return;
    setIsAsking(true);
    
    const newUserMsg: ChatMessage = { role: 'user', text: question || "分析这张截图内容", image: pendingImage || undefined };
    setChatHistory(prev => [...prev, newUserMsg]);
    
    // 初始化 AI 回复的消息对象
    const aiMessageId = Date.now();
    setChatHistory(prev => [...prev, { role: 'ai', text: '' }]);
    
    const currentQuestion = question;
    const currentImage = pendingImage;
    
    setQuestion('');
    setPendingImage(null);

    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/ai/ask', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          textbook_id: parseInt(id!),
          question: currentQuestion || "分析这张图片中的知识点",
          image_base64: currentImage
        })
      });

      if (!response.ok) throw new Error('网络响应异常');

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let fullText = '';

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          const chunk = decoder.decode(value);
          const lines = chunk.split('\n');
          
          for (const line of lines) {
            if (line.startsWith('data:')) {
              const data = line.replace('data:', '').trim();
              if (data === '[DONE]') continue;
              
              // 这里我们直接累加文本（简单处理 SSE 格式）
              // 正规做法是解析 JSON，但我们的后端 SSEvent 只发了文本块
              try {
                fullText += data;
                setChatHistory(prev => {
                  const last = [...prev];
                  last[last.length - 1] = { ...last[last.length - 1], text: fullText };
                  return last;
                });
              } catch (e) {}
            }
          }
        }
      }
    } catch (err: any) {
      setChatHistory(prev => {
        const last = [...prev];
        last[last.length - 1] = { ...last[last.length - 1], text: '抱歉，连接 AI 助手失败。' };
        return last;
      });
    } finally {
      setIsAsking(false);
    }
  };

  // ... (保持其它逻辑不变)

  // 更新渲染部分
  // 在渲染消息的地方修改：
  // {msg.role === 'ai' ? (
  //   <ReactMarkdown remarkPlugins={[remarkGfm]} className="prose prose-sm max-w-none prose-slate">
  //     {msg.text}
  //   </ReactMarkdown>
  // ) : msg.text}


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
                  <div className="whitespace-pre-wrap text-inherit">
                    {msg.role === 'ai' ? (
                      <ReactMarkdown 
                        remarkPlugins={[remarkGfm]} 
                        className="prose prose-sm max-w-none prose-slate prose-p:leading-relaxed prose-pre:bg-slate-800 prose-pre:text-slate-100"
                      >
                        {msg.text}
                      </ReactMarkdown>
                    ) : (
                      msg.text
                    )}
                  </div>
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