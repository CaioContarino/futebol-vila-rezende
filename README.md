# Futebol Vila Rezende — lista de jogadores

> **CONFIGURAÇÃO PREENCHIDA (8/10/2026):** `firebase-config.js` já contém os dados do app Web `futebol-vila-rezende`, o e-mail `caio.contarino@gmail.com` e o UID administrativo enviado pelo organizador. O arquivo `database.rules.json` contém o mesmo UID. **Não é necessário copiar o trecho `<script type="module">` fornecido pelo Firebase**: o `app.js` já carrega os módulos necessários. Ainda é obrigatório habilitar **Anônimo** e **E-mail/senha** no Firebase Authentication e publicar as regras em **Realtime Database → Regras** (enviar o JSON para o repositório GitHub não publica as regras). Faça o upload dos arquivos extraídos do ZIP para a raiz do repositório no GitHub Pages. A conexão real depende desses serviços estarem corretamente habilitados.

Um site responsivo para até **16 jogadores**, com inscrição por nome, contador de vagas em tempo real, botão para cancelar a própria inscrição, informações do local e mapa interativo.

**Endereço:** Avenida Paulista, 1425 — Nova Piracicaba, Piracicaba/SP. **Dia:** toda segunda-feira. **Início:** 21:00. Há um mapa incorporado que pode ser movido/aproximado e um botão que abre o link do Google Maps fornecido pelo organizador.

**Data dinâmica da partida:** a seção **Local e Data** mostra a data exata da segunda-feira associada à lista atual (por exemplo, `12/10/2026`). A data é calculada pelo próprio navegador usando a mesma âncora semanal das inscrições. Na terça-feira às 00:00 (Piracicaba), muda para a segunda-feira seguinte, sem alterar o Firebase. Se o site estiver aberto durante a virada, a data atualiza na própria página.

**Renovação semanal:** toda terça às **00:00**, horário de Piracicaba. A aplicação escolhe automaticamente uma nova lista semanal e troca de lista sem necessidade de alguém apertar botões; o servidor Firebase valida que as gravações só ocorram na semana atual.

## Como funciona a desistência?

O site usa **autenticação anônima do Firebase**, sem exigir cadastro, e o Firebase identifica cada navegador por um ID exclusivo (`uid`).

1. Ao acessar o site, o Firebase cria uma identidade anônima para aquele navegador.
2. Quando a pessoa escreve o nome e confirma, o banco salva o registro em `players/UID`.
3. Se voltar ao **mesmo site, mesmo domínio e mesmo navegador**, o Firebase normalmente reconhece a identidade automaticamente.
4. A pessoa vê a confirmação com o botão **Desistir da lista**; ao confirmar, o registro dela é removido e uma vaga é liberada para todos imediatamente.

**Não depende de cookies tradicionais**: o Firebase Auth persiste o login no armazenamento local do navegador (geralmente IndexedDB ou localStorage). Se a pessoa usar outro celular, navegador, modo privado ou apagar dados do site, poderá perder essa identidade e não conseguirá cancelar o registro anterior sozinha. Nesse caso, o organizador precisa excluir a inscrição manualmente em **Firebase Console → Realtime Database → Dados → players**. Para permitir desistência entre dispositivos, seria preciso adicionar login recuperável, por exemplo, por e-mail.

**Limite de segurança:** pessoas diferentes usando o mesmo perfil do navegador compartilham essa identidade; além disso, o login anônimo não garante "uma pessoa real = uma vaga" (alguém pode abrir navegadores diferentes). O site limita a lista a 16 inscrições na interface e só autoriza cada usuário a remover o registro do próprio UID. **Atenção:** as regras do Realtime Database não têm método de contagem de filhos: a lotação de 16 ainda não é garantida de forma atômica no servidor. Se duas pessoas se inscreverem simultaneamente, poderá haver uma inscrição extra; para garantir rigidamente o limite, será necessária uma mudança no modelo de dados (16 vagas fixas) ou validação no backend.

## Configurar Firebase (antes de divulgar)

1. Abra https://console.firebase.google.com/ e crie um projeto. Um identificador possível é `futebol-vila-rezende` (se estiver disponível).
2. Em **Authentication → Sign-in method**, habilite **Anônimo**.
3. Em **Realtime Database**, crie um banco, de preferência inicialmente **bloqueado**. Guarde seu `databaseURL`.
4. **Antes de publicar as regras**, prepare a conta administrativa conforme a seção abaixo. O UID administrativo já está preenchido em `database.rules.json`. Vá a **Realtime Database → Regras** e clique em **Publicar**. O arquivo JSON sozinho, no repositório, não aplica as regras.
5. Em **Configurações do projeto → Seus apps → Web**, registre o aplicativo e copie o objeto `firebaseConfig`.
6. Neste pacote, `firebase-config.js` já contém os valores reais informados do projeto Web, incluindo `databaseURL`; confirme que apontam para o mesmo projeto. As informações de configuração do SDK Web podem ficar no código do site; **nunca** coloque senha de administrador ou token privado nele.
7. Quando estiver configurado, a faixa **MODO DEMO** desaparece e o indicador mostra **Ao vivo** ao conectar.

