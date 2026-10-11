# Benchmark do runner C++

Execute em `backend` com os mesmos compiladores, limites e recursos do deploy:

```sh
/usr/bin/python3 pkg/visualizer/prepare_cpp_cache.py /tmp/runspect-cpp-cache \
  --runtime "$PWD/.runtime/clang"
GOCACHE=/tmp/runspect-go-cache go run ./cmd/benchmark \
  -iterations 100 -compiler-cache /tmp/runspect-cpp-cache \
  -output /tmp/runspect-benchmark.json
```

O cache também pode ser selecionado por `RUNSPECT_CPP_CACHE`. `-header` permite
selecionar o runtime de visualização usado no deploy. O sandbox permanece ligado
por padrão; `-sandbox=false` serve para diagnosticar as fixtures do repositório
em uma máquina local sem suporte a bubblewrap. Esse resultado deve ser repetido
com sandbox antes de orientar limites ou capacidade do deploy.

O comando respeita os mesmos `RUNSPECT_*` do servidor para timeout de compilação
e análise, memória, stack, eventos e limites de cache. Os metadados registram os
valores efetivos. `RUNSPECT_SANDBOX=off` não muda o padrão do benchmark: use a flag
explícita apenas para as fixtures locais.

Na imagem Docker, execute `/app/runspect-benchmark` a partir de `/app`; as
fixtures e PCHs já estão incluídos. CPU e RSS são recolhidos pelo helper Python
`measure_compile.py` dentro do sandbox, após aguardar GCC e seus filhos.
O hash do helper aparece nos metadados. Caso Python/helper não esteja presente,
a compilação continua com recursos marcados como incompletos.

O comando compara três cenários sequenciais: sem PCH nem cache binário, com PCH
e sem cache binário, e com PCH e cache binário aquecido. Cada cenário usa os
mesmos fontes e entradas de bubble sort e KMP. No cenário aquecido, a primeira
entrada medida difere da entrada de aquecimento; as demais alternam entre dois
casos. Toda execução confere o stdout esperado para identificar saída antiga
ou mudanças de comportamento.

O JSON inclui amostras, percentis p50/p95/p99 de tempo total e etapas, taxa de
sucesso, fallback, hit rate, tentativas de compilação, CPU e pico de RSS do
compilador, tamanho dos PCHs/cache em disco, versão dos compiladores, Go, CPU,
memória e limites de cgroup disponíveis. Os logs de progresso vão para stderr,
e o JSON para stdout e para o arquivo opcional.

Os percentis usam nearest rank e somente execuções bem sucedidas com saída
correta e métricas disponíveis. Falhas, saídas incorretas e métricas ausentes
ficam explícitas nos contadores e amostras. O aquecimento aparece separado e
não entra nos percentis. CPU e RSS do compilador consideram apenas amostras
válidas que tentaram compilar; hits de cache não entram nessa distribuição.
Tentativas encerradas com recursos incompletos também são excluídas de CPU/RSS
e contam em `compile_resources_incomplete_samples`; suas latências continuam
presentes.
Com menos de 100 amostras por fixture, p95/p99 descrevem uma amostra pequena.

`analysis_scenarios` compara também a análise de capacidades com PCH e cache
de análise desligado contra o mesmo caminho com cache aquecido. Essas amostras
chamam `Analyze`, sem compilar nem executar o programa. O aquecimento fica
separado, e a taxa de cache e p50/p95/p99 usam somente as amostras medidas.

PCHs são preparados fora da medição e precisam ser gerados com o mesmo toolchain
e opções de compilação do runner. Ter arquivos `.pch`/`.gch` não comprova seu
uso: GCC pode ignorar PCH incompatível, e a análise pode usar fallback. Confira
as etapas e os avisos antes de atribuir um ganho ao PCH. Os cenários com cache
desligado medem misses do cache binário; não limpam os caches de disco do sistema.

Use os percentis por fixture para evitar que a mistura de algoritmos oculte a
cauda, compare hits e misses separadamente e acompanhe falhas/fallback junto da
latência. Rode sem outras compilações simultâneas para uma comparação útil.
O comando retorna código de saída 1 em falhas/saída incorreta, preservando o JSON.
