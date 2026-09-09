# @burhanshaikh-9/strapi-plugin-content-versioning

[![npm version](https://img.shields.io/npm/v/@burhanshaikh-9/strapi-plugin-content-versioning.svg)](https://www.npmjs.com/package/@burhanshaikh-9/strapi-plugin-content-versioning)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Strapi 5](https://img.shields.io/badge/Strapi-v5-purple.svg)](https://strapi.io)

> A production-grade, schema-agnostic Content Versioning & Revision Control plugin built specifically for **Strapi 5**.

Easily manage revision histories, deeply inspect historical snapshots (including nested components, repeatable fields, dynamic zones, and media), and instantly revert back to any previous version with 1-click directly from the Strapi Content Manager.

---

## ✨ Features

- **🕒 Revision History Modal**: Accessible directly from the header of the Strapi Content Manager edit view.
- **👁️ Deep Revision Preview**:
  - Open a dedicated popup preview for any revision (both past snapshots and active documents).
  - **Structured Document View**: Displays all content fields in a clean, readable layout.
  - **Deep Dynamic Zones & Nested Components**: Fully inspects dynamic zones, repeatable components, nested components, and media assets with image previews.
  - **Raw JSON View**: Inspect the complete raw snapshot with syntax highlighting and a 1-click **Copy JSON** button.
- **🔄 Instant 1-Click Revert**: Safely restore content fields, dynamic zones, nested components, and relation references into your active draft entry without manual copy-pasting.
- **🔢 Sequential Version Numbers**: Clear, ascending revision numbers (`1, 2, 3...`), always keeping the active version highlighted with a `CURRENT` badge.
- **🛡️ Unique Constraint & DB Safety**: Prevents PostgreSQL, SQLite, and MySQL unique key constraint conflicts by safely suffixing historic snapshots while preserving clean URLs and slugs for active/published entries.
- **📦 Auto-Retention (Max 10 Revisions)**: Keeps database storage lightweight and optimized by maintaining up to 10 sequential revisions (9 historic snapshots + 1 active) and automatically purging older snapshots.
- **⚡ 100% Schema-Agnostic**: Zero hardcoded models or fields. Operates cleanly with any collection type, single type, component structure, or localized content.

---

## ⚙️ Installation

Install the package in your Strapi project:

```bash
# Using npm
npm install @burhanshaikh-9/strapi-plugin-content-versioning

# Using yarn
yarn add @burhanshaikh-9/strapi-plugin-content-versioning
```

---

## 🔧 Configuration

Enable the plugin in your Strapi configuration:

### JavaScript (`config/plugins.js`)
```javascript
module.exports = {
  // ...
  'content-versioning': {
    enabled: true,
  },
};
```

### TypeScript (`config/plugins.ts`)
```typescript
export default {
  // ...
  'content-versioning': {
    enabled: true,
  },
};
```

---

## 📝 Enabling Versioning on Content Types

To enable revision control for a content type:

### Option A: Via Content-Type Builder UI
1. Go to **Content-Type Builder** in the Strapi admin panel.
2. Edit your desired collection or single type.
3. Click the **Advanced Settings** tab.
4. Check **Enable content versioning** and save.

### Option B: Via `schema.json`
Add `pluginOptions.versions.versioned: true` to the content type's `schema.json`:

```json
{
  "kind": "collectionType",
  "collectionName": "articles",
  "info": {
    "singularName": "article",
    "pluralName": "articles",
    "displayName": "Article"
  },
  "options": {
    "draftAndPublish": true
  },
  "pluginOptions": {
    "versions": {
      "versioned": true
    }
  },
  "attributes": {
    ...
  }
}
```

Rebuild your Strapi admin panel:

```bash
npm run build
npm run dev
```

---

## 🚀 How to Use

1. Open any versioned entry in the **Strapi Content Manager**.
2. Click the **Revisions** action button in the top right header bar.
3. In the Revisions modal:
   - **Preview**: Click the eye icon next to any revision to open the **Revision Preview** popup. Switch between **Document Fields** (structured components, dynamic zones, media) and **Raw JSON**.
   - **Revert**: Click **Revert** next to any previous revision to restore its content into your current entry.
4. Review the restored fields and click **Save** or **Publish** when ready.

---

## 👨‍💻 Author & Repository

- **Repository**: [https://github.com/BurhanShaikh-9/strapi-plugin-content-versioning](https://github.com/BurhanShaikh-9/strapi-plugin-content-versioning)
- **Author**: [BurhanShaikh-9](https://github.com/BurhanShaikh-9)
- **Issues & Contributions**: [GitHub Issues](https://github.com/BurhanShaikh-9/strapi-plugin-content-versioning/issues)

---

## 📄 License

[MIT](LICENSE) &copy; 2026 BurhanShaikh-9
