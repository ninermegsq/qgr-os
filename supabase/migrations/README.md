# Migrations do banco (Q GRÃOS)

Histórico do schema do Supabase, na ordem em que foi aplicado no projeto
`rppoiwrbxqdbtavhgdjk`.

| Arquivo | O que faz |
| --- | --- |
| `20260101000000_qg_init.sql` | **Arquivo de referência.** Schema completo: tabelas `administradores`, `noticias`, `leads`, `visitas`; RLS; funções `e_admin`, `registrar_lead`, `registrar_evento`, `clicar_noticia`, `noticias_publicas`; vistas `vw_painel_resumo`, `vw_leads_por_dia`, `vw_visitas_por_dia`, `vw_visitas_por_tipo`. É idempotente: pode rodar em um banco novo. |
| `20261111154444_qg_init.sql` | Primeira aplicação do schema no projeto (gerada a partir do arquivo de referência). |
| `20261111154527_qg_fix_registrar_evento.sql` | Corrige a função `registrar_evento`, que havia sido criada com um parâmetro duplicado. |
| `20261111160027_qg_admin_padrao.sql` | Cria o usuário administrador no Auth (`contato@qgraos.com.br`), a identidade e a linha em `administradores`. **A senha não é versionada**: defina `SET app.admin_senha = '...'` na mesma sessão antes de rodar. |
| `20261111161130_qg_admin_corrige_nulls.sql` | Normaliza para `''` as colunas de token do usuário no Auth (o GoTrue lê essas colunas como texto e falha com `NULL`). |
| `20261111162726_qg_limpa_leads_teste.sql` | Remove os leads do teste automatizado (`teste@qgraos.invalid`). |
| `20261111162953_qg_limpa_usuario_sonda.sql` | Remove o usuário de diagnóstico do Auth (`sonda-*@exemplo.com`). |
| `20261111163019_qg_limpa_visitas_teste.sql` | Remove as visitas do teste automatizado (`/teste-automated`). |
| `20261111163858_qg_noticia_verificacao.sql` | Notícia temporária usada para validar os cards no site e a aba "Notícias" do painel. Reescrita para só remover a própria linha de teste. |
| `20261111164909_qg_limpa_dados_verificacao.sql` | Limpeza final dos dados de verificação. Reescrita para apagar **somente** linhas de teste, nunca dados reais. |
| `20261111171841_20261112000000_qg_rota_senha_admin.sql` | Rotação da senha do administrador sem gravar a senha no repositório (`SET app.admin_senha = '...'`). |

## Aplicar em outro ambiente

1. Copie o arquivo `20260101000000_qg_init.sql` para o **SQL Editor** do Supabase Dashboard
   (ou rode `supabase db push`).
2. Crie o administrador: defina a senha na mesma sessão
   (`SET app.admin_senha = 'sua-senha-forte';`) e use
   `20261111160027_qg_admin_padrao.sql` e `20261111161130_qg_admin_corrige_nulls.sql`
   **ou** crie o usuário pela tela *Authentication → Users* e cadastre-o na tabela
   `administradores`.
3. Troque a senha do administrador.
4. Preencha `supabase.anonKey` em `site.config.js`.
