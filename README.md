# Dove raga?

Sushi stasera ma nel gruppo nessuno decide? Tiri il dado-nigiri e lui sceglie il locale vicino a te, ovunque in Italia.
Web app gratuita, senza server, senza account, senza tracciamento. Pensata per il telefono e per essere condivisa (storie, TikTok, gruppi).

Stile grafico: «Sticker» (giallo acido, adesivi, nigiri-mascotte, tono da chat di gruppo). Vedi `docs/stili/`.

Indirizzo previsto: <https://lorebiri.github.io/dove-raga/>

## Come funziona

- **Dati statici.** Una volta a settimana GitHub Actions scarica l'estratto OpenStreetMap dell'Italia pubblicato da Geofabrik o, se non risponde, dal mirror di OpenStreetMap Francia (un solo file, verificato con l'impronta MD5 e leggendolo per intero), lo filtra con osmium e salva tutti i ristoranti e fast food sushi/giapponesi dentro il confine italiano e l'elenco dei comuni, come file JSON compatti divisi in riquadri di 1° (`app/data/`). I file vengono sostituiti solo se i totali sono credibili (minimo assoluto e niente crolli rispetto alla copia precedente), e in un colpo solo. L'app legge solo questi file: nessuna chiamata a servizi esterni quando qualcuno tira il dado, quindi regge qualunque traffico.
- **Ricerca per città.** Elenco statico dei comuni (dai confini comunali OSM, con sigla di provincia e abitanti) e suggerimenti mentre scrivi.
- **Il tiro.** Sceglie a caso tra i locali entro il raggio (2, 5, 10, 25 km), evita di ripetere il precedente; «Nah, ritira» esclude e ritira.
- **Sticker per le storie.** Immagine 9:16 (1080×1920) generata nel browser con nome, distanza e link dell'app; condivisa con la condivisione di sistema, oppure scaricata con il link copiato.
- **Modalità gruppo.** «Manda al gruppo» crea un link col risultato nel frammento (`#g=…`): chi lo apre vede lo stesso esito. Il frammento non arriva mai al server e nel link non c'è la posizione di chi ha tirato.
- **Offline.** Un service worker tiene in memoria l'interfaccia e le zone già viste.
- **Privacy.** Niente cookie, niente tracker, caratteri ospitati nel repo. La posizione resta sul telefono. Nel `localStorage` restano solo raggio scelto e locali esclusi.

## Struttura

```
app/                  il sito pubblicato (HTML, moduli JS, font, icone, dati)
  js/                 geo, data, pick (tiro), link (gruppo), comuni, card (cartolina), app (interfaccia)
  data/               generato dal workflow (ODbL)
scripts/
  fetch-data.mjs      scarica l'estratto OSM, lo filtra con osmium e scrive app/data
  lib/pbf.mjs         export di osmium → elementi (baricentri, confine italiano)
  lib/osm.mjs         elementi → file compatti (funzioni pure)
  serve.mjs           server statico locale su /dove-raga/
  make-icons.mjs      icone PNG da app/icon.svg
  stili.mjs           screenshot e tavola della direzione grafica (docs/stili)
  screenshots.mjs     screenshot del collaudo in docs/screenshot/
test/unit/            test con node:test
test/e2e/             test Playwright su viewport di telefono
prototipo/            la prima versione di Lorenzo («Dado del Sushi»)
```

## Comandi

```
npm ci
npm run serve          # http://localhost:4173/dove-raga/
npm test               # test unitari
npm run test:e2e       # test end-to-end (Playwright, Chromium)
npm run data           # rigenera app/data dall'estratto OSM (serve osmium-tool)
npm run screenshots    # screenshot in docs/screenshot/
```

## Workflow GitHub Actions

- `ci.yml`: test unitari ed end-to-end a ogni push e pull request.
- `data.yml`: aggiorna la copia dei dati nel repo sui rami di lavoro (a mano o quando cambiano gli script dei dati).
- `pages.yml`: pubblica su GitHub Pages **solo da `main`**; riparte ogni lunedì per avere dati freschi. Serve abilitare Pages nelle impostazioni del repo con sorgente «GitHub Actions».

## Licenze

- Dati © contributori [OpenStreetMap](https://www.openstreetmap.org/copyright), licenza ODbL 1.0 (vedi `app/data/LICENSE.txt`).
- Caratteri Bricolage Grotesque e Rubik: SIL Open Font License 1.1 (`app/fonts/`).
