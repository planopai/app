-- =====================================================================
-- SALAS DO MEMORIAL (TVs pelo App PAI) - 13/11/2026
-- Rode no phpMyAdmin, banco pla48587_mensagens. Só CRIA tabelas novas;
-- não altera nenhuma tabela existente. Pode rodar de novo sem problema.
-- =====================================================================

-- Fila de pedidos feitos pelo app (o agente do PC do Memorial busca e executa).
CREATE TABLE IF NOT EXISTS pla48587_mensagens.tv_comandos (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  sala          VARCHAR(20)  NOT NULL,                 -- 'SALA 01', 'SALA 02', 'SALA 03'
  acao          VARCHAR(20)  NOT NULL,                 -- ligar | desligar | atualizar | volume
  valor         INT          NULL,                     -- volume (só na ação volume)
  situacao      VARCHAR(12)  NOT NULL DEFAULT 'pendente', -- pendente | executando | concluido | falhou | expirado
  resultado     VARCHAR(500) NULL,                     -- andamento / resultado escrito pelo agente
  usuario_id    INT          NULL,
  usuario_nome  VARCHAR(120) NULL,
  criado_em     DATETIME     NOT NULL,
  pego_em       DATETIME     NULL,
  concluido_em  DATETIME     NULL,
  PRIMARY KEY (id),
  KEY idx_tv_comandos_situacao (situacao, id),
  KEY idx_tv_comandos_sala (sala, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Estado de cada TV, enviado pelo agente a cada ~30 s.
CREATE TABLE IF NOT EXISTS pla48587_mensagens.tv_status (
  tv            VARCHAR(30)  NOT NULL,                 -- 'PAINEL 01', 'SALA 01'...
  estado        VARCHAR(20)  NOT NULL,                 -- ligada | tela_apagada | desligada | nao_autorizada | desconhecida
  volume        INT          NULL,
  volume_max    INT          NULL,
  atualizado_em DATETIME     NOT NULL,
  PRIMARY KEY (tv)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- "Estou vivo" do agente (uma linha só, id = 1).
CREATE TABLE IF NOT EXISTS pla48587_mensagens.tv_agente (
  id        TINYINT UNSIGNED NOT NULL,
  visto_em  DATETIME     NULL,
  versao    VARCHAR(20)  NULL,
  maquina   VARCHAR(80)  NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Conferência: as 3 tabelas devem aparecer.
SELECT TABLE_NAME, TABLE_ROWS, CREATE_TIME
  FROM information_schema.TABLES
 WHERE TABLE_SCHEMA = 'pla48587_mensagens'
   AND TABLE_NAME IN ('tv_comandos', 'tv_status', 'tv_agente');

-- (Opcional) Liberar a tela para um cargo. Troque 'adm' pelo slug do cargo.
-- INSERT INTO pla48587_mensagens.cargo_paginas (cargo_id, pagina)
-- SELECT c.id, 'salas-tv' FROM pla48587_mensagens.cargos c
--  WHERE c.slug = 'adm'
--    AND NOT EXISTS (SELECT 1 FROM pla48587_mensagens.cargo_paginas cp WHERE cp.cargo_id = c.id AND cp.pagina = 'salas-tv');
