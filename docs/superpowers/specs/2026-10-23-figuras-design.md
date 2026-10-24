# Figuras nas cenas do Jarvis Viewer — design

Data: 2026-10-23 · Dono: Niuarque Batista · Status: revisado pelo construtor; aguardando aprovação do dono. Decisões marcadas *(minha escolha)* foram tomadas pelo Claude e podem ser revistas; o resto foi decidido pelo dono na conversa.

## 1. Intenção

Hoje cada peça de uma cena é uma forma genérica: bola, caixa, octaedro. O dono quer que **cada peça do processo explicado ganhe uma figura levemente relacionada ao assunto**. Exemplos: um microfone para "Janelinha", um banco de dados para "Banco", uma lâmpada para "ideia". "Não meramente bolas."

As figuras vêm de **bibliotecas open-source embutidas no mod**. Elas funcionam sem internet, carregam na hora e têm licença conferida uma vez. **O Claude escolhe a melhor representação** para cada peça. Pedidos explícitos ("use caixas no lugar de círculos", "use um microfone aqui") valem acima da escolha dele.

Referência visual que o dono aprovou: a galeria de 2026-10-23, com Fluent Emoji 3D, Fluent Color, Tabler, Lucide e Phosphor, e a faixa "combinando pacotes" (3D para coisas e pessoas, traço para conceitos).

## 2. Objetivos, não-objetivos, anti-objetivos

**Objetivos**
- Embutir **todos os pacotes MIT/ISC, inteiros**, no repositório (decisão do dono: "baixo todos… e deixa o Claude escolher… variedades teremos"):
  - Fluent Emoji (Microsoft, MIT): estilos 3D, Color, Flat e High Contrast;
  - Tabler Icons (MIT);
  - Lucide (ISC);
  - Phosphor Icons (MIT), nos 6 pesos.
- Em todo tipo de cena com peças (arquitetura, fluxo, sequência, estados, camadas, árvore, comparação, metáfora), cada peça pode ser desenhada com uma figura.
- O Claude encontra as figuras com uma ferramenta de busca e escolhe uma por peça.
- Pedidos explícitos do dono têm prioridade:
  - figura específica ("um microfone aqui");
  - forma geométrica ("caixas no lugar de círculos");
  - arranjo ("árvore deitada"). Esta é a pendência anterior, que entra junto.
- **Animação na própria cena** no lugar de GIFs (aprovado pelo dono: "perfeito"). A figura gira, pulsa, balança, sobe ou "respira", e o Claude escolhe o movimento.

**Não-objetivos**
- Buscar figuras na internet.
- Pacotes com licença que exige crédito ou mesma licença: Noto animado e Twemoji (CC BY), OpenMoji (CC BY-SA). Ficam de fora.
- GIF, APNG ou Lottie. O Fluent animado (MIT, ~5 GB) fica de fora pelo tamanho.
- **A faxina de figuras duplicadas ou parecidas.** É uma segunda etapa, que o dono pediu para depois que tudo estiver salvo. Ver §9.
- Figuras em gráfico e timeline. Ali a forma carrega o número ou a data; trocar por figura distorce a leitura (anti-objetivo do design original).

**Anti-objetivos (seria fracasso mesmo funcionando)**
- **Figura que confunde:** uma figura sem relação com a peça, ou que sugere outra coisa. Na dúvida, o Claude usa um ícone neutro de traço ou a forma geométrica.
- **Cena salada:** uma cena com vários estilos misturados sem critério.
- **Figura que some no fundo:** as silhuetas escuras do Fluent ficam quase invisíveis no tema escuro.
- **Cena lenta:** a cena demora visivelmente mais para abrir do que hoje. Só as figuras da cena são carregadas.
- **Ferramenta que pesa nas conversas:** a descrição da ferramenta não pode carregar o catálogo inteiro.

## 3. Restrições conhecidas

