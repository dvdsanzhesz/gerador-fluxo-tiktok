# Gerador do Fluxo "/cursos" do TikTok — projeto independente

Site próprio (separado do cess-hub) que monta o fluxo do TikTok automaticamente
a partir do calendário de aberturas.

- **Segunda:** semana atual + 1ª divulgação (+7) + 2ª divulgação (+14)
- **Quarta:** só 1ª e 2ª divulgação
- Login com o mesmo e-mail/senha do CESS Hub (necessário pra ler o calendário)
- Gera o JSON no formato de **copiar/colar (Ctrl+V) do editor do UnniChat**

## Arquivos

```
index.html                    ← página única (login + gerador)
js/app.js                     ← lógica da página
js/firebase-config.js         ← conexão com o Firebase do Hub
js/gerador-fluxos-dados.js    ← busca de aberturas (mesmo código do Hub)
js/gerador-tiktok-core.js     ← montagem do fluxo (textos/telefones em CONFIG_TIKTOK)
```

## Publicar na sua conta do GitHub (passo a passo)

1. Entre em https://github.com e faça login (ou crie sua conta gratuita).
2. Canto superior direito → **+** → **New repository**.
3. Nome: `gerador-fluxo-tiktok` (ou o que quiser) → deixe **Public** →
   marque **Add a README file** → **Create repository**.
4. No repositório: **Add file → Upload files** → arraste o `index.html`,
   a pasta `js` inteira e este `LEIA-ME.md` → **Commit changes**.
5. Ative o site: **Settings → Pages** (menu lateral) → em "Branch" escolha
   **main** e pasta **/(root)** → **Save**.
6. Aguarde 1–2 minutos e recarregue a página do Pages — o endereço aparece lá em cima,
   algo como: `https://SEU-USUARIO.github.io/gerador-fluxo-tiktok/`

Pra atualizar o site depois, é só repetir o passo 4 com os arquivos novos.

> Se o login der erro de domínio: no console do Firebase (projeto cess-hub) →
> **Authentication → Settings → Authorized domains** → adicione
> `SEU-USUARIO.github.io`. (Normalmente não precisa pra login com e-mail/senha.)

## Como usar

1. Abra o site → faça login.
2. Confira o modo (detecta sozinho segunda/quarta) e as semanas → **Buscar Cursos**.
3. Tire da lista o que não deve entrar (clique no chip) → **Gerar Fluxo do TikTok**.
4. **📋 Copiar** → no UnniChat, abra o fluxo "/cursos" do TikTok, apague os nós antigos
   (menos o gatilho inicial), clique no quadro e cole (**Ctrl+V**).
5. Ligue o gatilho inicial ao nó de entrada (o que adiciona as tags
   `Fluxo de inscrição` + `[NICOLE] - TIKTOK /CURSOS`).

## Atenções (o site também avisa na tela)

- Cursos da **Cessetembro 1** viram nó "Encaminhar para automação" — depois de colar,
  abra cada um e selecione o fluxo de inscrição do curso (o aviso diz o nome).
- Nomes com **+24 caracteres** têm o título cortado na lista (limite do WhatsApp).
- Semanas com **+10 cursos** são quebradas em mais de uma lista automaticamente.
