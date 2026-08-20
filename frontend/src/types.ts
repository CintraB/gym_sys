export type Cargo = 'professor' | 'aluno'

export interface Usuario {
  id: number
  nome: string
  cpf: string
  email?: string | null
  titulo?: string | null
  /** Perfil principal — decide para onde o app abre depois do login. */
  cargo: Cargo
  /** As duas capacidades. Quem dá aula e também treina tem as duas. */
  perfis: { aluno: boolean; professor: boolean }
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
  /** Última vez que o aluno finalizou um treino. Null se nunca treinou. */
  ultima_sessao: string | null
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

/** Um dia do treino: o A/B/C/D das fichas de academia. */
export interface Bloco {
  id_bloco: number
  letra: string
  /** Opcional. Em branco, a tela mostra só "Treino A". */
  nome: string | null
  ordem: number
  exercicios: ExercicioDoTreino[]
}

export interface TreinoCompleto {
  treino: Treino | null
  blocos: Bloco[]
  /** Qual bloco propor hoje — o seguinte ao último finalizado. */
  bloco_sugerido?: number | null
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

/* --------------------------------------------- execução do treino */

/** Um exercício dentro de uma sessão: o prescrito + se já foi feito. */
export interface SessaoExercicio {
  id: number
  concluido: boolean
  concluido_em: string | null
  id_ex_usuario: number
  numero_serie: number
  repeticoes: string
  carga: string | number | null
  observacao_ex_usuario: string | null
  nome_exercicio: string
  tipo: string | null
}

export interface Sessao {
  id_sessao: number
  id_treino: number
  id_bloco: number | null
  id_aluno: number
  iniciado_em: string
  /** Null enquanto o treino está em andamento. */
  finalizado_em: string | null
  duracao_segundos: number | null
  nome_professor: string
  bloco_letra: string | null
  bloco_nome: string | null
}

export interface SessaoCompleta {
  sessao: Sessao
  exercicios: SessaoExercicio[]
}

export interface ItemHistoricoSessao {
  id_sessao: number
  iniciado_em: string
  finalizado_em: string
  duracao_segundos: number
  nome_professor: string
  bloco_letra: string | null
  bloco_nome: string | null
  total_exercicios: number
  concluidos: number
}

/** Linha do formulário de montagem de um bloco. */
export interface LinhaBloco {
  /** Presente só na edição: identifica o bloco que já existe no banco. */
  id_bloco?: number
  nome: string
  exercicios: LinhaExercicio[]
}

export interface FrequenciaAluno {
  aluno: { id: number; nome: string }
  ultimos30dias: {
    sessoes: number
    media_duracao_segundos: number
    ultima: string | null
  }
  sessoes: ItemHistoricoSessao[]
}

/** Linha do formulário de montagem de treino. */
export interface LinhaExercicio {
  /** Presente só na edição: sem ele o servidor trata a linha como acréscimo. */
  id?: number
  id_exercicio: string
  numero_serie: string
  repeticoes: string
  carga: string
  observacao_ex_usuario: string
}
