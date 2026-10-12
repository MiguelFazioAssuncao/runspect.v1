# Runspect

Laboratório para aprender programação competitiva observando a execução de programas C++17. O frontend Next.js exibe a linha executada, vetores, grafos, matrizes, chamadas, objetos e saída do programa. O backend Go analisa, compila e executa o código com limites de recursos.

## Para estudar

1. Abra **técnicas** e escolha um dos 35 exemplos. A busca aceita palavras sem acento.
2. Abra **Como estudar esta técnica**: leia quando usar, o que observar, erros comuns e uma experiência para fazer.
3. Clique em **Executar Algoritmo**, escolha os painéis e avance pela linha do tempo. No editor completo, `Ctrl+Enter` / `⌘+Enter` também inicia a execução.
4. Compare a saída com a referência. A comparação só vale para a entrada original e não substitui testes de correção; alguns problemas admitem várias respostas válidas.
5. Marque as técnicas que já consegue explicar e continue uma das cinco trilhas.

O código e a entrada da aba **seu código**, além do progresso de estudo, são salvos no navegador com uma pausa de 400 ms após a edição. Ao sair da página, as alterações pendentes são gravadas. **Baixar projeto** exporta o código e a entrada da aba atual junto com o progresso; **Abrir projeto** restaura esse arquivo. Edições de exemplos permanecem durante a sessão, mas precisam ser exportadas para sobreviver ao recarregamento. O armazenamento é local ao navegador, não uma conta na nuvem. Abas diferentes mantêm rascunhos independentes em memória e a última gravação determina o rascunho recuperado.

## Desenvolvimento local

Requisitos: Node.js 22+, npm, Go 1.24.4+, GCC com C++17, Python 3 com bindings de Clang, bubblewrap e util-linux. O executor usa recursos do Linux; no Windows use WSL2. No macOS, execute o backend em Linux/VM com suporte aos namespaces necessários. O frontend pode rodar separadamente em qualquer sistema compatível com Node.

Em Debian/Ubuntu, as ferramentas do executor são fornecidas por `g++`, `python3-clang`, `bubblewrap` e `util-linux`. A execução isolada também depende de namespaces de usuário habilitados pelo sistema.

Em um terminal:

```sh
cd backend
go run ./cmd/server
```

Em outro:

```sh
cd frontend
npm ci
npm run dev
```

Acesse `http://localhost:3000`. O Next encaminha `/api/*` e `/healthz` para `http://127.0.0.1:8080`. Nenhuma chave de API é necessária. O template e os exemplos usam `bits/stdc++.h`; a exponenciação modular também usa `__int128`, extensões atendidas pelo GCC do executor.

O Monaco é uma dependência local: `predev` e `prebuild` copiam sua distribuição para `public/monaco`. Não edite esses arquivos gerados. Fontes do sistema eliminam downloads de fontes no build. Se o editor completo não carregar, **Usar editor simples** mantém a edição de texto disponível. Executar C++ continua exigindo acesso ao backend; isso não é um executor offline no navegador.

## Configuração e publicação

| Variável | Uso | Padrão |
| --- | --- | --- |
| `RUNSPECT_API_URL` | Destino do proxy do Next; definir antes do build | `http://127.0.0.1:8080` |
| `NEXT_PUBLIC_RUNSPECT_API_URL` | URL pública do backend para hospedagem estática | vazio (mesma origem) |
| `NEXT_PUBLIC_BASE_PATH` | Subdiretório, incluindo `/` inicial, como `/runspect` | vazio |
| `GITHUB_PAGES` | `true` gera o site estático em `frontend/out` | desativado |
| `RUNSPECT_ADDR` | Endereço de escuta do backend | `127.0.0.1:8080` |
| `PORT` | Porta do backend quando `RUNSPECT_ADDR` não é definido | não definido |
| `RUNSPECT_ALLOWED_ORIGINS` | Origens CORS separadas por vírgula | localhost e 127.0.0.1 na porta 3000 |
| `RUNSPECT_MAX_CONCURRENT` | Execuções/análises simultâneas | metade das CPUs, mínimo 1 |
| `RUNSPECT_COMPILE_TIMEOUT_SEC` | Tempo por tentativa de compilação | 10 |
| `RUNSPECT_ANALYSIS_TIMEOUT_SEC` | Tempo de análise Clang | 30 |
| `RUNSPECT_SANDBOX` | `off` somente para desenvolvimento com código confiável | isolamento ativado |

O Dockerfile do backend configura limites próprios para o ambiente de hospedagem. Containers precisam de suporte aos namespaces do bubblewrap; desativar o isolamento não é uma solução para executar código público.

Para servir o frontend com Node:

```sh
cd frontend
npm run build
npm start
```

Se o ambiente não permitir os subprocessos/portas internos do Turbopack, `npm run build -- --webpack` usa o compilador alternativo. Para GitHub Pages, o workflow existente configura a exportação estática e a URL pública do backend. O caminho local do Monaco respeita `NEXT_PUBLIC_BASE_PATH`.

## Verificação

```sh
cd frontend
npm run lint
npx tsc --noEmit
npm test
npm run build
```

```sh
cd backend
go test ./...
```

Testes com compilador: `cd frontend && npm run test:cpp`. Para testar também a instrumentação dos exemplos, defina `RUNSPECT_TEST_AUTOMATIC=1`. Os testes Go que exercitam isolamento precisam de um ambiente onde bubblewrap possa criar namespaces.

`npm run test:study` inicia servidores locais temporários, usa Chromium e verifica o editor Monaco real, salvamento após recarregar, entrada isolada por aba, busca sem acentos, execução C++, saída esperada, importação/exportação, cancelamento e layout móvel. Requer o módulo `playwright` disponível ou `PLAYWRIGHT_MODULE` apontando para seu `index.mjs`; `CHROMIUM` pode definir o binário (padrão `/usr/bin/chromium`). `RUNSPECT_SCREENSHOTS` define onde guardar capturas. Esse teste usa somente programas confiáveis em um backend temporário sem namespaces.

## Próximas evoluções

- Exercícios com múltiplos casos e validadores específicos para problemas com várias saídas válidas; a comparação atual é apenas com uma amostra.
- Breakpoints e acompanhamento de expressões escolhidas pelo aluno, além da linha e das estruturas já capturadas.
- Traços de demonstração pré-calculados para explorar o catálogo sem esperar uma compilação.
- Medir a análise de grafos e o desenho em entradas grandes e mover cálculos pesados para um Web Worker quando necessário.
- Mais linguagens exigem executores e instrumentadores próprios. Hoje C++17 é a linguagem suportada, e nem toda construção C++ produz uma visualização automática; o terminal informa limitações.
- Revisão de dependências: o audit desta revisão indicou avisos em `braces` (cadeia de lint) e `dompurify` (via Monaco). Não aplicar `npm audit fix --force` sem revisar: o comando propôs trocar versões principais de Next/Monaco.
