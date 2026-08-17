-- Preenche atualizado_em automaticamente em cada UPDATE.
--
-- Fica separado do schema.sql porque os testes rodam o schema sobre um
-- PostgreSQL emulado, que nao executa plpgsql.

CREATE OR REPLACE FUNCTION atualizar_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.atualizado_em = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_atualiza_usuario ON usuario;
CREATE TRIGGER trigger_atualiza_usuario
BEFORE UPDATE ON usuario
FOR EACH ROW
EXECUTE FUNCTION atualizar_timestamp();

DROP TRIGGER IF EXISTS trigger_atualiza_ex_usuario ON ex_usuario;
CREATE TRIGGER trigger_atualiza_ex_usuario
BEFORE UPDATE ON ex_usuario
FOR EACH ROW
EXECUTE FUNCTION atualizar_timestamp();
