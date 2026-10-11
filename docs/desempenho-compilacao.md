# Tempo de compilação e métricas de deploy

O runner mantém GCC `-O0 -pipe -std=c++17` e os headers pré-compilados (PCH)
gerados pelo Dockerfile. A otimização desta entrega amplia o LRU de binários
de 8 para 64 entradas, mantendo o teto de 16 MiB, e adiciona um cache de
análises bem-sucedidas. Códigos distintos que antes eram expulsos pelo teto
de 8 entradas podem continuar sendo reutilizados enquanto houver espaço.
Toda execução roda novamente o binário com o stdin atual e os limites normais.

## Métricas disponíveis

`POST /api/run` retorna `metrics` também em erros:

| Campo | Interpretação |
| --- | --- |
| `total_ms` | Tempo completo do runner, incluindo preparação e limpeza. |
| `prepare_ms` | Verificação de ferramentas, arquivos e chave do cache. |
| `analysis_ms` | Instrumentação; no modo manual explícito, apenas a detecção local. |
| `compile_ms` | Soma de todas as tentativas de GCC, incluindo fallback. |
| `fallback_compile_ms` | Parcela da compilação usada pela segunda tentativa com o original. |
| `execute_ms` | Execução do binário e leitura dos eventos/saída. |
| `compile_cpu_ms` | CPU do compilador e filhos recolhidos pelo processo. |
| `compile_max_rss_kb` | Maior pico de RSS reportado por uma tentativa no Linux; não é a soma de memória de todos os processos. |
| `compile_resources_complete` | Falso quando timeout/sinal impede recolher todos os recursos dos filhos. |
| `compile_attempts`, `fallback` | Duplicação de compilação ou execução sem visualização automática. |
| `compile_timeouts`, `analysis_timeout`, `execute_timeout`, `failed_stage` | Timeouts e etapa da falha, sem registrar mensagens do código do usuário. |
| `cache_hit` | O binário foi reutilizado, sem AST nem GCC. |
| `cache_entries`, `cache_bytes`, `cache_evictions` | Ocupação atual e evicções acumuladas desde o início do processo. |

`time_ms` conserva o total inteiro da API. Em cache hit, `analysis_ms`,
`compile_ms` e `compile_attempts` são zero. As etapas não cobrem finalização
dos eventos, cópia do binário e limpeza; sua soma pode ser inferior ao total.
`POST /api/analyze` acrescenta `time_ms` e `cache_hit` e nunca executa código.

Os logs JSON `cpp_run` e `cpp_analysis` registram esses dados sem fonte,
entrada ou saída do usuário. `cpp_request` acrescenta status HTTP e duração,
incluindo rejeições por limite de requisições (429) e servidor ocupado (503).
`/healthz` não gera esse log. O header `Server-Timing` de `/api/run` apresenta
as durações de preparação, análise, compilação e execução.

## Como comparar

Use **p50 e p95 por etapa**, separados por algoritmo, modo de trace e
cache hit/miss. Observe p99 somente com uma amostra suficiente; os valores
do benchmark local não definem um SLA do provedor. Compare também taxa de
sucesso, fallback, timeouts, acertos, evicções e rejeições 503/429. Uma redução
de latência acompanhada de mais falhas não significa uma melhoria.

CPU e RSS ajudam a escolher limites de memória e concorrência. Exclua recursos
com `compile_resources_complete=false` dessa distribuição. Um pico de RSS
de uma tentativa não mede o consumo total do container: Go, AST/Python,
caches, processos sobrepostos e memória do sistema também consomem recursos.
O limite `--as` de compilação restringe memória virtual, não RSS.
Um helper Python mede o GCC dentro do sandbox com `wait4`; os números do
supervisor externo do bubblewrap não representam os recursos do compilador.
Quando Python/helper não estiver disponível, a compilação continua e os
recursos são marcados como incompletos.

O benchmark sequencial usa bubble sort e KMP com entradas alternadas e
stdout esperado. Compara sem PCH/sem cache binário, PCH/sem cache binário,
PCH/cache binário aquecido e análise com/sem cache. O aquecimento é reportado
separadamente; falhas permanecem no relatório. O cache do sistema operacional
não é limpo. Rode sem outras compilações e repita no ambiente do deploy.

