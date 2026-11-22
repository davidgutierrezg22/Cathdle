const languages = { en: "English", es: "Español", pt: "Português", fr: "Français", ja: "日本語" };

// English source, followed by Spanish, Portuguese, French and Japanese.
const copy = [
    ["Loading…","Cargando…","Carregando…","Chargement…","読み込み中…"],
    ["Retry","Reintentar","Tentar novamente","Réessayer","再試行"],
    ["Statistics","Estadísticas","Estatísticas","Statistiques","成績"],
    ["You must be logged in.","Inicia sesión para ver tus estadísticas.","Entre para ver suas estatísticas.","Connecte-toi pour voir tes statistiques.","成績を見るにはログインしてください。"],
    ["Challenge difficulty", "Dificultad del reto", "Dificuldade do desafio", "Difficulté du défi", "チャレンジ難易度"],
    ["Easy", "Fácil", "Fácil", "Facile", "かんたん"],
    ["Medium", "Medio", "Médio", "Moyen", "ふつう"],
    ["Hard", "Difícil", "Difícil", "Difficile", "むずかしい"],

    ["Guess summary", "Resumen de intentos", "Resumo dos palpites", "Résumé des essais", "回答のまとめ"],
    ["Guess {n}/{max}", "Intento {n}/{max}", "Tentativa {n}/{max}", "Essai {n}/{max}", "{n}/{max} 回目"],
    ["Audio controls","Controles de audio","Controles de áudio","Commandes audio","音声コントロール"],
    ["Go to start","Volver al inicio","Voltar ao início","Revenir au début","先頭へ"],
    ["Go to end","Ir al final","Ir ao final","Aller à la fin","末尾へ"],
    ["Play","Reproducir","Reproduzir","Lire","再生"],
    ["Pause","Pausar","Pausar","Pause","一時停止"],
    ["Playback position","Posición de reproducción","Posição de reprodução","Position de lecture","再生位置"],
    ["Volume","Volumen","Volume","Volume","音量"],
    ["Mute","Silenciar","Silenciar","Couper le son","ミュート"],
    ["Unmute","Activar sonido","Ativar som","Rétablir le son","ミュート解除"],
    ["Repeat clip","Repetir fragmento","Repetir trecho","Répéter l’extrait","リピート"],
    ["Language","Idioma","Idioma","Langue","言語"],
    ["Guess the daily osu!catch beatmapset.","Adivina el set de osu!catch del día.","Adivinhe o set de osu!catch do dia.","Devine le set osu!catch du jour.","今日の osu!catch のセットを当てよう。"],
    ["Log in with osu!","Entrar con osu!","Entrar com osu!","Se connecter avec osu!","osu! でログイン"],
    ["A new set every midnight in Colombia.","Nuevo set a medianoche, hora de Colombia.","Um novo set à meia-noite na Colômbia.","Un nouveau set à minuit, heure de Colombie.","コロンビア時間の午前0時に更新。"],
    ["Credits","Créditos","Créditos","Crédits","クレジット"],
    ["My Statistics","Mis estadísticas","Minhas estatísticas","Mes statistiques","自分の成績"],
    ["User","Usuario","Usuário","Joueur","ユーザー"],
    ["Log out","Salir","Sair","Déconnexion","ログアウト"],
    ["Daily game mode","Modo diario","Modo diário","Mode du jour","デイリーモード"],
    ["Classic","Clásico","Clássico","Classique","クラシック"],
    ["Background","Fondo","Fundo","Illustration","背景"],
    ["Audio","Audio","Áudio","Audio","音声"],
    ["Which song is playing?","¿Qué canción suena?","Que música está tocando?","Quel morceau écoutes-tu ?","この曲は何？"],
    ["Which beatmapset is this background from?","¿De qué set es este fondo?","De qual set é este fundo?","À quel set appartient cette illustration ?","この背景はどのセット？"],
    ["Mystery background","Fondo por descubrir","Fundo misterioso","Illustration mystère","背景クイズ"],
    ["Zoomed view of today's mystery beatmap background","Detalle del fondo del mapa de hoy","Detalhe do fundo do mapa de hoje","Détail du fond de la map du jour","今日の背景の拡大画像"],
    ["Retry image","Volver a cargar la imagen","Recarregar imagem","Recharger l’image","画像を再読み込み"],
    ["Each wrong guess zooms out. You have 10 attempts.","Cada fallo revela más del fondo. Tienes 10 intentos.","Cada erro revela mais da imagem. Você tem 10 tentativas.","Chaque erreur élargit le cadre. Tu as 10 essais.","間違えるたびに見える範囲が広がります。チャンスは10回。"],
    ["Mystery song","Canción por descubrir","Música misteriosa","Morceau mystère","曲名クイズ"],
    ["Loading today’s clip…","Cargando el audio de hoy…","Carregando o trecho de hoje…","Chargement de l’extrait du jour…","今日の音声を読み込み中…"],
    ["Play the mystery song","Escuchar la canción","Ouvir a música","Écouter le morceau","曲を再生"],
    ["Retry audio","Volver a cargar el audio","Recarregar áudio","Recharger l’audio","音声を再読み込み"],
    ["Each miss adds more music. Any set with the same artist and title counts.","Cada fallo alarga el audio. Vale cualquier set con el mismo artista y título.","Cada erro libera mais áudio. Vale qualquer set com o mesmo artista e título.","Chaque erreur prolonge l’extrait. Tout set avec le même artiste et le même titre compte.","間違えると続きを聴けます。曲名とアーティストが同じなら別のセットでも正解。"],
    ["Search artist, mapper or beatmap","Buscar artista, mapper o mapa","Buscar artista, mapper ou mapa","Chercher un artiste, un mapper ou une map","曲名・アーティスト・マッパーで検索"],
    ["Guess","Adivinar","Chutar","Valider","回答"],
    ["Attempts","Intentos","Tentativas","Essais","回答回数"],
    ["Beatmap","Mapa","Mapa","Map","譜面"],
    ["Artist","Artista","Artista","Artiste","アーティスト"],
    ["Mapper","Mapper","Mapper","Mapper","マッパー"],
    ["Stars","Estrellas","Estrelas","Étoiles","難易度"],
    ["Year", "Año", "Ano", "Année", "年"],
    ["The year is when the set became Ranked or Loved. Yellow means one year off.", "El año indica cuándo el set pasó a Ranked o Loved. Amarillo significa un año de diferencia.", "O ano indica quando o set virou Ranked ou Loved. Amarelo indica um ano de diferença.", "L’année indique quand le set est passé Ranked ou Loved. Le jaune indique un an d’écart.", "年は譜面セットが Ranked または Loved になった年です。黄色は1年差を表します。"],
    ["Length","Duración","Duração","Durée","長さ"],
    ["Color indicators","Guía de colores","Guia de cores","Légende","色の見方"],
    ["Correct","Acierto","Certo","Exact","正解"],
    ["Close","Cerca","Perto","Proche","惜しい"],
    ["Incorrect","Incorrecto","Errado","Incorrect","不正解"],
    ["Higher / lower","Más alto / más bajo","Maior / menor","Plus haut / plus bas","高い／低い"],
    ["Clues","Pistas","Dicas","Indices","ヒント"],
    ["Difficulty","Dificultad","Dificuldade","Difficulté","難易度名"],
    ["Map stats","Datos del mapa","Dados do mapa","Données de la map","譜面データ"],
    ["Map background","Fondo del mapa","Fundo do mapa","Fond de la map","譜面の背景"],
    ["Show clue","Ver pista","Ver dica","Voir l’indice","ヒントを見る"],
    ["Hide clue","Ocultar pista","Ocultar dica","Masquer l’indice","ヒントを隠す"],
    ["After {n} guesses","Tras {n} intentos","Após {n} tentativas","Après {n} essais","{n}回で解放"],
    ["How to play","Cómo jugar","Como jogar","Règles du jeu","遊び方"],
    ["Pick a set. Compare the artist, mapper, stars, BPM and length with the daily answer.","Elige un set y compara el artista, mapper, estrellas, BPM y duración con la respuesta de hoy.","Escolha um set e compare artista, mapper, estrelas, BPM e duração com a resposta do dia.","Choisis un set et compare son artiste, son mapper, ses étoiles, son BPM et sa durée avec la réponse du jour.","セットを選び、アーティスト・マッパー・星の数・BPM・長さを今日の正解と比べよう。"],
    ["Arrows point toward the answer. Each set uses its hardest catch difficulty.","Las flechas indican si debes subir o bajar. De cada set se usa la dificultad de catch con más estrellas.","As setas indicam se o valor deve subir ou descer. Vale a dificuldade de catch com mais estrelas de cada set.","Les flèches indiquent si la valeur doit monter ou descendre. Chaque set utilise sa difficulté catch la plus étoilée.","矢印は正解の値が上か下かを示します。各セットで星の数が最も多い catch 譜面を使います。"],
    ["After 3 guesses you can see the map stats, after 5 the difficulty name, and on your tenth guess the background.","Con 3 intentos puedes ver los datos del mapa, con 5 el nombre de la dificultad y en el décimo intento el fondo.","Com 3 tentativas você pode ver os dados do mapa, com 5 o nome da dificuldade e na décima tentativa o fundo.","Après 3 essais, tu peux voir les données de la map. Après 5, le nom de la difficulté. Au dixième essai, le fond.","3回で譜面データ、5回で難易度名、10回目の挑戦で背景を確認できます。"],
    ["Got it!","¡Acertaste!","Acertou!","Trouvé !","正解！"],
    ["Out of guesses","Sin intentos","Acabaram as tentativas","Plus d’essais","回答終了"],
    ["Solved on guess {n}.","Acertaste en el intento {n}.","Você acertou na tentativa {n}.","Trouvé à l’essai nº {n}.","{n}回目で正解。"],
    ["The answer was {title}.","La respuesta era {title}.","A resposta era {title}.","La réponse était {title}.","正解は「{title}」でした。"],
    ["Mapped by {mapper}","Mapa de {mapper}","Mapa de {mapper}","Map de {mapper}","マッパー：{mapper}"],
    ["Beatmap cover","Portada del mapa","Capa do mapa","Pochette de la map","譜面のカバー"],
    ["Open beatmap","Abrir mapa","Abrir mapa","Ouvrir la map","譜面を開く"],
    ["Leaderboard","Clasificación","Ranking","Classement","ランキング"],
    ["Next Catchdle","Próximo reto","Próximo desafio","Prochain défi","次の問題まで"],
    ["{mode} leaderboard","Clasificación · {mode}","Ranking · {mode}","Classement · {mode}","{mode}のランキング"],
    ["{mode} statistics","Estadísticas · {mode}","Estatísticas · {mode}","Statistiques · {mode}","{mode}の成績"],
    ["Top players","Mejores jugadores","Melhores jogadores","Meilleurs joueurs","上位プレイヤー"],
    ["Close leaderboard","Cerrar clasificación","Fechar ranking","Fermer le classement","ランキングを閉じる"],
    ["Player","Jugador","Jogador","Joueur","プレイヤー"],
    ["Points","Puntos","Pontos","Points","ポイント"],
    ["Wins","Victorias","Vitórias","Victoires","勝ち"],
    ["Games","Partidas","Partidas","Parties","プレイ数"],
    ["Win rate","% de victorias","% de vitórias","Taux de victoire","勝率"],
    ["Loading leaderboard...","Cargando clasificación…","Carregando ranking…","Chargement du classement…","ランキングを読み込み中…"],
    ["No players yet.","Aún no hay jugadores.","Ainda não há jogadores.","Pas encore de joueurs.","まだプレイヤーがいません。"],
    ["Dismiss","Cerrar","Fechar","Fermer","閉じる"],
    ["Close statistics","Cerrar estadísticas","Fechar estatísticas","Fermer les statistiques","成績を閉じる"],
    ["Avg. attempts","Intentos de media","Média de tentativas","Essais en moyenne","平均回答回数"],
    ["Losses","Derrotas","Derrotas","Défaites","負け"],
    ["Current streak","Racha actual","Sequência atual","Série en cours","現在の連勝"],
    ["Best streak","Mejor racha","Melhor sequência","Meilleure série","最長連勝"],
    ["Close credits","Cerrar créditos","Fechar créditos","Fermer les crédits","クレジットを閉じる"],
    ["Creator profile","Perfil del creador","Perfil do criador","Profil du créateur","制作者のプロフィール"],
    ["Support Catchdle","Apoyar a Catchdle","Apoiar o Catchdle","Soutenir Catchdle","Catchdle を応援"],
    ["Catchdle source code","Código de Catchdle","Código do Catchdle","Code source de Catchdle","ソースコード"],
    ["{n} s","{n} s","{n} s","{n} s","{n}秒"],
    ["Incorrect guess.","Ese no era.","Não foi dessa vez.","Ce n’est pas ça.","違うようです。"],
    ["You already guessed this song.","Ya probaste esa canción.","Você já tentou essa música.","Tu as déjà proposé ce morceau.","その曲は回答済みです。"],
    ["You already guessed this beatmap.","Ya probaste ese mapa.","Você já tentou esse mapa.","Tu as déjà proposé cette map.","その譜面は回答済みです。"],
    ["Could not load leaderboard.","No se pudo cargar la clasificación.","Não foi possível carregar o ranking.","Impossible de charger le classement.","ランキングを読み込めませんでした。"],
    ["Could not load statistics.","No se pudieron cargar tus estadísticas.","Não foi possível carregar suas estatísticas.","Impossible de charger tes statistiques.","成績を読み込めませんでした。"],
    ["Try again in a moment.","Vuelve a intentarlo en un momento.","Tente novamente em instantes.","Réessaie dans un instant.","しばらくしてからもう一度お試しください。"],
    ["A new challenge is ready. Refresh to play.","Hay un reto nuevo. Recarga para jugar.","Há um novo desafio. Atualize para jogar.","Un nouveau défi est prêt. Recharge la page pour jouer.","新しい問題があります。ページを更新してください。"],
    ["Refresh to check your session.","Recarga para comprobar tu sesión.","Atualize para verificar sua sessão.","Recharge la page pour vérifier ta session.","ログイン状態を確認するにはページを更新してください。"],
    ["Unknown","Desconocido","Desconhecido","Inconnu","不明"],
    ["Avatar","Avatar","Avatar","Avatar","アバター"]
];
const localeCodes = Object.keys(languages);
const languageKey = "catchdle.language";
function preferredLanguage() {
    try {
        const saved = localStorage.getItem(languageKey);
        if (localeCodes.includes(saved)) return saved;
    } catch {}
    const temporary = new URLSearchParams(location.search).get("lang");
    if (localeCodes.includes(temporary)) return temporary;
    for (const tag of navigator.languages || [navigator.language]) {
        const code = tag.split("-")[0];
        if (localeCodes.includes(code)) return code;
    }
    return "en";
}
const locale = preferredLanguage();
const twoDecimals = new Intl.NumberFormat(locale, {minimumFractionDigits: 2, maximumFractionDigits: 2});
const percent = new Intl.NumberFormat(locale, {style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1});
const dictionary = new Map(copy.map(row => [row[0], row[localeCodes.indexOf(locale)]]));
function tr(key, values = {}) {
    return (dictionary.get(key) ?? key).replace(/\{(\w+)\}/g, (match, name) => values[name] ?? match);
}

function translatePageText() {
    // Translate the HTML before gameplay inserts map titles and player names.
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
        const node = walker.currentNode;
        const key = node.textContent.trim().replace(/\s+/g, " ");
        if (dictionary.has(key)) node.textContent = node.textContent.replace(/\S[\s\S]*\S|\S/, () => tr(key));
    }
    for (const attribute of ["aria-label", "title", "alt", "placeholder"]) {
        for (const element of document.querySelectorAll("[" + attribute + "]")) {
            const key = element.getAttribute(attribute);
            if (dictionary.has(key)) element.setAttribute(attribute, tr(key));
        }
    }
}

function translateInterface() {
    document.documentElement.lang = locale;
    if (locale !== "en") translatePageText();
    for (const select of document.querySelectorAll(".language-select")) {
        for (const [code, name] of Object.entries(languages)) {
            const option = new Option(name, code, false, code === locale);
            option.lang = code;
            select.add(option);
        }
        select.addEventListener("change", () => {
            try { localStorage.setItem(languageKey, select.value); }
            catch {
                const url = new URL(location.href);
                url.searchParams.set("lang", select.value);
                location.assign(url);
                return;
            }
            location.reload();
        });
    }
}
translateInterface();
