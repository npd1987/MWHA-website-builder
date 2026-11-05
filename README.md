# MWHA Website Builder

A Squarespace-style drag-and-drop website builder for customers of
[mywebhostingaccount.com](https://mywebhostingaccount.com) (WHMCS + cPanel hosting).
Customers design on a snap grid, then publish a fast static site straight into
their own cPanel `public_html` folder.

**Status: phase 0 prototype.** It proves the two riskiest parts: the grid editor,
and publishing into a cPanel account with a reseller's API access. There is no
WHMCS module, login, or server yet.

## What's here

| Folder | What it is |
| --- | --- |
| `apps/editor` | The editor (React + Vite). 24-column snap grid on desktop, separate 8-column mobile layout, drag, resize, layering, inline text editing, undo/redo, multiple pages, theme fonts and colours. Saves in the browser and to a `site.json` file. |
| `packages/site-model` | The site data format, grid layout rules (including the automatic mobile layout) and the static HTML renderer. Shared by the editor and the publisher, so the editor shows exactly what gets published. |
| `tools/publisher` | Command-line tool that builds the site and uploads it to a cPanel account through the cPanel API. Never deletes files, and refuses to overwrite a site it didn't create unless you pass `--force`. |
| `examples/sample-site.json` | The starter template as a saved file. |

## Try the editor

Needs Node.js 22.18 or newer.

```sh
npm install
npm run dev
```

Open http://localhost:5173. Click a block to select it, drag to move, drag the
round handles to resize, double-click text to edit it. Switch to **Mobile** to
arrange the phone layout separately (it's automatic until you move something).
**Preview** opens the page exactly as it will be published. **Save file**
downloads `site.json` for the publisher.

## Publish to a cPanel account

Use a **test cPanel account** first, not a customer's live site.

```sh
cp .env.example .env        # then fill in the server, account and token
node --env-file=.env tools/publisher/src/cli.ts check
node --env-file=.env tools/publisher/src/cli.ts publish --site site.json --dry-run
node --env-file=.env tools/publisher/src/cli.ts publish --site site.json
```

- With a reseller WHM token (`WHM_USER`/`WHM_TOKEN`) the tool asks WHM for a
  cPanel API token on that account that expires after one hour, then uploads with it.
- `--dir public_html/test` publishes into a sub-folder (create it in File Manager first).
- `build --site site.json --out dist` writes the HTML files locally instead.
- A small `mwha-builder.json` file is written next to the site so the next
  publish knows which files belong to the builder.

## Development

```sh
npm test          # site model + publisher tests (publisher runs against a fake cPanel server)
npm run typecheck
npm run build     # production build of the editor
```

The plan for later phases (WHMCS module and single sign-on, hosted builder
server, templates, forms, importers, blog, store) is in the project plan document.

## License

MIT
