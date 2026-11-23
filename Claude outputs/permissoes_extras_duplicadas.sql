-- 23/11/2026 — Extras de pessoa (tabela permissoes) que repetem uma página que o cargo já dá.
-- SÓ LEITURA. Essas linhas não aparecem como "exceção" na tela Permissões enquanto o cargo tem a página,
-- mas continuam valendo quando a página é desmarcada no cargo.
SELECT u.id, u.nome, u.cargo, p.pagina
FROM permissoes p
INNER JOIN usuarios u ON u.id = p.user_id
INNER JOIN cargos c ON c.slug = u.cargo AND c.ativo = 1
INNER JOIN cargo_paginas cp ON cp.cargo_id = c.id AND cp.pagina = p.pagina
ORDER BY u.nome, p.pagina;
