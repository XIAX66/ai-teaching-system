import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import TeacherDashboard from './pages/TeacherDashboard';
import StudentDashboard from './pages/StudentDashboard';
import ResourceDetailPage from './pages/ResourceDetailPage';
import './index.css';

const App: React.FC = () => {
  const token = localStorage.getItem('token');
  const role = localStorage.getItem('role');
  const isAuthenticated = !!token;
  
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        
        {/* Protected Routes */}
        <Route 
          path="/dashboard" 
          element={
            isAuthenticated ? (
              role === 'teacher' ? <TeacherDashboard /> : <StudentDashboard />
            ) : (
              <Navigate to="/login" />
            )
          } 
        />
        
        <Route 
          path="/resource/:type/:id" 
          element={isAuthenticated ? <ResourceDetailPage /> : <Navigate to="/login" />} 
        />
        
        <Route path="/" element={<Navigate to="/dashboard" />} />
      </Routes>
    </BrowserRouter>
  );
};

export default App;
