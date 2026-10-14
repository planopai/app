# Regras de contingência

Arquivos gerados a partir das regras do `informativo.php`.

Inclui:
- obrigatoriedade por fase;
- escopo `_wizard_restrict_ids`;
- normalização de velório/sepultamento;
- validação de sala e velório online;
- metadados de urna/roupa/invol/véu/cordão/insumos;
- trava de itens após Corpo Pronto;
- validação e normalização de coroas;
- pipeline central de validação.

## Importante

`regras-coroas.ts` foi desacoplado do Supabase por uma interface `CoroaRepository`.
O projeto ainda precisa fornecer um adapter que consulte:
- `est_produto`;
- `est_categoria`;
- `est_deposito`;
- `est_saldo`.

Isso evita embutir consultas em tabelas que ainda precisam estar sincronizadas no standby.

Este pacote não implementa ainda as transações de gravação/baixa de estoque.
Essas operações devem ser atômicas no PostgreSQL/RPC antes de ativar failover de escrita.
