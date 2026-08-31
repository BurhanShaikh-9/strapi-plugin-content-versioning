# @burhanshaikh-9/strapi-plugin-content-versioning

> A powerful, seamless Content Versioning & Revision Control plugin for **Strapi 5**.

Easily manage multiple revisions of your content entries, preview past versions, and instantly revert back to any historical snapshot directly from the Strapi Content Manager.

---

## ✨ Features

- **🕒 Revision History Modal**: Accessible directly from the top header of the Content Manager Edit View.
- **🔄 Instant 1-Click Revert**: Easily restore content fields, component data, and attributes from any previous version back into your active entry.
- **🔢 Sequential Version Numbers**: Clear, ascending version numbering (`1, 2, 3, 4...`), keeping your current active version highlighted.
- **🛡️ Unique Attribute Safety**: Prevents PostgreSQL unique constraint conflicts by cleanly suffixing historic version snapshots while preserving clean, original URLs for published content.
- **⚡ Strapi 5 Compatible**: Engineered specifically for Strapi 5 Document Service & Content Manager API contracts.

---

## ⚙️ Installation

Add the plugin to your Strapi application's `package.json`:

```json
{
  "dependencies": {
    "@burhanshaikh-9/strapi-plugin-content-versioning": "file:../strapi-plugin-content-versioning-main"
  }
}
```

Then install dependencies and rebuild your Strapi admin panel:

```bash
npm install
npm run build
npm run dev
```

---

## 🚀 How to Use

1. Open any content entry in the **Strapi Content Manager**.
2. Click the **Revisions** action button in the top right header bar.
3. Browse up to 10 stored historical revisions of your entry with exact timestamps and author details.
4. Click **Revert** next to any previous version to instantly restore its fields into your active entry.
5. Save or Publish your restored content when ready.

---

## 👨‍💻 Author & Maintainer

Created and maintained by **[BurhanShaikh-9](https://github.com/BurhanShaikh-9)**.

## 📄 License

[MIT License](LICENSE) &copy; 2026 BurhanShaikh-9
