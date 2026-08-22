import { login, eu, trocarMinhaSenha } from '../../../backend/src/controllers/authController.js'
import * as aluno from '../../../backend/src/controllers/alunoController.js'
import * as sessao from '../../../backend/src/controllers/sessaoController.js'
import * as professor from '../../../backend/src/controllers/professorController.js'
import * as admin from '../../../backend/src/controllers/adminController.js'

/**
 * As rotas do app, espelhando `backend/src/routes/`.
 *
 * `autenticado` e `perfil` reproduzem o que o Express aplicava no prefixo:
 * `rotas.use("/professores", autenticar, exigirPerfil("professor"), ...)`.
 *
 * Um teste confere esta lista contra os arquivos de rota de verdade, nos dois
 * sentidos — sem ele, uma rota nova no Express só apareceria como 404 dentro do
 * APK, descoberta em campo.
 */
export const TABELA = [
  // As duas de status não têm controller no backend: são handlers inline no
  // routes/index.js. Aqui viram função que devolve o mesmo corpo.
  { metodo: 'GET', caminho: '/', autenticado: false, perfil: null, acao: () => ({ status: 'ok', servico: 'gym-sys-api' }) },
  { metodo: 'GET', caminho: '/health', autenticado: false, perfil: null, acao: () => ({ status: 'ok' }) },

  { metodo: 'POST', caminho: '/login', autenticado: false, perfil: null, acao: login },
  { metodo: 'GET', caminho: '/me', autenticado: true, perfil: null, acao: eu },
  { metodo: 'PUT', caminho: '/me/senha', autenticado: true, perfil: null, acao: trocarMinhaSenha },

  { metodo: 'GET', caminho: '/alunos/meutreino', autenticado: true, perfil: 'aluno', acao: aluno.meuTreino },
  { metodo: 'GET', caminho: '/alunos/historico', autenticado: true, perfil: 'aluno', acao: aluno.meuHistorico },
  { metodo: 'GET', caminho: '/alunos/pedidotreino', autenticado: true, perfil: 'aluno', acao: aluno.meuPedido },
  { metodo: 'POST', caminho: '/alunos/pedidotreino', autenticado: true, perfil: 'aluno', acao: aluno.pedirNovoTreino },
  { metodo: 'GET', caminho: '/alunos/treino/sessao', autenticado: true, perfil: 'aluno', acao: sessao.sessaoAtual },
  { metodo: 'POST', caminho: '/alunos/treino/sessao', autenticado: true, perfil: 'aluno', acao: sessao.iniciarSessao },
  { metodo: 'DELETE', caminho: '/alunos/treino/sessao', autenticado: true, perfil: 'aluno', acao: sessao.descartarSessao },
  { metodo: 'POST', caminho: '/alunos/treino/sessao/finalizar', autenticado: true, perfil: 'aluno', acao: sessao.finalizarSessao },
  { metodo: 'PUT', caminho: '/alunos/treino/sessao/exercicio/:id', autenticado: true, perfil: 'aluno', acao: sessao.alternarExercicio },
  { metodo: 'GET', caminho: '/alunos/sessoes', autenticado: true, perfil: 'aluno', acao: sessao.minhasSessoes },
  { metodo: 'GET', caminho: '/alunos/sessoes/:id', autenticado: true, perfil: 'aluno', acao: sessao.detalheDaMinhaSessao },

  { metodo: 'GET', caminho: '/professores/resumo', autenticado: true, perfil: 'professor', acao: professor.resumo },
  { metodo: 'GET', caminho: '/professores/alunos', autenticado: true, perfil: 'professor', acao: professor.listarAlunos },
  { metodo: 'POST', caminho: '/professores/alunos', autenticado: true, perfil: 'professor', acao: professor.cadastrarAluno },
  { metodo: 'PUT', caminho: '/professores/alunos/desativar', autenticado: true, perfil: 'professor', acao: professor.desativarUsuario },
  { metodo: 'PUT', caminho: '/professores/alunos/reativar', autenticado: true, perfil: 'professor', acao: professor.reativarUsuario },
  { metodo: 'GET', caminho: '/professores/aluno/:id', autenticado: true, perfil: 'professor', acao: professor.listarAlunoPorId },
  { metodo: 'PUT', caminho: '/professores/aluno/:id', autenticado: true, perfil: 'professor', acao: professor.alterarAluno },
  { metodo: 'GET', caminho: '/professores/aluno/:id/treino', autenticado: true, perfil: 'professor', acao: professor.treinoDoAluno },
  { metodo: 'GET', caminho: '/professores/aluno/:id/sessoes', autenticado: true, perfil: 'professor', acao: sessao.sessoesDoAluno },
  { metodo: 'POST', caminho: '/professores/usuario/cpfoutitulo', autenticado: true, perfil: 'professor', acao: professor.buscarUsuarioPorCpfOuTitulo },
  { metodo: 'GET', caminho: '/professores/professores', autenticado: true, perfil: 'professor', acao: professor.listarProfessores },
  { metodo: 'POST', caminho: '/professores/professores', autenticado: true, perfil: 'professor', acao: professor.cadastrarProfessor },
  { metodo: 'GET', caminho: '/professores/professor/:id', autenticado: true, perfil: 'professor', acao: professor.listarProfessorPorId },
  { metodo: 'GET', caminho: '/professores/exercicios', autenticado: true, perfil: 'professor', acao: professor.listarExercicios },
  { metodo: 'POST', caminho: '/professores/exercicios', autenticado: true, perfil: 'professor', acao: professor.cadastrarExercicio },
  { metodo: 'POST', caminho: '/professores/treino', autenticado: true, perfil: 'professor', acao: professor.cadastrarTreino },
  { metodo: 'PUT', caminho: '/professores/treino/:id', autenticado: true, perfil: 'professor', acao: professor.editarTreino },
  { metodo: 'GET', caminho: '/professores/treino/pedidos', autenticado: true, perfil: 'professor', acao: professor.listarPedidos },
  { metodo: 'POST', caminho: '/professores/treino/pedido/finalizado', autenticado: true, perfil: 'professor', acao: professor.finalizarPedido },
  { metodo: 'PUT', caminho: '/professores/treino/inativar/:id', autenticado: true, perfil: 'professor', acao: professor.inativarTreino },
  { metodo: 'PUT', caminho: '/professores/treino/reativar/:id', autenticado: true, perfil: 'professor', acao: professor.reativarTreino },
  // Aliases em GET, mantidos por compatibilidade com a versao anterior da API.
  { metodo: 'GET', caminho: '/professores/treino/inativar/:id', autenticado: true, perfil: 'professor', acao: professor.inativarTreino },
  { metodo: 'GET', caminho: '/professores/treino/reativar/:id', autenticado: true, perfil: 'professor', acao: professor.reativarTreino },

  { metodo: 'GET', caminho: '/admin/usuarios', autenticado: true, perfil: 'admin', acao: admin.listarUsuarios },
  { metodo: 'PUT', caminho: '/admin/usuarios/:id', autenticado: true, perfil: 'admin', acao: admin.alterarUsuario },
  { metodo: 'PUT', caminho: '/admin/usuarios/:id/senha', autenticado: true, perfil: 'admin', acao: admin.redefinirSenha },
  { metodo: 'PUT', caminho: '/admin/usuarios/:id/perfis', autenticado: true, perfil: 'admin', acao: admin.alterarPerfis },
]
