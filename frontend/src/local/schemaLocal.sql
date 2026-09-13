-- O que existe SO no aparelho. O servidor nao tem nada disto, e nao deve ter.
--
-- Fica fora do schema.sql, que e compartilhado com o servidor, para a fronteira
-- ser explicita: coluna nova aqui nunca sobe, e coluna nova la nunca precisa de
-- traducao aqui.

-- Marca de "esta sessao ja subiu".
--
-- E atalho, e nao garantia: a garantia e o indice unico de `uuid` no servidor.
-- Se o app morrer entre subir e marcar, a proxima tentativa e reconhecida como
-- repetida (`criada: false`) e a marca se corrige sozinha.
--
-- Tabela, e nao coluna em sessao_treino: o SQLite nao tem ADD COLUMN IF NOT
-- EXISTS, e a coluna teria de morar no schema compartilhado.
CREATE TABLE IF NOT EXISTS sincronizacao_envio (
    uuid        TEXT PRIMARY KEY,
    enviado_em  TEXT NOT NULL
);
