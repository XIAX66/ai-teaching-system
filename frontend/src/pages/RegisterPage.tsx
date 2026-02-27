import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { User, Lock, BookOpen, GraduationCap } from 'lucide-react';

const RegisterPage: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('student');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await axios.post('/api/register', { username, password, role });
      navigate('/login');
    } catch (err: any) {
      setError(err.response?.data?.error || '注册失败');
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="bg-white p-10 rounded-3xl shadow-2xl w-full max-w-md border border-slate-100">
        <div className="flex flex-col items-center mb-8">
          <div className="bg-primary p-4 rounded-2xl mb-4">
            <GraduationCap className="text-white w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold text-slate-800">加入我们</h1>
          <p className="text-slate-500 mt-1 text-sm">创建您的账户以开始使用</p>
        </div>

        <form onSubmit={handleRegister} className="space-y-5">
          <div className="flex gap-4 p-1 bg-slate-100 rounded-xl mb-6">
            <button 
              type="button"
              className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${role === 'student' ? 'bg-white text-primary shadow-sm' : 'text-slate-400'}`}
              onClick={() => setRole('student')}
            >
              我是学生
            </button>
            <button 
              type="button"
              className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${role === 'teacher' ? 'bg-white text-primary shadow-sm' : 'text-slate-400'}`}
              onClick={() => setRole('teacher')}
            >
              我是教师
            </button>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-slate-700 ml-1">用户名</label>
            <input
              type="text"
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary outline-none"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-slate-700 ml-1">密码</label>
            <input
              type="password"
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary outline-none"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {error && <div className="text-red-500 text-sm text-center">{error}</div>}

          <button
            type="submit"
            className="w-full bg-primary hover:bg-primary-dark text-white font-bold py-3.5 rounded-xl shadow-lg mt-4"
          >
            立即注册
          </button>
        </form>

        <p className="mt-8 text-center text-slate-500 text-sm">
          已有账号？{' '}
          <Link to="/login" className="text-primary font-bold hover:underline">去登录</Link>
        </p>
      </div>
    </div>
  );
};

export default RegisterPage;
