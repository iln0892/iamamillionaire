# millionaire · Dein Lotto-Labor

Persönliches Lotto-Labor zur Analyse von LOTTO 6aus49 und Eurojackpot. Deutsche Oberfläche, offizielles WestLotto-Archiv, lokale SQLite-Datenbank, regelbasierte Tipps und ein lokaler KI-Assistent. Kein Login und keine externen KI-API-Aufrufe.

## Starten

Node.js 22.12 oder neuer:

```sh
npm ci
npm run dev
```

Die App läuft unter `http://127.0.0.1:5173/iamamillionaire/`. Schriften, SQLite-WASM und Ziehungsdaten werden mit der App ausgeliefert. Persönliche Tipps und Imports bleiben in IndexedDB auf diesem Gerät. JSON-Sicherungen können auf einem anderen Gerät importiert werden.

## Funktionen

- Ziehungsarchiv mit Datum-/Zahlensuche, Jahresfilter, Gewinnquoten und historischen Varianten.
- Häufigkeiten, Ziehungsabstände, Summen, Parität und Dekaden.
- Regelbasierte Tipps mit konfigurierbaren Filtern, Quicktipp, Speichern und Export.
- KI-Assistent mit echten, lokal im Browser berechneten Antworten zu Filtern, Statistiken und den ersten drei zuletzt erzeugten Tippfeldern.
- Häufige Zahlenpaare und Tripel sowie rollierende Häufigkeitsverläufe.
- Backtests in einem Worker: gleiche Anzahl Felder, unabhängige Zufallsstrategie, reproduzierbarer Seed, zeitlich korrekte Historie.
- JSON-/CSV-Import mit Prüfung und Transaktion; Konflikte überschreiben keine Ziehungen. Export als JSON, CSV und SQLite.

Jede Kombination hat dieselbe Gewinnchance. Scores sind Regelbewertungen, keine Wahrscheinlichkeiten. Hot/Cold und Wellentheorie beschreiben vergangene Daten. Der Geburtstagfilter behauptet keinen belegten Teilungsvorteil.

## Daten aktualisieren

```sh
python3 -m venv .venv
.venv/bin/pip install -r scripts/requirements.txt
.venv/bin/python scripts/update-data.py
npm test
npm run build
```

Das Skript lädt offizielle WestLotto-ZIP-Dateien, validiert Daten und erzeugt `public/data/lottery.sqlite` sowie `manifest.json` mit Quelladressen und SHA-256-Prüfsummen. Mit `--through JJJJ-MM-TT` lässt sich ein Stichtag festlegen. Fehler ersetzen keinen bestehenden Datenbestand.

