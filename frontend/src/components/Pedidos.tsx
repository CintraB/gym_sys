import { useState, useEffect } from 'react';
import axios from 'axios';

interface Pedido {
  id: number;
  id_aluno: number;
  observacao: string;
  created_at: string;
}

const Pedidos = () => {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);

  useEffect(() => {
    fetchPedidos();
  }, []);

  const fetchPedidos = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get('http://localhost:8080/professores/treino/pedidos', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setPedidos(response.data);
    } catch (error) {
      console.error('Erro ao buscar pedidos:', error);
    }
  };

  const finalizarPedido = async (id_aluno: number) => {
    try {
      const token = localStorage.getItem('token');
      await axios.post('http://localhost:8080/professores/treino/pedido/finalizado', { id_aluno }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchPedidos();
    } catch (error) {
      console.error('Erro ao finalizar pedido:', error);
    }
  };

  return (
    <div>
      <h2>Pedidos de Treino</h2>
      <ul>
        {pedidos.map(pedido => (
          <li key={pedido.id}>
            Aluno ID: {pedido.id_aluno} - Observação: {pedido.observacao}
            <button onClick={() => finalizarPedido(pedido.id_aluno)}>Finalizar</button>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default Pedidos;
