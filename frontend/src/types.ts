export type Cargo = 'professor' | 'aluno'

export interface Usuario {
  id: number
  nome: string
  cpf: string
  email?: string | null
  titulo?: string | null
  cargo: Cargo
  ativo: boolean
}

export interface Aluno {
  id: number
  nome: string
  cpf: string
  email: string | null
  titulo: string | null
  aluno: boolean
  professor: boolean
  ativo: boolean
}

export interface Exercicio {
  id_exercicio: number
  nome_exercicio: string
  tipo: string | null
}

export interface ExercicioDoTreino {
  id: number
  id_exercicio: number
  numero_serie: number
  carga: string | number | null
  repeticoes: string
  observacao_ex_usuario: string | null
  nome_exercicio: string
  tipo: string | null
}

export interface Treino {
  id_treino: number
  criado_em: string
  nome_professor: string
}

export interface TreinoCompleto {
  treino: Treino | null
  exercicios: ExercicioDoTreino[]
}

export interface ItemHistorico {
  id_treino: number
  criado_em: string
  ativo: boolean
  nome_professor: string
  total_exercicios: string | number
}

export interface Pedido {
  id_pedido: number
  id_aluno: number
  observacao: string | null
  criado_em: string
  nome_aluno: string
  cpf: string
}

export interface PedidoProprio {
  id_pedido: number
  observacao: string | null
  criado_em: string
}

export interface Resumo {
  alunos_ativos: number
  alunos_inativos: number
  pedidos_abertos: number
  treinos_ativos: number
}

/** Linha do formulário de montagem de treino. */
export interface LinhaExercicio {
  id_exercicio: string
  numero_serie: string
  repeticoes: string
  carga: string
  observacao_ex_usuario: string
}
