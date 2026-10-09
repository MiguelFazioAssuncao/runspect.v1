# Runspect frontend

Frontend Next.js do Runspect. O backend Go precisa estar rodando separadamente
porque compila e executa C++17 com `g++` e sandbox do sistema operacional.

Código C++ comum recebe visualização automática de variáveis, vetores,
strings e matrizes. Representações usuais de grafos também são reconhecidas.
Código com chamadas `viz::` mantém a visualização manual.

O catálogo **técnicas** contém 24 programas C++17 independentes, sem chamadas
`viz::` nem dependência de `visualizer.h`. Todos usam o mesmo template
competitivo do editor: `#define endl '\n'`, `using ll = long long`,
`solve()` e `signed main()` com entrada/saída rápida. Cada técnica documenta
entrada, saída e complexidades. A visualização é gerada automaticamente pelo
backend, sem alterar o programa mostrado no editor.

Para compilar todos os exemplos com `g++` e conferir as saídas e os casos de
borda, execute `npm run test:cpp`. Para verificar também a instrumentação,
com as dependências Clang do backend instaladas, execute
`RUNSPECT_TEST_AUTOMATIC=1 npm run test:cpp` (Linux).

No Linux, o backend precisa de `g++`, `bubblewrap`, `util-linux` e
`python3-clang` (incluído no Dockerfile). Veja os formatos reconhecidos e
limites em [Visualização automática](../backend/AUTOMATIC_VISUALIZATION.md).

## Preferências do editor

Clique no ícone de ajustes ao lado de **Executar Algoritmo** para personalizar
o Monaco. O painel oferece temas claro, escuro e alto contraste, paleta própria,
tipografia, minimapa, recuo, cursor, sugestões e opções adicionais em JSON,
com prévia ao vivo. Formatação automática depende de um formatador para C++.

As preferências são salvas automaticamente no `localStorage`, na chave
`runspect.editor.preferences.v1`, por navegador/perfil e origem do site.
Elas sobrevivem ao recarregamento e são sincronizadas entre abas da mesma origem.
Limpar os dados do site remove as preferências; em navegação privada elas podem
ser temporárias. Se o armazenamento estiver indisponível, o painel avisa e as
alterações continuam funcionando na sessão. Use **Exportar**, **Importar** ou
**Restaurar padrões** para transportar ou redefinir as configurações.

Opções avançadas têm prioridade sobre os controles do painel. Apenas valores
serializáveis em JSON são aceitos; modelo, conteúdo, linguagem, tema, dimensões
e modo de edição permanecem sob controle da integração.

## Desenvolvimento local

Inicie o backend em um terminal:

```bash
cd ../backend
go run ./cmd/server
```

Em outro terminal, inicie o frontend:

```bash
npm install
npm run dev
```

Abra `http://localhost:3000`. Sem configuração adicional, o rewrite de
[`next.config.ts`](./next.config.ts) encaminha `/api/*` para
`http://127.0.0.1:8080`.

## Deploy do frontend na Vercel

1. Publique este repositório no GitHub (se ainda não estiver publicado).
2. Em [vercel.com/new](https://vercel.com/new), importe o repositório.
3. Em **Root Directory**, selecione `frontend`.
4. Mantenha o build padrão do Next.js (`npm run build`).
5. Adicione a variável de ambiente `RUNSPECT_API_URL` com a URL pública do
   backend, por exemplo `https://api.exemplo.com`, nos ambientes **Preview** e
   **Production**.
6. Faça o deploy e teste o botão de execução.

`RUNSPECT_API_URL` é usada pelo rewrite do Next.js; não inclua `/api` no valor,
pois o caminho `/api/:path*` é acrescentado automaticamente.

### Deploy gratuito do backend no Render

O projeto já inclui [`backend/Dockerfile`](../backend/Dockerfile). No
[Render](https://dashboard.render.com/), crie um **New Web Service**, conecte
o mesmo repositório e configure:

- **Root Directory:** `backend`
- **Runtime:** `Docker`
- **Instance Type:** `Free`
- **Health Check Path:** `/healthz`

Adicione estas variáveis no Render:

```bash
RUNSPECT_ALLOWED_ORIGINS=https://seu-projeto.vercel.app
```

O backend detecta automaticamente a variável `PORT` fornecida pelo Render.
Depois do primeiro deploy, copie a URL `https://...onrender.com` para a
variável `RUNSPECT_API_URL` na Vercel e faça um novo deploy.

O plano gratuito pode suspender o serviço após inatividade; a primeira
execução depois disso pode demorar aproximadamente um minuto. Para uma
demonstração entre amigos, isso costuma ser aceitável. Não defina
`RUNSPECT_SANDBOX=off`: o backend compila e executa código enviado por
qualquer visitante.

Consulte a [documentação do Next.js sobre deploy](https://nextjs.org/docs/app/building-your-application/deploying)
para detalhes adicionais.
