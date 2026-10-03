# millionaire · Dein Lotto-Labor

Private Einzelbenutzer-App zur Analyse von LOTTO 6aus49 und Eurojackpot. Deutsche Oberfläche, offizielles WestLotto-Archiv, lokale SQLite-Datenbank, kein Login und keine externen KI-Aufrufe.

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

Das Repository bleibt privat. Der fertige Build liegt versioniert in `docs/`; `.nojekyll` deaktiviert Jekyll. GitHub Pages wird auf `main` und `/docs` eingerichtet. Damit veröffentlicht ein Push auf `main` die geprüften Dateien automatisch über GitHubs Pages-Pipeline. Für neue Änderungen:

```sh
npm ci
npm test
npm run build
git add src public scripts tests package.json package-lock.json docs README.md
git commit -m "Update lottery lab"
git push origin main
```

GitHub Pages aus einem privaten Repository setzt einen passenden GitHub-Tarif voraus. Die App-URL ist öffentlich zugänglich; persönliche Daten sind gerätelokal und werden nicht veröffentlicht. Deployment-Quellcode enthält keine API-Schlüssel. [GitHub-Dokumentation](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).

## KI

Das Orakel verwendet lokale Regeln und Zufall. Es wird bewusst nicht als KI-Vorhersage dargestellt. Der exportierbare KI-Briefing-Text enthält die verwendeten Daten und verlangt sachliche Erklärungen. Eine echte KI-Anbindung benötigt später einen Server-Endpunkt und dort gespeicherte Zugangsdaten; API-Schlüssel gehören nicht in diese statische Browser-App.

## Prüfung

`npm test` prüft den vollständigen Snapshot, historische Grenzen, falsche Imports, Filter, Gewinnklassen, Reproduzierbarkeit und den Ausschluss zukünftiger Daten aus der Tippauswahl. `npm run build` prüft TypeScript und erzeugt den Production-Build. Die Oberfläche wird zusätzlich auf Desktop und Mobil geprüft.

18+. Keine Gewinngarantie. [Hilfe bei Glücksspielproblemen](https://www.check-dein-spiel.de/).
