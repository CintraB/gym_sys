import { useState, useEffect } from 'react';
import axios from 'axios';

interface Exercicio {
  id_exercicio: number;
  nome_exercicio: string;
}

interface Aluno {
  id: number;
  nome: string;
}

const Treinos = () => {
  const [exercicios, setExercicios] = useState<Exercicio[]>([]);
  const [alunos, setAlunos] = useState<Aluno[]>([]);
  const [selectedAluno, setSelectedAluno] = useState<number | null>(null);
  const [treinoData, setTreinoData] = useState<any[]>([]);

  useEffect(() => {
    fetchExercicios();
    fetchAlunos();
  }, []);

  const fetchExercicios = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get('http://localhost:8080/professores/exercicios', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setExercicios(response.data);
    } catch (error) {
      console.error('Erro ao buscar exercícios:', error);
    }
  };

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

  const addExercicio = () => {
    setTreinoData([...treinoData, { id_exercicio: '', numero_serie: '', carga: '', repeticoes: '', observacao: '' }]);
  };

  const updateExercicio = (index: number, field: string, value: string) => {
    const newData = [...treinoData];
    newData[index][field] = value;
    setTreinoData(newData);
  };

  const handleSubmit = async () => {
    if (!selectedAluno) return;
    try {
      const token = localStorage.getItem('token');
      await axios.post('http://localhost:8080/professores/treino', { id_aluno: selectedAluno, exercicios: treinoData }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      alert('Treino cadastrado!');
      setTreinoData([]);
      setSelectedAluno(null);
    } catch (error) {
      console.error('Erro ao cadastrar treino:', error);
    }
  };

  return (
    <div>
      <h2>Criar Treino</h2>
      <select onChange={(e) => setSelectedAluno(Number(e.target.value))}>
        <option value="">Selecione um aluno</option>
        {alunos.map(aluno => (
          <option key={aluno.id} value={aluno.id}>{aluno.nome}</option>
        ))}
      </select>
      {selectedAluno && (
        <div>
          <button onClick={addExercicio}>Adicionar Exercício</button>
          {treinoData.map((ex, index) => (
            <div key={index}>
              <select value={ex.id_exercicio} onChange={(e) => updateExercicio(index, 'id_exercicio', e.target.value)}>
                <option value="">Selecione exercício</option>
                {exercicios.map(exc => (
                  <option key={exc.id_exercicio} value={exc.id_exercicio}>{exc.nome_exercicio}</option>
                ))}
              </select>
              <input type="number" placeholder="Séries" value={ex.numero_serie} onChange={(e) => updateExercicio(index, 'numero_serie', e.target.value)} />
              <input type="number" placeholder="Carga" value={ex.carga} onChange={(e) => updateExercicio(index, 'carga', e.target.value)} />
              <input type="number" placeholder="Repetições" value={ex.repeticoes} onChange={(e) => updateExercicio(index, 'repeticoes', e.target.value)} />
              <input type="text" placeholder="Observação" value={ex.observacao} onChange={(e) => updateExercicio(index, 'observacao', e.target.value)} />
            </div>
          ))}
          <button onClick={handleSubmit}>Salvar Treino</button>
        </div>
      )}
    </div>
  );
};

export default Treinos;