- **Projeto existente:** jarvis-viewer, em `Projetos\mods-jarvis-viewer`, branch `main` (já publicado). O trabalho vai num branch novo.
- **Tamanho e arquivos:**
  - Fluent Emoji inteiro tem ~136 MB no repositório da Microsoft, a maior parte dos PNG 3D (~40 KB cada).
  - Tabler, Lucide e Phosphor somam poucos MB de SVG.
  - Total estimado: **~100–150 MB**.
  - **As figuras ficam fora do Git** (decisão do dono, 2026-10-23). O repositório guarda só o script com as versões fixadas. O dono roda o script uma vez por máquina, e as figuras ficam em `assets/figuras/`, listada no `.gitignore`. Depois disso tudo funciona sem internet, e a faxina (§9) realmente libera espaço.
  - O auxiliar `.exe` empacota `helper/web`. As figuras **não** podem ir para dentro do exe. Ficam numa pasta fora dele, servida pelo auxiliar.
- **Metadados que cada pacote já traz** e que alimentam o catálogo:
  - Fluent: `assets/<Nome>/metadata.json` com nome CLDR, palavras-chave, categoria e unicode. Os nomes estão em inglês.
  - Tabler: `icons.json` com nome, categoria e tags.
  - Lucide: `tags.json` com nome e sinônimos.
  - Phosphor: catálogo `icons` com nome, categorias e tags.
- **Idioma:** os metadados estão em inglês, mas o dono e o Claude conversam em português. O Claude traduz o termo antes de buscar. Mesmo assim, a busca deve aceitar termos em português comuns de explicação técnica. Ver §5.2.
- **Figuras com tom de pele:** no Fluent ficam em subpastas por tom (`Default/3D/…_3d_default.png`). Usar sempre o tom `Default`.
- **Contraste no tema escuro:**
  - Os ícones de traço usam `currentColor`, então são recoloridos pela cor do tema ou da peça.
  - As silhuetas escuras do Fluent precisam ser evitadas ou marcadas no catálogo como "escura".
- A página continua sem internet e com o token no caminho. As figuras são servidas pelo auxiliar sob o mesmo prefixo `/<token>/`.

## 4. Pacotes e organização no repositório *(minha escolha)*

```
assets/figuras/                       (fora de helper/web e fora do exe)
  fluent/   3d/<id>.png  color/<id>.svg  flat/<id>.svg  hc/<id>.svg   LICENSE
  tabler/   outline/<id>.svg  filled/<id>.svg                        LICENSE
  lucide/   <id>.svg                                                 LICENSE
  phosphor/ <peso>/<id>.svg   (thin, light, regular, bold, fill, duotone)  LICENSE
  catalogo.json                        (gerado; ver §5)
scripts/baixar-figuras.py              (baixa as versões fixadas e gera o catálogo)
```

- **Fora do Git:** `assets/figuras/` entra no `.gitignore`, catálogo incluído. No repositório ficam só `scripts/baixar-figuras.py` e o dicionário de sinônimos. O README ganha o passo "rode `python scripts/baixar-figuras.py` uma vez".
- **Versões fixadas** no script: Tabler 3.49.0, lucide-static 1.61.0 e @phosphor-icons/core 2.1.1, via tarball do npm; Fluent Emoji num commit fixo do GitHub. O script é repetível e não faz nada se a pasta já estiver atualizada.
- **Ids:** em minúsculas e sem espaço, por exemplo `gear`, `studio-microphone`, `file-cabinet`. O nome da figura vira `pacote/estilo:id`, por exemplo `fluent/3d:gear`, `tabler/outline:database`, `phosphor/duotone:gear`.
- O **README** ganha uma seção "Créditos das figuras" com cada pacote, licença e link. Os arquivos LICENSE originais ficam junto de cada pasta.

## 5. Como o Claude escolhe

### 5.1 Catálogo
`catalogo.json` tem uma entrada por figura:
- `nome` (`fluent/3d:gear`)
- `pacote`
- `estilo`
- `titulo` (em inglês, do pacote)
- `palavras` (palavras-chave do pacote, mais termos em português, ver 5.2)
- `categoria`
- `tom`: `clara`, `escura` ou `colorida`, marcando as silhuetas que somem no fundo escuro.

O catálogo fica com ~15–25 mil entradas e alguns MB.