Quelle: [WestLotto Downloads](https://www.westlotto.de/service/downloads/downloads.html). Enthalten sind Lotto ab 1955, Mittwoch A/B ab 04.06.1986 und Eurojackpot ab 23.03.2012. Das ehemalige Mittwochsspiel 7 aus 38 ist ausgeschlossen. Sonderziehungen sind getrennt gekennzeichnet. Historische Superzahlen fehlen bei uneindeutigen Angaben. Eurozahlen werden gegen die zum Datum gültigen Bereiche geprüft (8/10/12).

Finanzielle Backtests nutzen ausschließlich standardisierte Quoten ab 2022. Unbesetzte Klassen haben `null`, keine erfundene Auszahlung. Die Kosten verwenden die heutigen Feldpreise von 1,20 € bzw. 2,00 € ohne Scheingebühren. Historische Quoten bleiben Näherungen, da zusätzliche Gewinner die Quote verändern könnten. Ein einzelner Test belegt keinen Prognosevorteil.

## Production über GitHub / main

Das Repository ist öffentlich. Der fertige Build liegt versioniert in `docs/`; `.nojekyll` deaktiviert Jekyll. GitHub Pages wird auf `main` und `/docs` eingerichtet. Damit veröffentlicht ein Push auf `main` die geprüften Dateien automatisch über GitHubs Pages-Pipeline. Für neue Änderungen:

```sh
npm ci
npm test
npm run build
git add src public scripts tests package.json package-lock.json docs README.md
git commit -m "Update lottery lab"
git push origin main
```

Production: [iln0892.github.io/iamamillionaire](https://iln0892.github.io/iamamillionaire/). Die App und der Quellcode sind öffentlich zugänglich; persönliche Daten sind gerätelokal und werden nicht veröffentlicht. Deployment-Quellcode enthält keine API-Schlüssel. [GitHub-Dokumentation](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).

## KI

Das Orakel erzeugt Tipps unverändert mit lokalen Regeln und kryptografischem Zufall. Der KI-Assistent erklärt diese Auswahl und historische Statistiken; er verändert keine Regeln, erzeugt keine Tippfelder und prognostiziert keine Gewinner. Generierte Felder bleiben beim Wechsel zum Assistenten für die aktuelle Sitzung erhalten. Für die erste Nutzung „KI-Assistent“ öffnen und „KI laden & starten“ anklicken.

Die KI verwendet [WebLLM](https://github.com/mlc-ai/web-llm) 0.2.85 in einem eigenen Worker. Zur Wahl stehen [Qwen3.5](https://huggingface.co/Qwen/Qwen3.5-4B) 4B (etwa 2,4 GB erster Download, etwa 4 GB GPU-Speicher) und Qwen3.5 2B (etwa 1,1 GB Download, etwa 2,3 GB GPU-Speicher, einfachere Antworten). Benötigt HTTPS oder localhost, WebGPU mit `shader-f16` und ausreichend Speicher. Die Browser-App bleibt ohne passende Hardware als regelbasiertes Labor benutzbar.

Modellgewichte und Tokenizer werden erst beim Start von Hugging Face, die Modellbibliothek von MLC über GitHub geladen und in separaten IndexedDB-Modellspeichern gecacht. Vorübergehende Downloadfehler werden mit begrenzten automatischen Wiederholungen behandelt; bereits gecachte Dateien werden wiederverwendet. Fragen, persönliche Tippfelder und berechnete Kontextdaten werden nicht an diese Anbieter gesendet. Der Gesprächsverlauf bleibt im Arbeitsspeicher für die Sitzung; Spielwechsel und „Neues Gespräch“ leeren ihn. Der Modellcache kann separat gelöscht werden, ohne die Lotto-Datenbank zu verändern. Antworten werden als Text gerendert und können Fehler enthalten.

Der Kontext unterscheidet Archiv und gewählten Analysezeitraum sowie aktuelle Filter und die Filter zum Erzeugungszeitpunkt. Freie Importtexte werden nicht als Kontext übernommen. Pro Anfrage werden maximal die letzten zwei Frage-Antwort-Paare und die aktuelle Frage verwendet. Antworten sind auf 420 Tokens begrenzt. Ein zusätzlicher Textcheck verwirft typische unbelegte Gewinnprognosen, kann aber nicht alle Fehler erkennen. Keine externen API-Schlüssel, laufenden KI-API-Kosten oder zusätzlicher Backend-Dienst nötig. Die Modell-Lizenz ist Apache 2.0; Hinweise zur Runtime liegen in `public/licenses/`.

Eine spätere OpenAI-Anbindung kann über einen separaten Backend-Dienst erfolgen. API-Schlüssel gehören dabei ausschließlich auf den Server, niemals in die öffentliche statische App: [offizielle OpenAI-Dokumentation](https://developers.openai.com/api/reference/overview).

## Prüfung

`npm test` prüft den vollständigen Snapshot, historische Grenzen, falsche Imports, Filter, Gewinnklassen, Reproduzierbarkeit, den Ausschluss zukünftiger Daten und die Spiel-/Zeitraumtrennung im KI-Kontext. `npm run build` prüft TypeScript und erzeugt den Production-Build. Echte Modellantworten sowie Desktop-/Mobilansichten werden zusätzlich im Browser geprüft.

18+. Keine Gewinngarantie. [Hilfe bei Glücksspielproblemen](https://www.check-dein-spiel.de/).
