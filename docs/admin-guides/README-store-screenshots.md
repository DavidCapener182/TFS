# Store / CRM screenshots for the admin guide

The PDF guide references three screenshots for the Store / CRM section:

- `stores-step-1-detail.png` – Store detail page with Contacts / Store Notes / Contact Tracker tabs
- `stores-step-2-add-contact.png` – Add contact form
- `stores-step-3-new-note.png` – New store note form

## Capture them automatically

1. Start the app: `npm run dev`
2. Run the capture script **with a visible browser** so you can log in:
   ```bash
   HEADLESS=0 node scripts/capture-store-crm-screenshots.js
   ```
3. When the browser opens, log in if you’re not already. The script waits ~8 seconds, then up to ~20 seconds more if it sees a login page.
4. It will then go to Stores, open the first store, and save the three PNGs into `docs/admin-guides/`.
5. Regenerate the PDF (see project docs or run the PDF build script).

## Capture them manually

1. Log in to the app and open **Stores**.
2. Open any store so you see the CRM panel (Contacts, Store Notes, Contact Tracker).
3. Take a screenshot of the CRM panel (tabs + content) → save as `stores-step-1-detail.png` in this folder.
4. Click **Add Contact**, then screenshot the form → `stores-step-2-add-contact.png`.
5. Click **Store Notes**, then **New Note**, then screenshot the form → `stores-step-3-new-note.png`.
6. Regenerate the PDF.
