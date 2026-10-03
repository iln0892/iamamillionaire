# millionaire · Dein Lotto-Labor

Persönliches Lotto-Labor zur Analyse von LOTTO 6aus49 und Eurojackpot. Deutsche Oberfläche, offizielles WestLotto-Archiv, lokale SQLite-Datenbank, regelbasierte Tipps und ein Cloud-KI-Assistent über Vercel AI SDK und AI Gateway. Kein Login.

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
- KI-Assistent mit lesenden Werkzeugen für offizielle Statistiken, Filter und jeweils die ersten drei erzeugten bzw. gespeicherten Tippfelder.
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

GitHub Pages: [iln0892.github.io/iamamillionaire](https://iln0892.github.io/iamamillionaire/). Die statische Version bietet das regelbasierte Labor und verlinkt für den Cloud-Assistenten auf Vercel. Die App und der Quellcode sind öffentlich zugänglich; persönliche Sicherungsdateien werden nicht veröffentlicht. Deployment-Quellcode enthält keine API-Schlüssel. [GitHub-Dokumentation](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).

## Production über Vercel / main

Vercel ist ebenfalls mit dem GitHub-Repository und `main` verbunden. `vercel.json` legt das Framework `vite`, den Install-Befehl `npm ci`, den Build-Befehl `npm run build:vercel` und das Ausgabe-Verzeichnis `docs` fest. Die Root Directory bleibt leer, da `package.json` im Repository-Hauptverzeichnis liegt. Das Projekt benötigt kein Next.js.

Production mit KI: [iamamillionaire.vercel.app](https://iamamillionaire.vercel.app/). Der serverseitige Endpunkt `api/assistant.ts` wird als Vercel Node.js Function bereitgestellt; offizieller SQLite-Snapshot und WASM werden in die Function aufgenommen. Die Gateway-Authentifizierung erfolgt automatisch über die Projekt-OIDC-Identität. Es wird kein Schlüssel an den Browser gesendet.

`npm run build:vercel` erzeugt einen Build mit Basis-Pfad `/` für die Vercel-Domain. Der reguläre `npm run build` erzeugt weiterhin den GitHub-Pages-Build mit `/iamamillionaire/`; ausschließlich dieser Build wird in `docs/` committed. Vercel baut bei jedem Push auf `main` selbst neu. [Vercel-Konfiguration](https://vercel.com/docs/project-configuration/vercel-json).

## KI

Das Orakel erzeugt Tipps mit lokalen Regeln und kryptografischem Zufall. Der KI-Assistent erklärt diese Auswahl und historische Statistiken; er verändert keine Regeln und erzeugt keine Tippfelder. Generierte Felder bleiben beim Wechsel zum Assistenten für die aktuelle Sitzung erhalten. Auf Vercel einfach „KI-Assistent“ öffnen und eine Frage senden; kein Modell-Download und keine WebGPU nötig.

Serverseitig laufen AI SDK 7 und `google/gemini-2.5-flash` über [Vercel AI Gateway](https://vercel.com/docs/ai-gateway). Das Modell nutzt lesende Werkzeuge für Häufigkeiten/Pausen/Summen, aktive Regeln, vorhandene Felder und die letzte Ziehung. Konkrete Statistikwerte werden aus dem offiziellen Archiv berechnet. Lokale Import-Ziehungen sind nicht Bestandteil dieses Archivs. Aktuelle Filter und die Filter zum Erzeugungszeitpunkt bleiben getrennt.

Bei jeder Frage gehen die aktuelle Frage, höchstens zwei vorherige Frage-Antwort-Paare, Zeitraum, Filter sowie jeweils höchstens drei erzeugte und drei gespeicherte Tippfelder an den Server; die benötigten Werte werden über das Gateway an Google Gemini übertragen. Freie Importtexte, Tippbeschreibungen, IDs und Sicherungsdateien werden nicht übernommen. Die App speichert den Chat nur im Arbeitsspeicher; Spielwechsel und „Neues Gespräch“ leeren ihn. SDK-Telemetrie und die Ausgabe von Fragen in Anwendungslogs sind deaktiviert. Die Gateway-Option `disallowPromptTraining` ist aktiv. Dies ist kein vollständig lokaler Chat.

Der Server validiert Rollen, Größen, Zeiträume und Zahlenbereiche. Nutzer können kein Modell, Systemprompt oder Werkzeug vorgeben. Maximal 32 KiB pro Anfrage, 1.000 Zeichen pro Frage, drei Modell-Schritte, 700 Ausgabetokens pro Schritt und 55 Sekunden Gesamtlaufzeit. Die Vercel Firewall begrenzt `POST /api/assistant` auf 10 Anfragen pro Minute und IP. Das Gateway verbraucht das vorhandene Guthaben; kein Guthabenkauf oder automatisches Aufladen wurde eingerichtet. Bei ausgeschöpftem Guthaben zeigt der Chat einen Fehler. Das regelbasierte Labor funktioniert weiter.

Antworten werden als Text gestreamt und können Fehler enthalten. Ein zusätzlicher Textcheck verwirft typische unbelegte Gewinnprognosen, kann aber nicht alle Fehler erkennen.

Für lokale Arbeit am Backend mit vorhandener Vercel-Anmeldung:

```sh
vercel link
vercel env pull .env.local
vercel dev
```

`.env.local` und `.vercel/` sind vom Repository ausgeschlossen. `npm run dev` startet nur das Frontend; der KI-Endpunkt benötigt `vercel dev` oder die Production-App. [OIDC-Authentifizierung](https://vercel.com/docs/ai-gateway/authentication-and-byok/oidc).

## Prüfung

`npm test` prüft den vollständigen Snapshot, historische Grenzen, falsche Imports, Filter, Gewinnklassen, Reproduzierbarkeit, den Ausschluss zukünftiger Daten und die Spiel-/Zeitraumtrennung im KI-Kontext. `npm run build` prüft TypeScript und erzeugt den Production-Build. Echte Modellantworten sowie Desktop-/Mobilansichten werden zusätzlich im Browser geprüft.

18+. Keine Gewinngarantie. [Hilfe bei Glücksspielproblemen](https://www.check-dein-spiel.de/).
