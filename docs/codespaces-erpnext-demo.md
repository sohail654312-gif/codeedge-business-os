# ERPNext demo in GitHub Codespaces

This setup lets CodeEdge test ERPNext without installing Docker on the user's Windows machine.

## What runs where

- Laptop: browser only
- GitHub Codespace: Node.js, Docker-in-Docker, CodeEdge repository
- Nested Docker: ERPNext, Frappe, MariaDB, Redis, workers
- Port 8080: ERPNext
- Port 3000: CodeEdge Business OS

## Start the demo

Create a Codespace for this repository. After the Codespace finishes building, open its terminal and run:

```bash
npm run erpnext:demo:start
```

The first run downloads ERPNext images and can take several minutes.

The script uses the official `frappe/frappe_docker` repository and its disposable `pwd.yml` setup.

ERPNext demo credentials:

- Username: `Administrator`
- Password: `admin`

When port 8080 is forwarded, open the Codespaces port named **ERPNext Demo**.

## Stop without deleting demo data

```bash
npm run erpnext:demo:stop
```

## Completely reset the disposable demo

```bash
npm run erpnext:demo:reset
```

The reset command requires typing `RESET` before volumes are deleted.

## Important

This environment is for evaluation only. Do not put real customer, financial, banking, payroll, tax or production data into it.

If ERPNext proves suitable, create a proper long-term ERPNext deployment and connect CodeEdge to that instead.
