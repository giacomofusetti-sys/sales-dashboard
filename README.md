# Sales Control — Vendite vs Budget 2026

Dashboard web per il controllo delle vendite vs budget aziendale.
Gira interamente nel browser — nessun server, nessun costo.

## Funzionalità

- Upload budget una-tantum ad inizio anno
- Upload vendite mensili ogni mese
- Scostamento fatturato e acquisito vs budget (venditori e interno)
- Vista per singolo cliente con filtro agente e ricerca
- Vista per agente con espansione clienti (click per espandere)
- Trend mese/mese e YTD cumulato da gennaio all'ultimo mese caricato
- Rilevamento nuovi clienti automatico: evidenziati con stella, aggiunti in fondo
- Dati persistenti nel browser (localStorage)

## Sviluppo locale

```bash
npm install
npm run dev
```

## Deploy su Vercel (prima volta — ~5 minuti)

### 1. Pubblica su GitHub
```bash
git init
git add .
git commit -m "primo commit"
# Crea repo su github.com, poi:
git remote add origin https://github.com/TUO_USERNAME/sales-dashboard.git
git branch -M main
git push -u origin main
```

### 2. Collega Vercel
1. Vai su vercel.com → Add New Project
2. Seleziona il repo sales-dashboard
3. Framework: Vite (rilevato automaticamente)
4. Clicca Deploy

Il sito sarà online in ~1 minuto.

### Aggiornamenti futuri
```bash
git add .
git commit -m "aggiornamento"
git push
```
Vercel aggiorna automaticamente in 30 secondi.
