import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { 
  FileText, LogOut, Plus, CheckCircle, Clock, Book, Trash2, Shield, Users, Globe, Lock, X
} from 'lucide-react';

interface Textbook {
  id: number;
  title: string;
  author: string;
  status: string;
  visibility: number;
  allowed_student_ids: string;
  created_at: string;
  isbn?: string;
}

const TeacherDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [textbooks, setTextbooks] = useState<Textbook[]>([]);
  const [showUpload, setShowUpload] = useState(false);
  const [showACL, setShowACL] = useState<Textbook | null>(null);
  const [uploadForm, setUploadForm] = useState({ title: '', author: '', isbn: '' });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [aclForm, setACLForm] = useState({ visibility: 0, studentIds: '' });

  const fetchData = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get('/api/textbook/list', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setTextbooks(res.data.data || []);
    } catch (err) { console.error('Fetch error:', err); }
  };

  useEffect(() => {
    fetchData();
    const timer = setInterval(fetchData, 10000);
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
    } catch (err) { alert('上传失败'); }
  };

  const handleDelete = async (id: number, title: string) => {
    if (!window.confirm(`确定要永久删除教材《${title}》及其所有关联资源吗？`)) return;
    try {
      const token = localStorage.getItem('token');
      await axios.delete(`/api/textbook/content/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchData();
    } catch (err) { alert('删除失败'); }
  };

  const openACLModal = (item: Textbook) => {
    setShowACL(item);
    setACLForm({
      visibility: item.visibility,
      studentIds: item.allowed_student_ids || ''
    });
  };

  const handleUpdateACL = async () => {
    if (!showACL) return;
    try {
      const token = localStorage.getItem('token');
      await axios.post(`/api/textbook/content/${showACL.id}/acl`, {
        visibility: aclForm.visibility,
        allowed_student_ids: aclForm.studentIds.split(',').map(s => s.trim()).filter(s => s)
      }, { headers: { Authorization: `Bearer ${token}` } });
      setShowACL(null);
      fetchData();
    } catch (err) { alert('更新权限失败'); }
  };

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900">
      <div className="w-72 bg-white border-r border-slate-200 flex flex-col">
        <div className="p-8 flex items-center gap-3">
          <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center text-white font-bold text-xl shadow-lg">A</div>
          <h1 className="text-xl font-bold text-slate-800 tracking-tight">AI Teaching</h1>
        </div>
        <nav className="flex-1 px-4 space-y-1">
          <button className="w-full flex items-center gap-4 px-5 py-4 rounded-2xl font-bold transition-all bg-blue-50 text-primary"><Book size={20}/><span>教材管理</span></button>
        </nav>
        <div className="p-4 border-t border-slate-100">
          <button onClick={() => { localStorage.clear(); window.location.href='/login'; }} className="w-full flex items-center gap-3 px-4 py-3 text-slate-500 hover:bg-red-50 hover:text-red-600 rounded-xl transition-all"><LogOut size={20}/><span className="font-semibold text-inherit">退出登录</span></button>
        </div>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-20 bg-white border-b border-slate-200 flex items-center justify-between px-10 shrink-0">
          <h2 className="text-xl font-bold text-slate-800">课程教材库</h2>
          <button onClick={() => setShowUpload(true)} className="bg-primary hover:bg-primary-dark text-white px-6 py-2.5 rounded-xl font-bold flex items-center gap-2 shadow-md"><Plus size={20}/>创建新教材</button>
        </header>

        <main className="flex-1 overflow-y-auto p-10">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <table className="w-full text-left">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-8 py-5 text-sm font-bold text-slate-500 uppercase">教材名称</th>
                  <th className="px-8 py-5 text-sm font-bold text-slate-500 uppercase">可见性</th>
                  <th className="px-8 py-5 text-sm font-bold text-slate-500 uppercase">状态</th>
                  <th className="px-8 py-5 text-sm font-bold text-slate-500 uppercase text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {textbooks.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50 transition-colors group">
                    <td className="px-8 py-6">
                      <div className="flex items-center gap-4"><div className="p-3 bg-blue-50 rounded-xl text-primary"><FileText size={20}/></div><div><span className="font-bold text-slate-700 block">{item.title}</span><span className="text-xs text-slate-400 mt-1">{item.author || '未知作者'}</span></div></div>
                    </td>
                    <td className="px-8 py-6">
                      {item.visibility === 0 ? (
                        <span className="flex items-center gap-1.5 text-blue-600 font-bold bg-blue-50 px-3 py-1.5 rounded-lg text-xs w-fit"><Globe size={14}/> 全员公开</span>
                      ) : (
                        <span className="flex items-center gap-1.5 text-slate-600 font-bold bg-slate-100 px-3 py-1.5 rounded-lg text-xs w-fit"><Lock size={14}/> 指定学生</span>
                      )}
                    </td>
                    <td className="px-8 py-6">
                      {item.status === 'processed' ? (
                        <span className="flex items-center gap-1.5 text-green-600 font-bold bg-green-50 px-3 py-1.5 rounded-lg text-xs w-fit"><CheckCircle size={14}/> 已解析</span>
                      ) : (
                        <span className="flex items-center gap-1.5 text-amber-600 font-bold bg-amber-50 px-3 py-1.5 rounded-lg text-xs animate-pulse w-fit"><Clock size={14}/> 解析中</span>
                      )}
                    </td>
                    <td className="px-8 py-6 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => navigate(`/resource/textbook/${item.id}`)} className="bg-slate-50 hover:bg-primary hover:text-white text-slate-600 px-4 py-2 rounded-xl text-sm font-bold transition-all border border-slate-100">进入管理</button>
                        <button onClick={() => openACLModal(item)} className="p-2 text-slate-300 hover:text-primary hover:bg-blue-50 rounded-xl transition-all" title="权限设置"><Shield size={18}/></button>
                        <button onClick={() => handleDelete(item.id, item.title)} className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"><Trash2 size={18}/></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </main>
      </div>

      {/* ACL Modal */}
      {showACL && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-[2.5rem] w-full max-w-lg p-10 shadow-2xl animate-in zoom-in-95 duration-200 relative">
            <button onClick={() => setShowACL(null)} className="absolute top-8 right-8 text-slate-400 hover:text-slate-600"><X size={24}/></button>
            <h3 className="text-2xl font-bold text-slate-800 mb-2">访问权限设置</h3>
            <p className="text-slate-400 text-sm mb-8">管理教材《{showACL.title}》的可见范围</p>
            
            <div className="space-y-8">
              <div className="flex p-1.5 bg-slate-100 rounded-2xl">
                <button 
                  onClick={() => setACLForm({...aclForm, visibility: 0})}
                  className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold transition-all ${aclForm.visibility === 0 ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  <Globe size={18}/> 全员公开
                </button>
                <button 
                  onClick={() => setACLForm({...aclForm, visibility: 1})}
                  className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold transition-all ${aclForm.visibility === 1 ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  <Lock size={18}/> 指定学生
                </button>
              </div>

              {aclForm.visibility === 1 && (
                <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
                  <div className="flex items-center justify-between px-1">
                    <label className="text-sm font-bold text-slate-700 flex items-center gap-2"><Users size={16}/> 授权学生 ID 列表</label>
                    <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">逗号分隔</span>
                  </div>
                  <textarea 
                    placeholder="输入学生 ID，例如: 1, 5, 12"
                    className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-primary h-32 resize-none text-slate-900 font-medium"
                    value={aclForm.studentIds}
                    onChange={e => setACLForm({...aclForm, studentIds: e.target.value})}
                  />
                </div>
              )}

              <div className="flex gap-4 pt-4">
                <button onClick={() => setShowACL(null)} className="flex-1 py-4 border border-slate-200 rounded-2xl font-bold text-slate-500">取消</button>
                <button onClick={handleUpdateACL} className="flex-1 py-4 bg-primary text-white rounded-2xl font-bold hover:bg-primary-dark shadow-lg shadow-blue-100 transition-all">保存设置</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Upload Modal (保持基本不变，但增加样式统一) */}
      {showUpload && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-[2.5rem] w-full max-w-lg p-10 shadow-2xl animate-in zoom-in-95 duration-200">
            <h3 className="text-2xl font-bold text-slate-800 mb-8">上传教材 (PDF)</h3>
            <form onSubmit={handleUpload} className="space-y-6">
              <div className="space-y-2"><label className="text-sm font-bold text-slate-700 ml-1">教材标题</label><input className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-primary text-slate-900" value={uploadForm.title} onChange={e => setUploadForm({...uploadForm, title: e.target.value})} required /></div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><label className="text-sm font-bold text-slate-700 ml-1">作者</label><input className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl outline-none text-slate-900" value={uploadForm.author} onChange={e => setUploadForm({...uploadForm, author: e.target.value})}/></div>
                <div className="space-y-2"><label className="text-sm font-bold text-slate-700 ml-1">ISBN</label><input className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl outline-none text-slate-900" value={uploadForm.isbn} onChange={e => setUploadForm({...uploadForm, isbn: e.target.value})}/></div>
              </div>
              <div className="border-2 border-dashed border-slate-200 rounded-3xl p-10 flex flex-col items-center justify-center bg-slate-50 relative hover:border-primary transition-colors cursor-pointer"><input type="file" className="absolute inset-0 opacity-0 cursor-pointer" accept=".pdf" onChange={e => setSelectedFile(e.target.files?.[0] || null)} required/><Plus size={32} className="text-slate-300 mb-2"/><span className="text-slate-500 text-sm font-medium">{selectedFile ? selectedFile.name : '选择 PDF 教材文件'}</span></div>
              <div className="flex gap-4 mt-8"><button type="button" onClick={() => setShowUpload(false)} className="flex-1 py-4 border border-slate-200 rounded-2xl font-bold text-slate-500">取消</button><button type="submit" className="flex-1 py-4 bg-primary text-white rounded-2xl font-bold hover:bg-primary-dark shadow-lg shadow-blue-100 transition-all">确认创建</button></div>
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

export default TeacherDashboard;