Na imagem Docker, a ferramenta e as duas fixtures já estão disponíveis:

```sh
cd /app
./runspect-benchmark -iterations 100 -output /tmp/runspect-benchmark.json
```

Em desenvolvimento, gere PCHs para o toolchain local e execute a partir de
`backend`; veja as instruções e opções em
[cmd/benchmark/README.md](../backend/cmd/benchmark/README.md).
O sandbox fica ligado por padrão. Execuções com sandbox desligado servem
apenas como diagnóstico local das fixtures confiáveis.

## Resultado local

O [relatório JSON](evidencias/benchmark-compilacao.json) foi gerado sequencialmente
com sandbox ligado, GCC 14.2, Intel i5-1235U e cinco amostras por fixture/cenário.
Todos os casos tiveram sucesso, stdout correto e nenhum fallback. Os percentis
p95/p99 desta amostra são exploratórios e não representam a cauda do deploy.

| Fixture/caminho | Total p50 (ms) | Total p95 (ms) | GCC p50 (ms) |
| --- | ---: | ---: | ---: |
| Bubble sort, sem PCH/cache | 4.868,48 | 4.910,37 | 3.409,04 |
| Bubble sort, PCH sem cache binário | 2.700,78 | 2.726,31 | 2.408,53 |
| Bubble sort, binário em cache | 17,69 | 25,10 | 0 |
| KMP, sem PCH/cache | 5.038,54 | 5.096,88 | 3.516,33 |
| KMP, PCH sem cache binário | 2.975,66 | 3.004,62 | 2.660,32 |
| KMP, binário em cache | 20,35 | 22,65 | 0 |

O novo cache de análise reduziu o p50 de `Analyze` de **263,10 para 0,24 ms**
no bubble sort e de **283,31 para 0,28 ms** no KMP. Ambos os caches aquecidos
atingiram 100% de acertos nas amostras. O caminho de cache binário já existia;
a ampliação do limite por entradas permite reter mais programas diferentes,
sem prometer acelerar o primeiro GCC de cada fonte.

Com PCH, a compilação registrou p50 de CPU de 2.524,10/2.791,79 ms e pico de
RSS de 311,56/324,86 MiB (bubble/KMP). O cache PCH em disco ocupou 127,31 MiB.
Nenhuma amostra teve recursos incompletos. Esses valores são do toolchain
local; repita no container/provedor antes de alterar memória ou concorrência.

## Configuração

| Variável | Padrão do Docker | Uso |
| --- | --- | --- |
| `RUNSPECT_CPP_CACHE` | `/app/.compiler-cache` | PCHs somente leitura, gerados no build. |
| `RUNSPECT_BINARY_CACHE_MB` | `16` | Orçamento de binários em MiB; zero desativa. |
| `RUNSPECT_BINARY_CACHE_ENTRIES` | `64` | Teto de entradas; zero desativa. |
| `RUNSPECT_ANALYSIS_CACHE_ENTRIES` | `64` | Teto de análises; zero desativa. |
| `RUNSPECT_MAX_CONCURRENT` | `1` | Limite de solicitações simultâneas no servidor. |
| `RUNSPECT_COMPILE_MEMORY_MB` | `2048` | Memória virtual por processo na compilação/análise. |
| `RUNSPECT_COMPILE_TIMEOUT_SEC` | `30` | Orçamento de uma tentativa de GCC. |
| `RUNSPECT_ANALYSIS_TIMEOUT_SEC` | `30` | Orçamento de análise/instrumentação. |

Caches são locais à instância e somem no restart. PCHs precisam de rebuild
quando toolchain/headers mudarem. A imagem inclui o benchmark, mas ele roda
somente quando chamado explicitamente e não durante a inicialização.
Depois de reconstruir a imagem, confirme o resultado no provedor com o mesmo
limite de CPU/memória. Suspensão do serviço, rede, build e download da imagem
são custos separados do tempo de compilação do código enviado.

Referência das condições de uso de PCH:
[documentação oficial do GCC](https://gcc.gnu.org/onlinedocs/gcc/Precompiled-Headers.html).
Coleta de recursos: [documentação de `os.wait4`](https://docs.python.org/3/library/os.html#os.wait4).