## Painel de controle para excluir jogadores

O ícone de engrenagem é pequeno, no canto superior direito do site. Somente uma conta administrativa do **Firebase Authentication** pode abrir o gerenciamento e remover jogadores. O botão **Excluir** pede uma confirmação e libera a vaga em tempo real.

**Importante:** não basta comparar uma senha no JavaScript: isso a deixaria visível para quem abrir o código-fonte. Por segurança, o site verifica a senha no Firebase Auth e as **regras do Realtime Database** conferem o UID da conta antes de permitir apagar qualquer jogador.

### Configuração obrigatória, feita uma única vez

1. No Firebase Console, vá a **Authentication → Sign-in method** e ative **E-mail/senha** (além de **Anônimo** para os jogadores).
2. Em **Authentication → Users → Adicionar usuário**, crie uma conta administrativa com um **e-mail que você controla** e a senha de administrador escolhida. **Não coloque essa senha no código, no repositório ou no arquivo de configuração.**
3. Copie o **UID** dessa nova conta na lista de usuários do Authentication.
4. Neste pacote `window.FUT_ADMIN.email` e `window.FUT_ADMIN.uid` já estão preenchidos; confira se a conta cadastrada no Authentication tem esse mesmo e-mail e UID.
5. O arquivo `database.rules.json` já contém o UID administrativo. Publique o JSON em **Realtime Database → Regras**.
6. Hospede o site no GitHub Pages (passos abaixo), clique na engrenagem, digite a senha e selecione **Excluir** ao lado do nome desejado.

- **Atenção:** publicar o JSON no GitHub não ativa regras no Firebase; publique-as no console.
- **O painel não funciona no modo demo.** É necessário configurar Firebase Auth e Realtime Database.
- Ao fechar o painel ou clicar em **Sair**, o acesso administrativo é encerrado. O login admin usa uma **segunda sessão isolada e apenas em memória**, para não perder o UID anônimo do jogador no mesmo aparelho.
- Mesmo que alguém copie o código-fonte ou tente chamar a API do Firebase, só o UID administrativo previamente autorizado nas regras pode remover inscrições alheias.
- Se houver um acesso indevido à senha, troque-a no Firebase Authentication.

## Publicar no GitHub Pages

1. Crie um repositório público no GitHub, por exemplo `futebol-vila-rezende`.
2. Envie para a raiz do repositório os arquivos `index.html`, `styles.css`, `app.js`, `firebase-config.js` e, se quiser, este README e `database.rules.json`.
3. Vá em **Settings → Pages**. Em **Build and deployment → Source**, escolha **Deploy from a branch**.
4. Selecione **main**, pasta **/(root)**, e **Save**.
5. O link será semelhante a `https://SEU-USUARIO.github.io/futebol-vila-rezende/`.
6. Inscreva um nome por um celular e confira a lista pelo link em outro dispositivo. Confirme a desistência no primeiro navegador.

**Atenção:** o GitHub Pages publica os arquivos do site. O **Firebase Realtime Database** é quem armazena e sincroniza os nomes. A configuração do Firebase não deve ficar limitada ao modo demonstração.

## Modo demonstração

Sem preencher `firebase-config.js`, o site roda apenas em **modo local** e usa `localStorage`. Os nomes desse modo **não aparecem em outros aparelhos**. Utilize somente para testar a interface.

## Estrutura dos arquivos

- `index.html` — textos e estrutura do site.
- `styles.css` — aparência e responsividade.
- `app.js` — inscrição, desistência e sincronização.
- `firebase-config.js` — valores públicos da configuração Firebase e e-mail/UID do administrador **sem senha**.
- `database.rules.json` — regras de permissão e bloqueio de inscrição fora da semana vigente; devem ser publicadas no console Firebase.
- `README.md` — este guia.

## Para começar uma nova lista

**Não precisa apagar manualmente:** toda terça às 00:00 (horário de Piracicaba / America/Sao_Paulo), o site abre a lista de uma nova semana, zerando a contagem e as inscrições visíveis automaticamente, inclusive quando a página está aberta. As regras Firebase permitem novas inscrições **somente na semana vigente**, calculada pelo horário do servidor, evitando inscrições de semanas passadas.