### 5.2 Ferramenta `buscar_figura`
- Uma ferramenta nova do mod: `mcp__jarvis-viewer__buscar_figura`.
- Entrada: `{ termo, estilo?, limite? }`.
- Devolve até `limite` opções (padrão 8), cada uma com `nome`, `titulo`, `estilo` e `palavras` principais. A ordem é por relevância.
- **A busca roda no próprio mod**, sobre o catálogo lido do disco uma vez por sessão. Assim não precisa do auxiliar ligado. *(minha escolha)*
- **Português:** um dicionário pequeno de sinônimos em português, mantido no repositório, mapeia termos comuns de explicação para palavras-chave em inglês. Exemplos: banco de dados → database; engrenagem → gear, cog; servidor → server; nuvem → cloud; pessoa → person, user; microfone → microphone, mic. A busca usa o termo original e o traduzido. *(minha escolha: o Claude também pode buscar direto em inglês.)*
- **Relevância:**
  1. nome exato;
  2. palavra-chave exata;
  3. prefixo;
  4. contém.
  Estilos coloridos aparecem antes dos `escura`.

### 5.3 Na cena
- **Cada peça ganha campos opcionais:**
  - `figura`: um nome do catálogo;
  - `movimento`: `girar`, `pulsar`, `balancar`, `subir`, `respirar` ou `piscar`.
- **A cena ganha um campo opcional `estilo`** com:
  - `forma`: a forma geométrica padrão quando não há figura;
  - `figuras`: o estilo dominante, por exemplo `fluent/3d`;
  - `arranjo`: `vertical` ou `horizontal`, onde fizer sentido (árvore, fluxo, camadas).
- **Precedência:**
  1. pedido explícito do dono, que o Claude traduz em `figura`, `forma` ou `arranjo`;
  2. `figura` da peça;
  3. `estilo.forma` da cena;
  4. forma padrão do tipo de cena (o comportamento de hoje).
- O validador (`hooks/scene.ts`) confere se cada `figura` existe no catálogo e recusa com o caminho do campo, no formato atual (`nodes[2].figura: figura "x" não existe`).
- **Orientação ao Claude** (seção do `prompt.compose` e descrição da ferramenta, em poucas linhas):
  - em cenas de explicação, buscar uma figura por peça;
  - preferir um estilo dominante por cena;
  - para coisas e pessoas, preferir 3D;
  - para conceitos sem figura, preferir traço;
  - evitar figuras `escura`;
  - na dúvida, usar um ícone neutro ou a forma geométrica;
  - pedidos explícitos do dono sempre vencem.

## 6. Como a página desenha *(minha escolha)*
- **PNG (Fluent 3D):** um plano que sempre olha para a câmera, com a textura da figura. Tamanho parecido com o das formas de hoje, com o mesmo rótulo HTML embaixo.
- **SVG (Color, Flat, HC, Tabler, Lucide, Phosphor):** rasterizado num canvas, com `currentColor` trocado pela cor do tema ou da peça, e usado como textura do mesmo tipo de plano.
- **Foco, pulso e escurecimento** continuam funcionando, aplicados à figura: brilho e escala no foco, transparência para as peças apagadas.
- **Movimentos:** animados por relógio, como os pacotes de hoje (regra R6: nada depende de quadros). São leves e não atrapalham a leitura do rótulo.
- **Carregamento:**
  - só as figuras da cena;
  - em paralelo;
  - com cache por sessão;
  - uma figura que falha cai para a forma geométrica, sem travar a cena.
- **O auxiliar** serve `assets/figuras` sob `/<token>/figuras/…`, com a mesma proteção contra travessia de caminho, também quando roda empacotado (exe), lendo a pasta ao lado de `bin/`.

## 7. Testes e verificação
- **Mod:**
  - busca: termo em português, nome exato, estilo filtrado e `escura` no fim;
  - validação de `figura`, `movimento` e `estilo`;
  - catálogo carregado uma vez;
  - a ferramenta `buscar_figura` registrada e respondendo.
- **Auxiliar:** a rota `/figuras/` com token, a travessia bloqueada e o funcionamento com o exe.
- **Página** (node --test na parte pura):
  - precedência figura > estilo > padrão;
  - troca de `currentColor`;
  - fallback quando a figura falha;
  - duração dos movimentos.
