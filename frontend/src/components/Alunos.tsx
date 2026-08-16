import { useState, useEffect } from 'react';
import axios from 'axios';

interface Aluno {
  id: number;
  nome: string;
  cpf: string;
  email: string;
  titulo: string;
  ativo: boolean;
}

const Alunos = () => {
  const [alunos, setAlunos] = useState<Aluno[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ nome: '', cpf: '', email: '', titulo: '', senha: '' });

  useEffect(() => {
    fetchAlunos();
  }, []);

  const fetchAlunos = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get('http://localhost:8080/professores/alunos', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setAlunos(response.data);
    } catch (error) {
      console.error('Erro ao buscar alunos:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('token');
      await axios.post('http://localhost:8080/professores/alunos', formData, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setFormData({ nome: '', cpf: '', email: '', titulo: '', senha: '' });
      setShowForm(false);
      fetchAlunos();
    } catch (error) {
      console.error('Erro ao cadastrar aluno:', error);
    }
  };

  const desativar = async (cpf: string) => {
    try {
      const token = localStorage.getItem('token');
      await axios.put('http://localhost:8080/professores/alunos/desativar', { cpf }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchAlunos();
    } catch (error) {
      console.error('Erro ao desativar aluno:', error);
    }
  };

  return (
    <div>
      <h2>Gerenciar Alunos</h2>
      <button onClick={() => setShowForm(true)}>Cadastrar Aluno</button>
      {showForm && (
        <form onSubmit={handleSubmit}>
          <input type="text" placeholder="Nome" value={formData.nome} onChange={(e) => setFormData({...formData, nome: e.target.value})} required />
          <input type="text" placeholder="CPF" value={formData.cpf} onChange={(e) => setFormData({...formData, cpf: e.target.value})} required />
          <input type="email" placeholder="Email" value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} required />
          <input type="text" placeholder="Título" value={formData.titulo} onChange={(e) => setFormData({...formData, titulo: e.target.value})} />
          <input type="password" placeholder="Senha" value={formData.senha} onChange={(e) => setFormData({...formData, senha: e.target.value})} required />
          <button type="submit">Salvar</button>
          <button type="button" onClick={() => setShowForm(false)}>Cancelar</button>
        </form>
      )}
      <table>
        <thead>
          <tr>
            <th>Nome</th>
            <th>CPF</th>
            <th>Email</th>
            <th>Título</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          {alunos.map(aluno => (
            <tr key={aluno.id}>
              <td>{aluno.nome}</td>
              <td>{aluno.cpf}</td>
              <td>{aluno.email}</td>
              <td>{aluno.titulo}</td>
              <td>
                <button onClick={() => desativar(aluno.cpf)}>Desativar</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default Alunos;
