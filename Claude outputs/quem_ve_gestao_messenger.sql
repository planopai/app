-- 23/11/2026 — Quem o Messenger trata como Gestão (página messenger-historico) e POR QUÊ.
-- SÓ LEITURA. No phpMyAdmin, no banco do app (onde ficam usuarios, cargos e permissoes).
SELECT u.id, u.nome, u.cargo,
       CASE WHEN EXISTS (SELECT 1 FROM permissoes p WHERE p.user_id = u.id AND p.pagina = 'messenger-historico')
            THEN 'SIM (exceção da pessoa)' ELSE '' END AS pela_pessoa,
       CASE WHEN EXISTS (SELECT 1 FROM cargos c INNER JOIN cargo_paginas cp ON cp.cargo_id = c.id
                          WHERE c.slug = u.cargo AND c.ativo = 1 AND cp.pagina = 'messenger-historico')
            THEN 'SIM (cargo)' ELSE '' END AS pelo_cargo,
       CASE WHEN EXISTS (SELECT 1 FROM permissoes_bloqueio b WHERE b.user_id = u.id AND b.pagina = 'messenger-historico')
            THEN 'bloqueado' ELSE '' END AS bloqueio
FROM usuarios u
WHERE EXISTS (SELECT 1 FROM permissoes p WHERE p.user_id = u.id AND p.pagina = 'messenger-historico')
   OR EXISTS (SELECT 1 FROM cargos c INNER JOIN cargo_paginas cp ON cp.cargo_id = c.id
               WHERE c.slug = u.cargo AND c.ativo = 1 AND cp.pagina = 'messenger-historico')
ORDER BY u.nome;