- **Script:** gera um `catalogo.json` sem nomes duplicados, com um LICENSE em cada pasta.
- **Exemplos:** os exemplos de `docs/exemplos` ganham figuras, e o teste de exemplos continua passando.
- **Verificação visual pelo dono:**
  - a arquitetura do Jarvis com figuras;
  - um fluxo;
  - "use caixas no lugar de círculos";
  - a árvore deitada.

## 8. Riscos
1. **Busca ruim, figura errada:** a mitigação é o dicionário de sinônimos, a ordem de relevância e a orientação para usar a forma geométrica na dúvida.
2. **Figuras não instaladas:** numa máquina nova, as figuras só existem depois de rodar o script. A mitigação é o aviso de `buscar_figura` e as cenas continuando a funcionar com as formas geométricas. O repositório não cresce, porque as figuras ficam fora do Git.
3. **Rasterizar muitos SVG** pode atrasar a abertura de cenas grandes. São até 40 peças, com cache por sessão.
4. **Mudança de nomes entre versões dos pacotes:** as versões são fixadas no script.

## 9. Faxina (segunda etapa, depois)
Remover figuras duplicadas ou muito parecidas entre pacotes e estilos, por exemplo o mesmo "gear" em Tabler, Lucide e Phosphor. Os critérios são o mesmo nome e palavras-chave, e a semelhança visual da imagem rasterizada. Um script gera uma lista para o dono aprovar antes de apagar. Fica fora deste design. A organização em §4 permite apagar sem quebrar o catálogo, porque o catálogo é regenerado.

## 9.1 Decisões tomadas após a revisão do construtor *(minhas escolhas)*

**Onde o mod acha as figuras.**
- O mod é instalado lendo a própria pasta do repositório (`Read from: …\mods-jarvis-viewer`). Uma instalação pelo marketplace do GitHub copia o repositório inteiro.
- Nos dois casos, `$.plugin.root` aponta para a raiz, então o catálogo é `${$.plugin.root}/assets/figuras/catalogo.json`, lido com `$.fs`.
- A busca e o validador usam o mesmo catálogo carregado, uma vez por sessão.
- Sem catálogo (pasta vazia), `buscar_figura` responde "figuras não instaladas; rode scripts/baixar-figuras.py", o validador recusa `figura`, e as cenas sem figura continuam funcionando.

**Figura em tipos onde a forma tem significado.**
- A figura entra **no lugar do sólido**. O significado continua num **contorno fino** da forma original em volta da figura:
  - fluxo: pílula para início e fim, losango para decisão;
  - estados: o estado inicial mantém a seta de entrada.
- A cor do contorno segue a regra de hoje.

**Quais campos aceitam `figura` e `movimento`.**
- `nodes` (arquitetura, fluxo, árvore), `actors` (sequência), `states` (estados), `layers` (camadas, a figura fica ao lado do rótulo da placa) e os `items` de `comparacao` (figura pequena ao lado do texto).
- Na metáfora, `objects` ganham a forma nova `figura`, com o campo `figura`. `movimento` é dispensado ali, porque a metáfora já tem `actions`.

**Como marcar `tom`.**
- Calculado pelo script ao gerar o catálogo, a partir da luminância média dos pixels visíveis da figura rasterizada: `escura` abaixo de um limiar.
- Fluent **High Contrast** é tratado como monocromático e recolorível, como os ícones de traço.
- Fluent **Flat** é colorido.

**Resultados da busca agrupados por conceito.**
- Cada resultado é um conceito, com `titulo`, `palavras` e a lista de `opcoes` (os nomes por estilo, como `fluent/3d:gear`, `tabler/outline:settings` e `phosphor/duotone:gear`).
- `limite` conta conceitos, não variantes.

**`movimento` é ambiente e discreto.**
- O movimento é de baixa amplitude.
- Fica mais intenso quando a peça está em foco e para enquanto a peça está apagada, para não competir com o destaque do passo.

## 10. Deixado ao construtor
- algoritmo exato de relevância e o conteúdo do dicionário de sinônimos;
- tamanho e resolução das texturas;
- curvas dos movimentos;
- nomes internos;
- formato de logs;
- como o exe localiza a pasta de figuras.
