import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { 
  FileText, 
  LogOut, 
  Plus, 
  CheckCircle, 
  Clock,
  MoreVertical,
  Book
} from 'lucide-react';

interface Textbook {
  id: number;
  title: string;
  author: string;
  status: string;
  created_at: string;
  isbn?: string;
}

const TeacherDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [textbooks, setTextbooks] = useState<Textbook[]>([]);
  const [showUpload, setShowUpload] = useState(false);
  const [uploadForm, setUploadForm] = useState({ title: '', author: '', isbn: '' });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const fetchData = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get('/api/textbook/list', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setTextbooks(res.data.data || []);
    } catch (err) {
      console.error('Fetch error:', err);
    }
  };

  useEffect(() => {
    fetchData();
    const timer = setInterval(fetchData, 5000);
    return () => clearInterval(timer);
  }, []);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) return alert('请选择教材 PDF');

    const formData = new FormData();
    formData.append('title', uploadForm.title);
    formData.append('author', uploadForm.author);
    formData.append('isbn', uploadForm.isbn);
    formData.append('file', selectedFile);

    try {
      const token = localStorage.getItem('token');
      await axios.post('/api/textbook/upload', formData, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' }
      });
      setShowUpload(false);
      setUploadForm({ title: '', author: '', isbn: '' });
      setSelectedFile(null);
      fetchData();
    } catch (err) {
      alert('上传失败');
    }
  };

  return (
    <div className="flex h-screen bg-slate-50">
      {/* 侧边栏 */}
      <div className="w-72 bg-white border-r border-slate-200 flex flex-col">
        <div className="p-8 flex items-center gap-3">
          <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center text-white font-bold text-xl shadow-lg shadow-blue-100">A</div>
          <h1 className="text-xl font-bold text-slate-800 tracking-tight">AI Teaching</h1>
        </div>
        
        <nav className="flex-1 px-4 space-y-1">
          <button className="w-full flex items-center gap-4 px-5 py-4 rounded-2xl font-bold transition-all bg-blue-50 text-primary">
            <Book size={20}/>
            <span>教材管理</span>
          </button>
        </nav>

        <div className="p-4 border-t border-slate-100">
          <button 
            onClick={() => { localStorage.clear(); window.location.href='/login'; }}
            className="w-full flex items-center gap-3 px-4 py-3 text-slate-500 hover:bg-red-50 hover:text-red-600 rounded-xl transition-all"
          >
            <LogOut size={20}/>
            <span className="font-semibold">退出登录</span>
          </button>
        </div>
      </div>

      {/* 主内容区 */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-20 bg-white border-b border-slate-200 flex items-center justify-between px-10 shrink-0">
          <h2 className="text-xl font-bold text-slate-800">课程教材库</h2>
          <button 
            onClick={() => setShowUpload(true)}
            className="bg-primary hover:bg-primary-dark text-white px-6 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-all shadow-md"
          >
            <Plus size={20}/>
            创建新教材
          </button>
        </header>

        <main className="flex-1 overflow-y-auto p-10">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <table className="w-full text-left">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-8 py-5 text-sm font-bold text-slate-500 uppercase">教材名称</th>
                  <th className="px-8 py-5 text-sm font-bold text-slate-500 uppercase">作者 / ISBN</th>
                  <th className="px-8 py-5 text-sm font-bold text-slate-500 uppercase">状态</th>
                  <th className="px-8 py-5 text-sm font-bold text-slate-500 uppercase text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {textbooks.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-8 py-6">
                      <div className="flex items-center gap-4">
                        <div className="p-3 bg-blue-50 rounded-xl text-primary"><FileText size={20}/></div>
                        <span className="font-bold text-slate-700">{item.title}</span>
                      </div>
                    </td>
                    <td className="px-8 py-6">
                      <div className="text-slate-600 font-medium">{item.author || '未知作者'}</div>
                      <div className="text-xs text-slate-400 mt-1">ISBN: {item.isbn || '--'}</div>
                    </td>
                    <td className="px-8 py-6">
                      {item.status === 'processed' ? (
                        <span className="flex items-center gap-1.5 text-green-600 font-bold bg-green-50 px-3 py-1.5 rounded-lg text-xs">
                          <CheckCircle size={14}/> 已解析
                        </span>
                      ) : (
                        <span className="flex items-center gap-1.5 text-amber-600 font-bold bg-amber-50 px-3 py-1.5 rounded-lg text-xs animate-pulse">
                          <Clock size={14}/> 解析中
                        </span>
                      )}
                    </td>
                    <td className="px-8 py-6 text-right">
                      <button 
                        onClick={() => navigate(`/resource/textbook/${item.id}`)}
                        className="bg-slate-50 hover:bg-primary hover:text-white text-slate-600 px-4 py-2 rounded-xl text-sm font-bold transition-all border border-slate-100"
                      >
                        进入管理详情
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {textbooks.length === 0 && (
              <div className="p-20 text-center flex flex-col items-center">
                <div className="bg-slate-50 p-6 rounded-full mb-4"><FileText className="text-slate-200" size={48}/></div>
                <p className="text-slate-400 font-medium">点击右上角按钮开始上传您的第一本教材</p>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Upload Modal */}
      {showUpload && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl w-full max-w-lg p-10 shadow-2xl animate-in zoom-in duration-200">
            <h3 className="text-2xl font-bold text-slate-800 mb-8">上传教材 (PDF)</h3>
            <form onSubmit={handleUpload} className="space-y-6">
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700">教材标题</label>
                <input 
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-primary transition-all"
                  value={uploadForm.title}
                  onChange={e => setUploadForm({...uploadForm, title: e.target.value})}
                  required 
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700">作者</label>
                  <input className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none" value={uploadForm.author} onChange={e => setUploadForm({...uploadForm, author: e.target.value})}/>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700">ISBN</label>
                  <input className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none" value={uploadForm.isbn} onChange={e => setUploadForm({...uploadForm, isbn: e.target.value})}/>
                </div>
              </div>
              <div className="border-2 border-dashed border-slate-200 rounded-2xl p-8 flex flex-col items-center justify-center bg-slate-50 relative hover:bg-slate-100 transition-colors">
                <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" accept=".pdf" onChange={e => setSelectedFile(e.target.files?.[0] || null)} required/>
                <Plus className="text-slate-300 mb-2" size={32}/><span className="text-slate-500 text-sm font-medium">{selectedFile ? selectedFile.name : '选择 PDF 教材文件'}</span>
              </div>
              <div className="flex gap-4 mt-8">
                <button type="button" onClick={() => setShowUpload(false)} className="flex-1 py-3.5 border border-slate-200 rounded-xl font-bold text-slate-500 hover:bg-slate-50">取消</button>
                <button type="submit" className="flex-1 py-3.5 bg-primary text-white rounded-xl font-bold hover:bg-primary-dark shadow-lg shadow-blue-100">确认创建</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default TeacherDashboard;