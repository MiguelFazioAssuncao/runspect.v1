# Runspect

Um laboratório para estudar programação competitiva vendo o código C++ rodar, passo a passo.

Comecei o Runspect porque, estudando algoritmos, eu perdia muito tempo enchendo o código de `cout` só para entender o que estava acontecendo com um vetor ou com uma BFS. A ideia aqui é o contrário: você escreve (ou escolhe) um programa C++17, executa, e acompanha a linha atual, os vetores, grafos, matrizes, a pilha de chamadas e a saída, tudo numa linha do tempo que dá para avançar e voltar.

🔗 **Demo:** https://miguelfazioassuncao.github.io/runspect.v1/

> O backend fica num plano gratuito do Render. Se for a primeira execução depois de um tempo parado, ele pode levar alguns segundos para acordar.

## Como eu uso para estudar

1. Na aba **técnicas** escolho um dos 35 exemplos (a busca ignora acentos, então "arvore" acha "árvore").
2. Leio o **Como estudar esta técnica**: quando usar, o que observar, os erros mais comuns e um experimento para fazer.
3. Clico em **Executar Algoritmo** (ou `Ctrl+Enter` / `⌘+Enter` no editor), escolho os painéis e vou avançando na linha do tempo.
4. Comparo a saída com a referência. Atenção: isso vale só para a entrada de exemplo e não prova que a solução está certa. Tem problema que aceita mais de uma resposta.
5. Marco o que já consigo explicar sem olhar e sigo uma das cinco **trilhas de estudo**.

As abas **seu código** e **técnicas** também funcionam com as setas do teclado, `Home` e `End`.

### Onde ficam os dados

Não tem conta nem nuvem. Código, entrada, rascunhos de cada técnica e progresso ficam no `localStorage` do navegador, salvos 400 ms depois da última edição (e também ao fechar a página).

- **Restaurar exemplo** apaga só o rascunho da técnica aberta.
- **Baixar projeto** gera um arquivo com o código, a entrada, os rascunhos e o progresso. **Abrir projeto** restaura esse arquivo (projetos antigos continuam funcionando).
- O arquivo tem limite de 512 KiB. Se algo passar do limite, o site avisa e mantém a última versão válida.
- Abas diferentes não se sincronizam: quem salvar por último ganha.

## Como funciona

```
frontend/  Next.js + React, Monaco, D3   → interface, editor e visualizações
backend/   Go                            → analisa, instrumenta, compila e executa o C++
```

O backend recebe o código, usa o Clang (via `python3-clang`) para descobrir o que vale a pena rastrear, injeta as chamadas do `visualizer.h`, compila com `g++` e roda o binário isolado com `bubblewrap` + `prlimit`. Os eventos voltam como JSON e o frontend transforma isso em quadros.

Alguns detalhes que deram trabalho e valem saber:

- **Headers pré-compilados.** O `bits/stdc++.h` é pré-compilado na imagem Docker (`prepare_cpp_cache.py`). Sem isso, cada compilação no Render demorava bem mais.
- **Cache.** Binários e análises são guardados em memória (LRU), então rodar o mesmo código de novo é quase instantâneo.
- **Limites.** 30 s por tentativa de compilação, 3 s de execução, 512 MiB de memória, 64 KiB de stdin. Se der erro no meio, a saída parcial e os passos já capturados continuam visíveis.
- **Respostas comprimidas.** Traços grandes vão com gzip, o que faz muita diferença na conexão até o Render.
- **Nem todo C++ vira desenho.** A instrumentação automática cobre bastante coisa, mas não tudo; quando não dá, o terminal explica o motivo.

## Rodando localmente

Vai precisar de: Node.js 22+, Go 1.24+, `g++` com C++17, Python 3 com `python3-clang`, `bubblewrap` e `util-linux`.

O executor depende de namespaces do Linux. No Windows use WSL2; no macOS rode o backend numa VM Linux. O frontend roda em qualquer lugar.

```sh
# Debian/Ubuntu
sudo apt install g++ python3-clang bubblewrap util-linux
```

Backend:

```sh
cd backend
go run ./cmd/server
```

Frontend, em outro terminal:

```sh
cd frontend
npm ci
npm run dev
```

Abra http://localhost:3000. O Next repassa `/api/*` e `/healthz` para `http://127.0.0.1:8080`, então não precisa configurar nada.

> Se o seu sistema não deixa o bubblewrap criar namespaces, dá para usar `RUNSPECT_SANDBOX=off` **só** para desenvolvimento, com código em que você confia.

