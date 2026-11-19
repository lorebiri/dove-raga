# Direzioni grafiche per «Dove raga?»

Tre proposte nette da confrontare. Ognuna ha logo (orizzontale + simbolo), icona dell'app (anche maskable),
foto profilo rotonda, schermata principale, risultato e cartolina 9:16.

| Direzione | Tavola riassuntiva | Idea |
|---|---|---|
| A · Capsula | [tavola-a-capsula.png](tavola-a-capsula.png) | Macchinetta a sorpresa: giri la manovella, esce la capsula col locale. Viola notte, lime acido, rosa shocking. |
| B · Sticker | [tavola-b-sticker.png](tavola-b-sticker.png) | Pacchetto di adesivi su giallo acido, nigiri con gli occhi, tono da chat di gruppo. |
| C · Brutal Y2K | [tavola-c-y2k.png](tavola-c-y2k.png) | Nero, verde acido e blu elettrico, scritte enormi, monospazio, nastro che scorre; dado coi puntini a punto di domanda. |

- Le pagine (`<direzione>/index.html`, con `#risultato` per lo stato del risultato) sono statiche e cliccabili: il pulsante del tiro porta al risultato.
- Screenshot su telefono (412×915, deviceScaleFactor 2) in `<direzione>/screenshot/`.
- Tutte e tre passano il controllo di contrasto AA (axe) e fermano le animazioni con «riduci movimento».
- Caratteri ospitati qui (`fonts/`, licenza SIL OFL): Lilita One, Rubik, Bricolage Grotesque, Anton, Space Mono.
- Simboli e loghi disegnati da zero. Nome del locale e dati sono di esempio.
- Rigenerare: `node scripts/stili.mjs`
