# Runspect frontend

Frontend Next.js do Runspect. O backend Go precisa estar rodando separadamente
porque compila e executa C++17 com `g++` e sandbox do sistema operacional.

Código C++ comum recebe visualização automática de variáveis, vetores,
strings, matrizes, registros públicos, objetos e ponteiros. Representações
usuais de grafos também são reconhecidas.
Código com chamadas `viz::` mantém a visualização manual.

O catálogo **técnicas** contém 35 programas C++17 independentes, sem chamadas
`viz::` nem dependência de `visualizer.h`. Todos usam o mesmo template
competitivo do editor: `#define endl '\n'`, `using ll = long long`,
`solve()` e `signed main()` com entrada/saída rápida. Cada técnica documenta
entrada, saída e complexidades. A visualização é gerada automaticamente pelo
backend, sem alterar o programa mostrado no editor.

Novas técnicas: reversão de lista ligada, inserção e percurso em BST, trie
com contagem de prefixos, árvore de Huffman, insertion sort genérico,
fatorial `constexpr`, avaliação de expressão pós-fixa com exceções, Euclides
com `goto` e LCS com tabela de strings.

O painel **Objetos e ponteiros** permite alternar entre ligações e campos,
inspecionar referências compartilhadas/cíclicas e identificar destinos
desconhecidos ou liberados. Vetores e objetos grandes são paginados. O
seletor **Captura da visualização** oferece até 10.000 passos e 2.048 elementos
por estrutura, mantendo os limites de execução do backend.

Para compilar todos os exemplos com `g++` e conferir as saídas e os casos de
borda, execute `npm run test:cpp`. Para verificar também a instrumentação,
com as dependências Clang do backend instaladas, execute
`RUNSPECT_TEST_AUTOMATIC=1 npm run test:cpp` (Linux).

`npm test`, `npx tsc --noEmit` e `npm run lint` verificam o frontend.
`npm run test:resources` verifica os novos exemplos, a API Go real,
reprodução, exceções, paginação e viewport móvel com Chromium. Informe
`PLAYWRIGHT_MODULE=/caminho/playwright/index.mjs` se o pacote não estiver
instalado localmente. O harness substitui o editor Monaco por textarea;
workspace, painéis e player são os componentes reais. Opcionalmente,
`RUNSPECT_SCREENSHOTS=/tmp/evidencias` salva capturas. Apenas as fixtures
revisadas desse teste usam o backend local com sandbox desativado.

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

## Deploy do frontend no GitHub Pages

O workflow [deploy-pages.yml](../.github/workflows/deploy-pages.yml) exporta o
frontend como arquivos estáticos e publica o resultado no GitHub Pages a cada
push para `main`. O build calcula o caminho do repositório automaticamente.

1. Em **Settings → Pages → Build and deployment**, selecione **GitHub Actions**.
2. Se o backend estiver publicado, abra **Settings → Secrets and variables →
   Actions → Variables** e crie `RUNSPECT_API_URL` com a URL pública do backend,
   por exemplo `https://api.exemplo.com` (sem `/api` no final).
3. Faça push para `main` ou execute o workflow em **Actions → Deploy GitHub
   Pages → Run workflow**.

O endereço do site será `https://miguelfazioassuncao.github.io/runspect.v1/`.
Sem `RUNSPECT_API_URL`, a interface abre, mas execução e análise de código
ficam indisponíveis porque o GitHub Pages não executa o backend Go.

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
RUNSPECT_ALLOWED_ORIGINS=https://miguelfazioassuncao.github.io
```

O backend detecta automaticamente a variável `PORT` fornecida pelo Render.
Depois do primeiro deploy, copie a URL `https://...onrender.com` para a variável
`RUNSPECT_API_URL` do repositório e execute novamente o workflow do GitHub Pages.

O plano gratuito pode suspender o serviço após inatividade; a primeira
execução depois disso pode demorar aproximadamente um minuto. Para uma
demonstração entre amigos, isso costuma ser aceitável. Não defina
`RUNSPECT_SANDBOX=off`: o backend compila e executa código enviado por
qualquer visitante.

Consulte a [documentação do Next.js sobre deploy](https://nextjs.org/docs/app/building-your-application/deploying)
para detalhes adicionais.