**Importante sobre armazenamento:** as inscrições antigas são **arquivadas** sob `/weeks/INICIO_DA_SEMANA/players` e não são apagadas fisicamente do Realtime Database. Elas não aparecem na lista nova. Se quiser excluir o histórico, pode apagá-lo manualmente pelo Console Firebase; uma exclusão física programada sem visitas ao site exigiria um serviço agendado. Não apague a pasta da semana vigente se quiser preservar os jogadores inscritos.

**Fuso horário:** a âncora semanal equivale a terças 00:00 em Piracicaba (UTC−03:00), conforme regras atuais do Brasil. Se o país voltar a aplicar horário de verão, os horários definidos em `app.js` e `database.rules.json` precisarão ser ajustados.

## Testes recomendados

1. Entrar, atualizar a página e conferir que o nome permanece.
2. Abrir o site em outro aparelho e conferir que vê a mesma lista (Firebase configurado).
3. Desistir no mesmo navegador, confirmar e conferir que a vaga foi liberada.
4. Testar o limite de 16 pessoas e o bloqueio de remoção de outra pessoa.
5. Entrar pelo ícone de engrenagem, testar senha errada e senha certa, remover um jogador e conferir a vaga liberada em outro aparelho.
6. Confirmar a aparência no celular, o mapa e o texto de compartilhamento.
7. Validar a troca semanal às terças 00:00 (horário de Piracicaba), inclusive com o site aberto.
8. **Ao atualizar um site que já usa Firebase:** publicar **primeiro** as novas regras de `database.rules.json` e **depois** os arquivos HTML/JS. O formato mudou de `/players` para `/weeks/INICIO_DA_SEMANA/players`; registros antigos sob `/players` não serão importados automaticamente.


## Correção das regras (outubro de 2026)

O Realtime Database **não oferece** `numChildren()` em suas regras de segurança. Esta versão remove as duas chamadas inválidas e utiliza `.validate` nos filhos `name` e `joinedAt` com `$other: false` para proibir campos adicionais. O número 16 permanece limitado pela interface, mas **não é uma garantia no servidor** em acessos simultâneos; solução realmente rígida exigiria modelar 16 vagas fixas ou backend.


## Conferência do arquivo firebase-config.js

Este pacote já contém o UID do organizador tanto em `firebase-config.js` quanto nas regras. Os valores de `FUT_CONFIG` e o e-mail de `FUT_ADMIN` já estão preenchidos neste pacote; nunca inclua a senha no JS. Confira também em Authentication os provedores Anônimo e E-mail/senha, e o domínio do GitHub Pages nos domínios autorizados em Authentication → Settings → Authorized domains caso seja necessário.


## Publicar atualização pelo GitHub + Netlify

1. Substitua no repositório GitHub os arquivos **`index.html`**, **`app.js`**, **`styles.css`** (todos na raiz, junto com `firebase-config.js`).
2. Faça commit na branch conectada ao Netlify (`main`). Se o projeto Netlify estiver vinculado ao GitHub, o novo deploy acontece automaticamente após o commit. Se ainda não estiver vinculado, importe o repositório no Netlify e escolha publish directory `.` e build command vazio.
3. Esta atualização **não modifica a estrutura dos dados ou as regras Firebase**: não é necessário reaplicar `database.rules.json` se as regras corrigidas com UID já estiverem publicadas.
4. Verifique no site a data da segunda-feira, que mudará sozinha após terça às 00:00.

## Ajustes visuais e indicador de conexão

- O cabeçalho principal agora mostra **VAGAS ABERTAS** e a frase **Coloque seu nome na lista e garanta já a sua vaga!**.
- O marcador **PASSO 01** foi removido, mas a inscrição continua funcionando normalmente.
- O antigo slogan do rodapé foi substituído pelo estado **Site online** ou **Site offline**, acompanhado de um ponto verde ou vermelho.
- **O indicador não testa se o Netlify está no ar para todas as pessoas.** Ele mostra se **este navegador** conseguiu autenticar no Firebase, se conectar ao Realtime Database e ler a lista. Enquanto a conexão é estabelecida, mostra **Verificando conexão...**. Sem Firebase configurado, mostra **Modo demonstração**.
- Para publicar via Netlify com GitHub, substitua **`index.html`**, **`styles.css`** e **`app.js`** na raiz do repositório e faça commit. Não é necessário atualizar as regras do Firebase para estes ajustes visuais.
