import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { User, Lock, BookOpen } from 'lucide-react';
import { jwtDecode } from 'jwt-decode';

const LoginPage: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await axios.post('/api/login', { username, password });
      const token = res.data.token;
      const decoded: any = jwtDecode(token);
      
      localStorage.setItem('token', token);
      localStorage.setItem('role', decoded.role);
      
      navigate('/dashboard');
      window.location.reload();
    } catch (err: any) {
      setError(err.response?.data?.error || '登录失败，请检查用户名或密码');
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="bg-white p-10 rounded-3xl shadow-2xl w-full max-w-md border border-slate-100">
        <div className="flex flex-col items-center mb-10">
          <div className="bg-primary p-4 rounded-2xl mb-4 shadow-lg shadow-blue-200">
            <BookOpen className="text-white w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold text-slate-800">AI 智能教学系统</h1>
          <p className="text-slate-500 mt-2 text-sm">提升教学效率，开启智能学习</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-700 ml-1">用户名</label>
            <div className="relative group">
              <User className="absolute left-3 top-3 w-5 h-5 text-slate-400 group-focus-within:text-primary transition-colors" />
              <input
                type="text"
                placeholder="请输入用户名"
                className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-700 ml-1">密码</label>
            <div className="relative group">
              <Lock className="absolute left-3 top-3 w-5 h-5 text-slate-400 group-focus-within:text-primary transition-colors" />
              <input
                type="password"
                placeholder="请输入密码"
                className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          {error && <div className="text-red-500 text-sm text-center font-medium bg-red-50 py-2 rounded-lg">{error}</div>}

          <button
            type="submit"
            className="w-full bg-primary hover:bg-primary-dark text-white font-bold py-3.5 rounded-xl shadow-lg shadow-blue-200 transform transition active:scale-[0.98]"
          >
            立即登录
          </button>
        </form>

        <p className="mt-8 text-center text-slate-500 text-sm">
          还没有账号？{' '}
          <Link to="/register" className="text-primary font-bold hover:underline">免费注册</Link>
        </p>
      </div>
    </div>
  );
};

export default LoginPage;
