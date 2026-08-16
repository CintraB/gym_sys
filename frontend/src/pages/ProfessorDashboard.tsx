import { useState, useEffect } from 'react';
import axios from 'axios';
import Alunos from '../components/Alunos';
import Treinos from '../components/Treinos';
import Pedidos from '../components/Pedidos';
import './ProfessorDashboard.css';

const ProfessorDashboard = () => {
  const [activeTab, setActiveTab] = useState('alunos');
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/';
  };

  return (
    <div className="dashboard">
      <header className="header">
        <img src="/logoapp.png" alt="Logo" className="logo" />
        <h1>Sistema Academia - Professor</h1>
        <button onClick={handleLogout} className="logout-btn">Sair</button>
      </header>
      <div className="content">
        <nav className="sidebar">
          <button onClick={() => setActiveTab('alunos')} className={activeTab === 'alunos' ? 'active' : ''}>Alunos</button>
          <button onClick={() => setActiveTab('treinos')} className={activeTab === 'treinos' ? 'active' : ''}>Treinos</button>
          <button onClick={() => setActiveTab('pedidos')} className={activeTab === 'pedidos' ? 'active' : ''}>Pedidos</button>
        </nav>
        <main className="main">
          {activeTab === 'alunos' && <Alunos />}
          {activeTab === 'treinos' && <Treinos />}
          {activeTab === 'pedidos' && <Pedidos />}
        </main>
      </div>
    </div>
  );
};

export default ProfessorDashboard;
