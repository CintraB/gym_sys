import { useState, useEffect } from 'react';
import axios from 'axios';
import './AlunoDashboard.css';

interface TreinoAtual {
  nome_exercicio: string;
  numero_serie: number;
  carga: number;
  repeticoes: number;
  observacao_ex_usuario: string;
}

const AlunoDashboard = () => {
  const [treinoAtual, setTreinoAtual] = useState<TreinoAtual[]>([]);
  const [observacao, setObservacao] = useState('');

  useEffect(() => {
    fetchTreino();
  }, []);

  const fetchTreino = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get('http://localhost:8080/alunos/meutreino', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setTreinoAtual(response.data.treino_atual);
    } catch (error) {
      console.error('Erro ao buscar treino:', error);
    }
  };

  const pedirTreino = async () => {
    try {
      const token = localStorage.getItem('token');
      await axios.post('http://localhost:8080/alunos/pedidotreino', { observacao }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      alert('Pedido enviado!');
      setObservacao('');
    } catch (error) {
      console.error('Erro ao pedir treino:', error);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/';
  };

  return (
    <div className="aluno-dashboard">
      <header className="header">
        <img src="/logoapp.png" alt="Logo" className="logo" />
        <h1>Sistema Academia - Aluno</h1>
        <button onClick={handleLogout} className="logout-btn">Sair</button>
      </header>
      <main>
        <section>
          <h2>Meu Treino Atual</h2>
          {treinoAtual.length > 0 ? (
            <ul>
              {treinoAtual.map((ex, index) => (
                <li key={index}>
                  <strong>{ex.nome_exercicio}</strong>: {ex.numero_serie} séries, {ex.carga}kg, {ex.repeticoes} reps
                  {ex.observacao_ex_usuario && <p>Obs: {ex.observacao_ex_usuario}</p>}
                </li>
              ))}
            </ul>
          ) : (
            <p>Nenhum treino ativo.</p>
          )}
        </section>
        <section>
          <h2>Pedir Novo Treino</h2>
          <textarea
            placeholder="Observações"
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
          />
          <button onClick={pedirTreino}>Enviar Pedido</button>
        </section>
      </main>
    </div>
  );
};

export default AlunoDashboard;
