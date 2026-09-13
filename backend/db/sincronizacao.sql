-- A subida do APK: um pacote, uma transacao.
--
-- Fica fora do schema.sql pelo mesmo motivo do rls.sql: plpgsql, que o pg-mem
-- da suite principal nao executa.
--
-- Tres POST no PostgREST nao serviriam: as linhas filhas referenciam
-- id_sessao, que e o SERIAL do servidor e o aparelho nao conhece. Sairia um
-- vaivem de "insere, le o id, insere os filhos", com meia sessao gravada se a
-- rede cair no meio.
--
-- Aplicar:  psql -U <usuario> -d <banco> -f db/sincronizacao.sql

CREATE OR REPLACE FUNCTION sincronizar_sessao(pacote JSONB)
RETURNS JSONB
LANGUAGE plpgsql
-- SECURITY INVOKER, e nao DEFINER: as politicas continuam valendo dentro da
-- funcao. Ela nao e uma porta que escapa do RLS -- e so a forma de mandar o
-- pacote junto. DEFINER aqui anularia as politicas de escrita inteiras.
SECURITY INVOKER
-- Fixo mesmo sendo INVOKER: aqui ele nao evita escalada (a funcao ja roda com
-- os privilegios de quem chama), evita a funcao escrever na tabela errada se o
-- search_path do chamador apontar para outro schema. Com ele, todo nome tem de
-- vir qualificado -- e e o que o linter do Supabase cobra.
SET search_path = ''
AS $$
DECLARE
  v_uuid          UUID    := (pacote ->> 'uuid')::UUID;
  v_id_sessao     INTEGER;
  v_exercicio     JSONB;
  v_serie         JSONB;
  v_id_sessao_ex  INTEGER;
BEGIN
  IF v_uuid IS NULL THEN
    RAISE EXCEPTION 'pacote sem uuid';
  END IF;

  -- So sessao finalizada sobe, o que a torna imutavel: nada que subiu muda
  -- depois. De quebra nunca briga com idx_sessao_aberta_por_aluno.
  IF (pacote ->> 'finalizado_em') IS NULL THEN
    RAISE EXCEPTION 'so sessao finalizada pode subir';
  END IF;

  -- Idempotencia: uuid ja gravado devolve o que existe, sem tocar em nada. O
  -- app pode ter morrido entre inserir e marcar que subiu.
  SELECT id_sessao INTO v_id_sessao FROM public.sessao_treino WHERE uuid = v_uuid;
  IF FOUND THEN
    RETURN jsonb_build_object('id_sessao', v_id_sessao, 'criada', false);
  END IF;

  INSERT INTO public.sessao_treino (
    id_treino, id_bloco, id_aluno, iniciado_em, finalizado_em,
    duracao_segundos, observacao, calorias, uuid
  ) VALUES (
    (pacote ->> 'id_treino')::INTEGER,
    (pacote ->> 'id_bloco')::INTEGER,
    (pacote ->> 'id_aluno')::INTEGER,
    (pacote ->> 'iniciado_em')::TIMESTAMPTZ,
    (pacote ->> 'finalizado_em')::TIMESTAMPTZ,
    (pacote ->> 'duracao_segundos')::INTEGER,
    pacote ->> 'observacao',
    (pacote ->> 'calorias')::INTEGER,
    v_uuid
  )
  RETURNING id_sessao INTO v_id_sessao;

  FOR v_exercicio IN
    SELECT * FROM jsonb_array_elements(coalesce(pacote -> 'exercicios', '[]'::jsonb))
  LOOP
    INSERT INTO public.sessao_exercicio (id_sessao, id_ex_usuario, concluido, concluido_em, uuid)
    VALUES (
      v_id_sessao,
      (v_exercicio ->> 'id_ex_usuario')::INTEGER,
      coalesce((v_exercicio ->> 'concluido')::BOOLEAN, FALSE),
      (v_exercicio ->> 'concluido_em')::TIMESTAMPTZ,
      (v_exercicio ->> 'uuid')::UUID
    )
    RETURNING id INTO v_id_sessao_ex;

    FOR v_serie IN
      SELECT * FROM jsonb_array_elements(coalesce(v_exercicio -> 'series', '[]'::jsonb))
    LOOP
      INSERT INTO public.sessao_serie (id_sessao_exercicio, carga, repeticoes, uuid)
      VALUES (
        v_id_sessao_ex,
        (v_serie ->> 'carga')::INTEGER,
        v_serie ->> 'repeticoes',
        (v_serie ->> 'uuid')::UUID
      );
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object('id_sessao', v_id_sessao, 'criada', true);
END;
$$;

-- Toda funcao nasce com EXECUTE para PUBLIC: revogar de PUBLIC e o que tem
-- efeito, e nao revogar so de anon.
REVOKE ALL ON FUNCTION sincronizar_sessao(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sincronizar_sessao(JSONB) TO authenticated;
