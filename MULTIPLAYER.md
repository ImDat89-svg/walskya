# Publicar jogo e multiplayer na Vercel

O site estático e o endpoint WebSocket agora fazem parte do mesmo projeto:

- `index.html`, `assets/`, `models/` e `audio/`: jogo e recursos estáticos.
- `api/ws.js`: endpoint multiplayer `wss://seu-projeto.vercel.app/api/ws`.
- `vercel.json`: duração máxima de cinco minutos por conexão WebSocket; o jogo reconecta automaticamente.

## Publicar

1. Envie esta pasta do projeto para um repositório GitHub.
2. Na Vercel, escolha **Add New → Project** e importe esse repositório.
3. Use a pasta raiz como **Root Directory**, o preset **Other** e deixe o comando de build e o diretório de saída vazios. Não configure o subdiretório `multiplayer-server` como projeto separado.
4. Clique em **Deploy**. Abra o endereço HTTPS gerado pela Vercel.
5. No jogo, abra **JOGAR ONLINE**, escolha um nick e conecte. Em sites publicados, o endereço padrão é detectado como `wss://<seu-domínio>/api/ws`.

WebSockets em Vercel Functions estão em beta e exigem Fluid Compute. Em projetos Vercel antigos, habilite Fluid Compute em **Settings → Functions** e faça um novo deploy. Como uma conexão pode terminar ao atingir a duração máxima da função, clientes reconectam automaticamente.

## Executar localmente

Requer Node.js 18 ou superior:

```sh
cd multiplayer-server
npm install
npm start
```

O servidor local escuta a porta definida pela variável `PORT` (ou `3002`) e fornece `GET /health`. Em uma página aberta pelo próprio computador, o painel usa `ws://localhost:3002/ws`.

## Limites atuais

A sala comporta até 32 jogadores **por instância**; nicks e posições não são persistidos. Na Vercel, a memória é local a cada instância de função. Para um jogo de teste pequeno, os clientes podem se encontrar na mesma instância; para garantir uma sala compartilhada quando a Vercel escalar para várias instâncias, será necessário adicionar armazenamento/pub-sub compartilhado, por exemplo Redis. O projeto não tem login, chat ou progresso multiplayer.
