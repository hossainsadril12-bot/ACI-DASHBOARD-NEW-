# Questions for the client (Media Mind), 17 Nov 2026

Hello,

The dashboard is moving well. Phase 1 is finished and the upload pipeline (Phase 2) is nearly done. We need four answers from you. None of them stops our work today, but each one changes how we ship.

1. **Node version on your server.** Which version of Node.js is installed where the dashboard will run? Our app needs Node 22.12 or newer. The PRD says Node 18 or newer. If your server is older, we will ship a self-contained package (a Docker image or a standalone build), so you do not have to upgrade.

2. **One database file.** We store all data in one SQLite file on your server, with a folder next to it for photos and your original uploads. There is no database server to install or pay for. Backup is a copy of that one file. Is this OK for you?

3. **PowerPoint slide template.** Please send the PowerPoint template (the .pptx or .potx file) you want the PowerPoint download to use. We need it before we build the PowerPoint download in Phase 5.

4. **"Detect automatically".** We read this as: you keep uploading your usual Excel files exactly as they are, with no new template, and the system works out the file type itself. It shows you what it found in a preview before anything is saved. Is this what you mean?

5. **Your business and brand list.** You will be able to create businesses and brands yourself in the dashboard. The list starts empty, and you build it from your first uploads: when a file has a business the dashboard doesn't know yet, it asks you once whether it is new or the same as one you already have (for example "ACI Salt" is the same as Salt). Is it OK to start with an empty list?

Thank you.
