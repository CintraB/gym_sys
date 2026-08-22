/**
 * Perfil principal — o que decide para onde o app abre.
 *
 * `aluno`, `professor` e `admin` são flags independentes: a mesma pessoa pode
 * ser as três (quem administra o sistema, dá aula e treina na academia). Por
 * isso o cargo sozinho não basta, e a resposta leva junto `perfis` com as
 * capacidades.
 *
 * Mora aqui, e não no authController, porque as rotas que trocam o CPF também
 * emitem token — e token precisa de cargo.
 */
export function perfilDe(usuario) {
  if (usuario.admin) return "admin";
  return usuario.professor ? "professor" : "aluno";
}

export function perfisDe(usuario) {
  return {
    aluno: Boolean(usuario.aluno),
    professor: Boolean(usuario.professor),
    admin: Boolean(usuario.admin),
  };
}
