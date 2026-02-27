import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Book, Search, ChevronRight, GraduationCap, FileText, LayoutGrid, List as ListIcon, Library } from 'lucide-react';

const StudentDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [textbooks, setTextbooks] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchTextbooks = async (query = '') => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      
      const url = query ? `/api/textbook/search?q=${encodeURIComponent(query)}` : `/api/textbook/list`;
      const res = await axios.get(url, { headers });
      setTextbooks(res.data.data || []);
      setIsSearching(!!query);
    } catch (err) {
      console.error('Fetch error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTextbooks();
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchTextbooks(searchQuery);
  };

  const clearSearch = () => {
    setSearchQuery('');
    fetchTextbooks('');
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-primary p-2.5 rounded-2xl text-white shadow-lg shadow-blue-100"><GraduationCap size={24} /></div>
            <div>
              <h1 className="text-xl font-black text-slate-800 tracking-tight uppercase">Learning Center</h1>
              <p className="text-[10px] text-slate-400 font-bold tracking-widest uppercase -mt-1">Student Portal</p>
            </div>
          </div>

          <form onSubmit={handleSearch} className="flex-1 max-w-2xl mx-12">
            <div className="relative group">
              <Search className="absolute left-4 top-3.5 text-slate-400 group-focus-within:text-primary transition-colors" size={20} />
              <input 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索教材名称、关键词或 ISBN 编码..." 
                className="w-full pl-12 pr-4 py-3.5 bg-slate-100 border-2 border-transparent rounded-2xl focus:bg-white focus:border-primary focus:ring-4 focus:ring-blue-50 outline-none transition-all font-medium text-slate-700"
              />
              <button type="submit" className="absolute right-3 top-2 px-4 py-1.5 bg-primary text-white rounded-xl text-xs font-bold shadow-md hover:bg-primary-dark transition-all">搜索</button>
            </div>
          </form>

          <div className="flex items-center gap-4 border-l border-slate-100 pl-6">
            <button onClick={() => { localStorage.clear(); window.location.href='/login'; }} className="text-slate-400 font-bold text-xs uppercase hover:text-red-500 transition-colors">退出登录</button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 mt-12">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-2xl font-black text-slate-800 flex items-center gap-3">
              {isSearching ? <Search className="text-primary" size={28} /> : <Library className="text-primary" size={28} />}
              {isSearching ? `搜索结果: "${searchQuery}"` : '全部教材库'}
            </h2>
            <p className="text-slate-400 text-sm mt-1 font-medium">系统中共收录 {textbooks.length} 本教学教材</p>
          </div>
          {isSearching && (
            <button onClick={clearSearch} className="text-primary font-bold text-sm hover:underline">返回全部教材</button>
          )}
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-32 text-slate-300 gap-4"><div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" /><p className="font-bold uppercase text-xs tracking-widest">正在检索知识库...</p></div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
            {textbooks.map((t: any) => (
              <div key={t.id} onClick={() => navigate(`/resource/textbook/${t.id}`)} className="bg-white rounded-[2rem] border border-slate-200 p-2 hover:shadow-2xl hover:shadow-blue-900/10 transition-all group cursor-pointer hover:-translate-y-1">
                <div className="aspect-[3/4] bg-slate-50 rounded-[1.5rem] mb-4 flex items-center justify-center relative overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  <FileText size={64} className="text-slate-200 group-hover:text-primary/20 transition-colors" />
                  <div className="absolute top-4 right-4"><span className="bg-white/80 backdrop-blur px-3 py-1 rounded-full text-[10px] font-black text-primary border border-primary/10 uppercase shadow-sm">PDF</span></div>
                </div>
                <div className="px-4 pb-6">
                  <h3 className="text-lg font-black text-slate-800 mb-1 group-hover:text-primary transition-colors line-clamp-1">{t.title}</h3>
                  <div className="flex items-center gap-2 mb-4"><span className="text-xs font-bold text-slate-400 uppercase tracking-tight">{t.author || '未知作者'}</span><span className="w-1 h-1 bg-slate-200 rounded-full" /><span className="text-[10px] font-bold text-slate-300 tracking-tighter">ISBN: {t.isbn || '--'}</span></div>
                  <div className="flex items-center justify-between pt-4 border-t border-slate-50">
                    <div className="flex items-center gap-1.5"><div className={`w-2 h-2 rounded-full ${t.status === 'processed' ? 'bg-green-500' : 'bg-amber-500 animate-pulse'}`} /><span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t.status === 'processed' ? 'READY' : 'PROCESSED'}</span></div>
                    <div className="bg-slate-50 group-hover:bg-primary p-2 rounded-xl transition-all"><ChevronRight size={16} className="text-slate-400 group-hover:text-white" /></div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && textbooks.length === 0 && (
          <div className="text-center py-32 bg-white rounded-[3rem] border-2 border-dashed border-slate-100">
            <div className="bg-slate-50 w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6"><Search size={48} className="text-slate-200" /></div>
            <h3 className="text-xl font-black text-slate-800 mb-2">未找到匹配教材</h3>
            <p className="text-slate-400 font-medium">请尝试调整搜索词，或输入 ISBN 编码进行精准查找</p>
            <button onClick={clearSearch} className="mt-8 text-primary font-black text-sm uppercase tracking-widest hover:underline">清除搜索条件</button>
          </div>
        )}
      </main>
    </div>
  );
};

export default StudentDashboard;
