/** Histórico de atualizações do CRM (mais recente primeiro). Nome: v<versão>.<DDMM>. */
export type Item = string | { text: string; sub: string[] };
export type Section = { title: string; items: Item[] };
export type Release = { version: string; date: string; summary: string; sections: Section[] };

export const RELEASES: Release[] = [
  {
    version: "v11.1910", date: "2026-10-19", summary: "Mover cartão de entregável para outro quadro e cartão “Leads em aberto” do Dashboard clicável.",
    sections: [
      { title: "1. Mover cartão para outro quadro", items: [
        "Novo botão “Mover para outro quadro” dentro do cartão (por baixo de “Mover para (lista)”): escolha o quadro de destino e carregue em Mover.",
        "Serve para quando um entregável foi cadastrado no cliente errado — leva o cartão com tudo (anexos, checklist, comentários, etiquetas e membros).",
        "Cai numa lista com o mesmo nome no quadro de destino (ex.: “Em produção”) ou, se não existir, na primeira lista; e passa a ligar o cartão ao cliente desse quadro.",
        "Fica registado no histórico do cartão e na ficha dos dois clientes.",
      ] },
      { title: "2. Dashboard — atalho para Leads", items: [
        "O cartão “Leads em aberto” passou a ser clicável e abre diretamente a lista de Leads.",
      ] },
    ],
  },
  {
    version: "v11.1710", date: "2026-10-17", summary: "Máscara de valores (ícone de olho) no Dashboard e no Financeiro, e sistema responsivo no telemóvel.",
    sections: [
      { title: "1. Ocultar/mostrar valores (como nos bancos)", items: [
        "Novo botão com ícone de olho que oculta ou mostra os valores em euros. Vêm ocultos por omissão (••••••); carregue no olho para revelar.",
        "No Dashboard (cartões de valores e funil), na lista de Leads (coluna Valor) e em todo o Financeiro (resumo, lançamentos, custos fixos e clientes).",
        "A escolha fica guardada no seu navegador e vale para as várias páginas — reveja uma vez e fica assim até ocultar de novo.",
        "As contagens (nº de leads, %, nº de clientes) continuam sempre visíveis; só os valores em dinheiro é que são escondidos.",
      ] },
      { title: "2. Sistema responsivo no telemóvel", items: [
        "Revisão geral para o telemóvel: margens e espaçamentos ajustados, títulos e cartões adaptados ao ecrã pequeno.",
        "As tabelas largas (lançamentos, relatórios) passam a deslizar na horizontal dentro do próprio cartão, sem “esticar” a página.",
        "Quadros (estilo Trello) e propostas ficam legíveis no telemóvel; nada transborda para fora do ecrã.",
      ] },
      { title: "3. Pipeline ocupa todo o ecrã", items: [
        "O Pipeline passa a usar toda a largura do ecrã do dispositivo, com as colunas a esticarem para preencher o espaço (antes ficava limitado e com margens laterais a mais).",
        "Em ecrãs menores as colunas mantêm uma largura mínima legível e desliza-se na horizontal para ver as restantes etapas.",
      ] },
    ],
  },
  {
    version: "v11.1610", date: "2026-10-16", summary: "Novo módulo LEAD Tráfego: rastreamento de leads vindos de campanhas (Meta, Google e outras).",
    sections: [
      { title: "1. Novo menu “LEAD Tráfego” (separado do resto)", items: [
        "Um módulo próprio, que não altera nada das suas funções atuais, para rastrear de onde vêm os leads das campanhas pagas.",
        "Tem três áreas: Painel de tráfego, Leads de campanhas e Fontes e integrações.",
        "Controlado por uma nova permissão por utilizador (“LEAD Tráfego”), em Usuários.",
      ] },
      { title: "2. Fontes e integrações", items: [
        { text: "Crie “fontes” de captação — cada uma gera um endereço exclusivo (endpoint) para ligar aos seus anúncios:", sub: [
          "Formulário no site / landing page (com um código pronto a colar que captura sozinho utm_source, utm_campaign, gclid, fbclid…).",
          "Meta Lead Ads, Google e automações (Zapier / Make) via webhook — aceita JSON ou formulário.",
          "Pode escolher o canal (Meta, Google, TikTok, WhatsApp…) e um responsável automático por fonte.",
        ] },
        "Ativar/desativar uma fonte, gerar um novo endereço (invalida o antigo) e remover. Inclui um teste rápido por terminal.",
      ] },
      { title: "3. Leads de campanhas", items: [
        "Todos os contactos captados chegam aqui com a origem completa: fonte, canal, campanha, conjunto, anúncio, meio, termo e Click ID (Google/Meta).",
        "Converta um lead de tráfego num lead do CRM com um clique — entra no pipeline já com a campanha de origem (e sem duplicar se o e-mail já existir).",
        "Descartar e restaurar. Um aviso no menu mostra quantos ainda estão por tratar.",
        "Quem não tem a permissão “Dados do cliente” vê o e-mail e o telefone como “restrito”.",
      ] },
      { title: "4. Painel de tráfego (ROI por campanha)", items: [
        "Indicadores: leads captados, por tratar, convertidos, taxa de conversão e valor gerado.",
        "Tabela de desempenho por campanha (captados → convertidos → valor), com filtro por período e opção de imprimir/PDF.",
      ] },
    ],
  },
  {
    version: "v10.1710", date: "2026-10-17", summary: "Correções de segurança: modelos e dados de contacto respeitam as permissões.",
    sections: [{ title: "Segurança (auditoria interna)", items: [
      "Modelos de e-mail e de WhatsApp: criar ou alterar passou a exigir a permissão “Mensagens” também no servidor (antes a página estava escondida, mas a ação não estava protegida).",
      "Dados do cliente restritos: quem não tem a permissão “Dados do cliente” deixa de ver e de alterar o e-mail, o telefone e o valor na edição do lead (aparecem como “restrito”); a proteção é aplicada também no servidor.",
      "Resultado de um teste de segurança ao sistema; não foram encontradas falhas críticas.",
    ] }],
  },
  {
    version: "v10.1610", date: "2026-10-16", summary: "Custos fixos e categorias no Financeiro, conferência de valores do Dashboard e estado da proposta editável.",
    sections: [
    { title: "1. Financeiro — custos fixos", items: [
      "Novo separador Financeiro → Custos fixos e categorias: cadastre Luz, Água, Renda, Designer, Editor… com valor mensal, dia de pagamento, IVA, início e (opcional) fim.",
      "Um custo fixo é lançado automaticamente em todos os meses (sempre 12 meses à frente) e aparece nos lançamentos com a etiqueta FIXO.",
      "Reajustar valor a partir de um mês: só os meses desse em diante mudam; os anteriores e os já pagos mantêm o valor. Fica o histórico de valores.",
      "Remover de um mês em diante (os anteriores e os pagos ficam) ou Retomar. Também dá para remover só um mês, no próprio lançamento.",
      "Editar descrição, categoria, dia ou fornecedor aplica-se só aos meses pendentes a partir do mês atual.",
      "Também serve para receitas fixas (avenças).",
    ] },
    { title: "2. Financeiro — categorias", items: [
      "Cadastre, renomeie ou desative categorias de despesas e de receitas (ex.: Designer, Editor de vídeo, Fotógrafo…). Já vêm várias criadas.",
      "Renomear atualiza os lançamentos e custos fixos que usam essa categoria. As categorias aparecem nos lançamentos, custos fixos e relatórios.",
    ] },
    { title: "3. Dashboard — conferência de valores", items: [
      "Novo link “Ver de onde vem este valor →” nos cartões de valores do Dashboard: abre a Conferência de valores, lead a lead, com o valor estimado no lead, a proposta aceite (mensal/único), o valor usado no Dashboard e a diferença.",
      "Botão para passar o “Valor estimado” do lead a ser o valor fechado (um a um ou todos de uma vez) — assim a lista de leads e o Dashboard batem certo.",
      "A partir de agora, quando uma proposta é aceite, o valor do lead é atualizado automaticamente para o valor fechado.",
    ] },
    { title: "4. Propostas — mudar o estado", items: [
      "Novo bloco “Estado da proposta” na página de cada proposta: Rascunho, Enviada, Vista pelo cliente, Aceite (com o plano escolhido), Recusada (com motivo) ou Cancelada.",
      "Útil quando a proposta foi enviada por fora do CRM ou para corrigir um estado; pode também reabrir como rascunho para editar.",
      "Cada mudança fica registada no histórico do lead e na auditoria; com valores por aprovar não deixa marcar como enviada/aceite.",
      "Inclui tudo da v9.1610 (se ainda não tinha publicado).",
    ] }],
  },
  {
    version: "v9.1610", date: "2026-10-16", summary: "Relatórios, Financeiro, bloco de notas, permissões por utilizador e portal do cliente.",
    sections: [
      { title: "1. Relatórios (menu Gestão → Relatórios)", items: [
        "Há 10 relatórios: Leads, Funil por etapa, Follow-ups, Propostas, Contratos fechados, Histórico de atividades, Desempenho da equipa, Entregáveis e publicações, Lançamentos financeiros e Recebimentos por cliente.",
        "Cada um tem filtros: período, responsável, etapa e estado, conforme o relatório.",
        "Exporta em CSV, em Excel (.xlsx), com cabeçalho e valores em €, e em Imprimir / PDF, na vertical ou na horizontal.",
        "Os dois relatórios financeiros só aparecem a quem tem acesso ao financeiro.",
      ] },
      { title: "2. Valores errados no Dashboard (corrigido)", items: [
        "O cartão \"Fechados no mês\" somava o valor estimado dos leads. Agora \"Fechado no mês\" soma as propostas aceites, com o plano que o cliente escolheu, sem IVA. Mostra o valor mensal e, à parte, os valores únicos.",
        "Só para leads ganhos sem proposta é que usa o valor estimado.",
        "A linha \"Cliente (ganho)\" do funil passou a usar a mesma regra.",
      ] },
      { title: "3. Financeiro (separador 💶 Financeiro no Dashboard e menu próprio)", items: [
        "Resumo: receita prevista, recebido, despesas e em atraso. Tem um gráfico de 12 meses, os maiores clientes e os próximos vencimentos.",
        "Lançamentos: receitas e despesas, que pode criar, editar, marcar como recebido e cancelar. Uma mensalidade pode repetir-se por N meses. Cada lançamento tem IVA, n.º de fatura e forma de pagamento.",
        "Propostas aceites por lançar: com 1 clique criam as mensalidades e o valor único.",
        "Clientes: os clientes do CRM com o total recebido e a receber, e os clientes avulsos, que não são leads.",
        "Serviços avulsos: um catálogo próprio, que aparece ao criar lançamentos. Para manter a trava dos preços, só o dono do sistema cria serviços e define preços.",
      ] },
      { title: "4. Bloco de notas (Dashboard)", items: [
        "As notas são privadas por defeito.",
        "Ao criar ou editar, escolhe para cada pessoa: Não vê, Só ver ou Ver e editar.",
        "Só o autor apaga, fixa e muda a partilha.",
      ] },
      { title: "5. Utilizadores, permissões e portal do cliente", items: [
        { text: "Funcionário: em Usuários há caixas para dar ou tirar acesso a:", sub: [
          "Financeiro (desligado por defeito)", "Relatórios",
          "Dados do cliente: e-mail, telefone e valores, que aparecem como \"restrito\" para quem não tiver acesso",
          "Propostas", "Quadros", "Mensagens",
          "O menu esconde o que a pessoa não pode usar, e o sistema bloqueia mesmo se ela tentar abrir o endereço diretamente.",
        ] },
        { text: "Cliente: escolhe o lead dele. O cliente entra num portal próprio e só vê o que ativar:", sub: [
          "entregáveis, onde pode comentar, ✓ Aprovar ou ✏️ Pedir ajustes (a equipa recebe logo uma notificação)",
          "o plano de entregas", "documentos, com opção de os deixar enviar ficheiros", "propostas", "pagamentos",
          "Se tentar abrir qualquer outra página do CRM, volta ao portal.",
        ] },
        "Comentários nos cartões: os comentários internos da equipa não aparecem ao cliente. Para responder ao cliente, marque \"Visível para o cliente\" ao comentar no cartão.",
      ] },
      { title: "6. Menu Atualizações", items: [
        "Novo menu Sistema → Atualizações com todas as melhorias de cada versão.",
        "As versões passam a chamar-se v<versão>.<dia><mês> (ex.: v9.1610) — o mesmo nome é usado no ficheiro .zip, para não confundir os backups.",
        "A versão instalada aparece no fundo do menu lateral.",
      ] },
      { title: "7. Também incluído nesta atualização (v8.3, v8.4 e v8.5, que ainda não tinham sido publicadas)", items: [
        "Cores livres em quadros, listas e cartões: 15 cores básicas + roda de cores para escolher qualquer outra.",
        "Imprimir por secção: o botão Imprimir / PDF pergunta o que imprimir (ficha do cliente, follow-ups, plano de entregas, entregáveis, propostas, documentos, histórico…) e a orientação. A ficha completa inclui a tabela de entregáveis.",
        "Plano de entregas por semana: setas ← mês →, caixas Semana 1–5 com entregas feitas, meta e agendados; clicar numa semana mostra o detalhe. Cada linha do plano aceita vários estilos (ou todos) e tem botão Editar. Cartões em listas de concluídos passam a contar.",
        "Ficha do lead com secções recolhíveis/expansíveis (e Expandir tudo / Recolher tudo), memorizadas neste navegador.",
        "Botão 🔓 Desbloquear em Usuários para quem ficou bloqueado após 5 tentativas de senha erradas.",
      ] },
    ],
  },
  {
    version: "v8.2", date: "2026-10-15", summary: "Cores nas listas e cartões, quadro em ecrã inteiro e impressão vertical/horizontal.",
    sections: [{ title: "Melhorias", items: [
      "Cor por lista e por cartão nos quadros.",
      "Página do quadro ocupa toda a largura do ecrã; as listas ajustam-se ao tamanho.",
      "Impressão em todo o sistema com escolha de orientação (vertical ou horizontal).",
    ] }],
  },
  {
    version: "v8.1", date: "2026-10-15", summary: "Plano de entregas por cliente e várias redes por cartão.",
    sections: [{ title: "Melhorias", items: [
      "Plano de entregas no lead ganho: quantidade por dia/semana/mês/trimestre/total, estilos (Reels, Vídeo, Post…) e categorias novas, com progresso.",
      "Campo “Estilo do conteúdo” nos cartões.",
      "“Onde publicar” passou a permitir várias redes ao mesmo tempo.",
    ] }],
  },
  {
    version: "v8", date: "2026-10-15", summary: "Quadros estilo Trello e Entregáveis.",
    sections: [{ title: "Melhorias", items: [
      "Menu Quadros: listas, cartões com arrastar e largar, etiquetas, membros, checklist, comentários, anexos (artes, vídeos, links), capa e vista Calendário.",
      "Alerta de data/hora de postagem: sino, alerta no computador e e-mail até marcar “Publicado”.",
      "Secção Entregáveis no lead em “Cliente (ganho)”, ligada aos cartões.",
    ] }],
  },
  {
    version: "v7.4", date: "2026-10-15", summary: "Propostas: WhatsApp, acompanhamento manual e visual.",
    sections: [{ title: "Melhorias", items: [
      "Envio da proposta por WhatsApp com mensagem editável, com ou sem link.",
      "Acompanhamento manual: vista, aceite (com o plano escolhido) ou recusada.",
      "Totais alinhados no fundo de cada plano e contactos da XPTO no cabeçalho da proposta.",
      "Até 6 planos por proposta; só o dono apaga propostas; correção da ficha/PDF do lead.",
    ] }],
  },
  {
    version: "v7 e anteriores", date: "2026-10-14", summary: "Base do CRM.",
    sections: [{ title: "Principais funcionalidades", items: [
      "Leads, pipeline, follow-ups por e-mail/WhatsApp/ligação/tarefa, cadências e modelos.",
      "Notificações no sino e no dashboard até marcar como feito; lembretes por e-mail.",
      "Propostas com catálogo de serviços, trava de preços (aprovação do dono) e página pública de aceitação.",
      "Documentos por lead até 50 MB (cifrados) ou por link.",
      "Segurança: senhas fortes, 2FA, bloqueio após tentativas erradas, auditoria, dados sensíveis cifrados.",
    ] }],
  },
];

export const CURRENT_VERSION = RELEASES[0].version;
