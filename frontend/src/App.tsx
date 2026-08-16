import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Login from './pages/Login';
import ProfessorDashboard from './pages/ProfessorDashboard';
import AlunoDashboard from './pages/AlunoDashboard';
import './App.css';

function App() {
  return (
    <Router>
      <div className="app">
        <Routes>
          <Route path="/" element={<Login />} />
          <Route path="/professor" element={<ProfessorDashboard />} />
          <Route path="/aluno" element={<AlunoDashboard />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