O Monaco é servido localmente: o `predev`/`prebuild` copia só o necessário para editar C++ em `public/monaco` (sem os workers de TypeScript, CSS, HTML e JSON, que o projeto não usa). Não edite essa pasta. Se o editor não carregar, o botão **Usar editor simples** troca por um `textarea`.

## Deploy

| Parte | Onde | Como |
| --- | --- | --- |
| Frontend | GitHub Pages | `.github/workflows/deploy-pages.yml`, a cada push na `main` ou `v1` que mexa em `frontend/` |
| Backend | Render (Docker) | `render.yaml` + `backend/Dockerfile`, só rebuilda quando `backend/` muda |

O que deixei mais rápido no deploy:

- **Pages:** lint e testes rodam em paralelo com o build, o cache do `.next` é reaproveitado entre execuções, e o Monaco enviado caiu de ~25 MB para ~6 MB.
- **Docker:** a imagem não leva mais o binário de benchmark nem os scripts de build; o Go compila com cache do BuildKit e `-trimpath -ldflags="-s -w"`; as camadas mais pesadas (apt e PCH) ficam no topo para o cache pegar.
- **Render:** `buildFilter` evita rebuild do backend quando só o frontend muda, e o `healthCheckPath` faz o deploy só trocar de versão quando o servidor novo já responde.

Para publicar num fork, crie a variável de repositório `RUNSPECT_API_URL` com a URL pública do backend e ajuste `RUNSPECT_ALLOWED_ORIGINS` no `render.yaml`.

### Variáveis de ambiente

| Variável | Para quê | Padrão |
| --- | --- | --- |
| `RUNSPECT_API_URL` | Destino do proxy do Next (definir antes do build) | `http://127.0.0.1:8080` |
| `NEXT_PUBLIC_RUNSPECT_API_URL` | URL pública do backend no site estático | vazio (mesma origem) |
| `NEXT_PUBLIC_BASE_PATH` | Subdiretório, ex.: `/runspect` | vazio |
| `GITHUB_PAGES` | `true` gera o site estático em `frontend/out` | desligado |
| `RUNSPECT_ADDR` | Endereço do backend | `127.0.0.1:8080` |
| `PORT` | Porta, se `RUNSPECT_ADDR` não estiver definido | — |
| `RUNSPECT_ALLOWED_ORIGINS` | Origens CORS, separadas por vírgula | localhost:3000 |
| `RUNSPECT_TRUST_PROXY` | `true` usa o `X-Forwarded-For` no rate limit (atrás de proxy, como no Render) | desligado |
| `RUNSPECT_RATE_PER_MIN` | Execuções por minuto por IP | 60 |
| `RUNSPECT_MAX_CONCURRENT` | Execuções simultâneas | metade das CPUs |
| `RUNSPECT_COMPILE_TIMEOUT_SEC` | Tempo por tentativa de compilação | 30 |
| `RUNSPECT_ANALYSIS_TIMEOUT_SEC` | Tempo da análise com Clang | 30 |
| `RUNSPECT_SANDBOX` | `off` desliga o isolamento (só em dev!) | ligado |

## Testes

```sh
cd frontend
npm run lint && npx tsc --noEmit && npm test && npm run build
```

```sh
cd backend
go test ./...
```

Outros que uso de vez em quando:

- `npm run test:cpp` testa os exemplos com o compilador de verdade (`RUNSPECT_TEST_AUTOMATIC=1` inclui a instrumentação automática).
- `npm run test:study` sobe servidores temporários e testa a interface inteira no Chromium: editor, rascunhos, trilhas, busca, execução, importação/exportação e layout mobile. Precisa do `playwright` (ou `PLAYWRIGHT_MODULE`) e do Chromium (`CHROMIUM`, padrão `/usr/bin/chromium`).
- `npm run test:proxy` confere que o proxy do Next aguenta respostas que levam mais de 30 s.

Os testes Go do sandbox precisam de um ambiente onde o bubblewrap consiga criar namespaces.

## O que ainda quero fazer

- Exercícios com vários casos de teste e validadores para problemas com mais de uma resposta.
- Breakpoints e "watch" de expressões escolhidas por quem está estudando.
- Traços pré-calculados para os exemplos, para dar para explorar sem esperar compilação.
- Mover a análise de grafos grandes para um Web Worker.
- Outras linguagens além de C++17 (cada uma precisa do seu próprio instrumentador).

---

Feito por [Miguel Fazio](https://github.com/MiguelFazioAssuncao).
