# Runspect frontend

Frontend Next.js do Runspect. O backend Go precisa estar rodando separadamente
porque compila e executa C++17 com `g++` e sandbox do sistema operacional.

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
