# Ashyq Dala Partner Desk

A local workspace for selling and delivering Kazakhstan company-research briefs. It includes a sales pipeline, evidence ledger, report exports, a customizable public offer, nine researched prospect suggestions, and a 21-day launch checklist.

## Start in five minutes

1. Open **`dist/Ashyq_Dala_Desk.html` in a normal browser** such as Chrome, Edge, Firefox or Safari. Download the file first if an attachment preview does not allow interaction. No installation or account is required.
2. Select **Explore example**. Inspect the fictional opportunity and sample research brief, then select **Return to my work**. Example data is separate from your actual workspace.
3. In your own workspace, open **Offer & settings**. Enter your name and **Receiving email**, check the pilot price, and save. Optionally add your HTTPS booking link and a payment link you control. Confirm the deposit amount and currency in your payment provider. The payment link appears only in proposals for active or delivered jobs.
4. Select **Preview**, then **Export sales page**. Open the downloaded standalone offer and test its request form with harmless sample details. Check that the email draft points to your inbox. **Publish or share only this exported public offer. Keep the desk, client briefs and backups private.** The bundled `dist/Ashyq_Dala_Offer.html` starts without your receiving email; export a configured version from the desk before using it commercially.
5. Add one real opportunity in **Sales pipeline**, including the next action and follow-up date. Use **Research desk** for an agreed research job. Start with the exact company, client question and deadline. The longer sales routine is in `Launch_Plan.md`.

## What the request form does

The public offer prepares an email draft and allows the visitor to copy or download a JSON request. **Nothing is submitted to a server.** The visitor must send the email or otherwise share the request. If their email app does not open, they can copy the request into webmail. Received request JSON can be imported through **Offer & settings → Restore / import request**.

This package does not host a website, send outreach, collect or process payments, generate tax invoices, or verify receipts. Payment amounts in the desk are manually recorded. Hosting and any external booking or payment service are configured separately.

## Deliver a real brief

- Gather evidence manually and add source links or document references, source/access dates, company identifiers, findings, attribution notes and permitted use. CSV imports require review too.
- Check your right to include third-party information in a client deliverable. A public page or paid subscription does not automatically permit redistribution.
- Write the assessment and explicitly record unavailable sources and unresolved matches. A matching name alone does not establish the correct company.
- Complete the review checklist and analyst sign-off before downloading a **reviewed brief**. Incomplete work exports as a **draft**. “Reviewed” records your review; it is not independent certification. Fictional examples stay labeled as fictional.
- Preview the export before sharing it. Internal notes are excluded from client briefs. Client reports still contain client and research information and should be sent only to the intended recipient. A browser's Print command can save an exported HTML brief as a PDF.

There is **no live registry connection, automated research, sanctions clearance or automatic risk score**. The tool does not establish that a company is safe. You remain responsible for the evidence, interpretation and agreed scope. Prospect suggestions indicate public service or country fit; they are not interested buyers, customers or endorsements. The USD 250 pilot price and revenue scenarios are experiments, not income promises.

## Keep your work

The desk saves in this browser when browser storage is available. There is no login, encryption or cloud synchronization. Browser settings, private browsing, clearing storage, moving the file or switching devices may make saved work unavailable. Watch the save-status message.

Use **Save backup** or **Offer & settings → Download backup** regularly and before a browser/device change. Keep JSON backups in a secure private location; they contain your workspace data. Use **Restore / import request** to restore a backup. Never upload a workspace backup to a public host or include it with the public offer. Use a private device and avoid unnecessary personal or sensitive information.

## Source and rebuild

The ready-to-open files are in `dist/`. Source templates and scripts are in `src/`; no third-party package installation is required for the build. From this project folder:

```bash
python build.py
node tests/core.cjs
```

The build recreates the standalone desk and default public offer. The tests cover core application behavior; they do not verify external research, customer demand, source permissions or payment-provider configuration. After changing source files, rebuild and open the generated desk in your browser. Export a fresh configured sales page whenever your public details or offer change.
